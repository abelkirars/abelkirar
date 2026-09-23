import "server-only";

import { z } from "zod";
import { courseAdmin, serializable } from "./admin-service";
import { assertFourSeats, assertRelationship } from "./preparation-rules";
import { expireInitialPaymentInTransaction } from "./expire-initial-payments";
import { enqueueCoursePaymentNotification } from "@/lib/notifications/course-payment-outbox";
import { paymentReviewedEmail } from "@/lib/notifications/course-payment-content";

export class CoursePaymentReviewError extends Error {}

export const reviewCoursePaymentSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("VERIFY"), submissionId: z.string().min(1), confirmation: z.literal(true) }).strict(),
  z.object({
    action: z.literal("REJECT"), submissionId: z.string().min(1), confirmation: z.literal(true),
    reason: z.string().trim().min(5, "Give a useful reason (at least 5 characters)").max(1000),
  }).strict(),
]);

/** The caller supplies only the action and the attempt they actually reviewed. */
export async function reviewCoursePayment(paymentId: string, raw: unknown) {
  const session = await courseAdmin();
  const input = reviewCoursePaymentSchema.parse(raw);
  return serializable(async tx => {
    const admin = await tx.admin.findUnique({ where: { id: session.adminId } });
    if (!admin?.isActive || (admin.passwordChangedAt && session.issuedAt !== undefined
      && session.issuedAt * 1000 < admin.passwordChangedAt.getTime())) {
      throw new CoursePaymentReviewError("Admin authorization is no longer valid");
    }
    await tx.$queryRaw`SELECT id FROM "CoursePayment" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.coursePayment.findUnique({
      where: { id: paymentId },
      include: {
        submissions: { orderBy: { attemptNumber: "desc" } },
        enrollment: { include: { customer: true, student: true, coursePlan: true, application: true, portalAccess: true } },
      },
    });
    if (!payment || payment.kind !== "INITIAL_ENROLLMENT") {
      throw new CoursePaymentReviewError("An initial enrollment payment is required");
    }
    const enrollment = payment.enrollment;
    const submission = payment.submissions.find(s => s.id === input.submissionId);
    if (!submission || payment.submissions[0]?.id !== submission.id) {
      throw new CoursePaymentReviewError("This is not the latest submission; reload before reviewing");
    }
    const dto = (idempotent: boolean, status: "VERIFIED" | "PENDING" | "EXPIRED") => ({
      idempotent, paymentId, submissionId: submission.id, status,
      customerEmail: enrollment.customer.email,
      locale: enrollment.application?.locale || enrollment.customer.locale || "en",
      learnerName: enrollment.student.fullName, hasLearnerLogin: Boolean(enrollment.student.supabaseUserId),
      selfPayer: enrollment.student.supabaseUserId === enrollment.customer.supabaseUserId,
      courseCode: enrollment.planCodeSnapshot, amountCents: payment.finalAmountCents,
      currency: payment.currency, deadline: payment.expiresAt,
      reason: input.action === "REJECT" ? input.reason : null,
    });
    if (input.action === "VERIFY" && payment.status === "VERIFIED" && submission.status === "ACCEPTED") {
      return dto(true, "VERIFIED");
    }
    if (input.action === "REJECT" && submission.status === "REJECTED"
      && ["PENDING", "EXPIRED"].includes(payment.status)) {
      if (submission.rejectionReason !== input.reason) throw new CoursePaymentReviewError("This submission already has a recorded rejection");
      // A delayed retry must not leave an overdue rejected obligation open.
      const expired = await expireInitialPaymentInTransaction(tx, paymentId, new Date());
      return dto(true, expired.outcome === "EXPIRED" || payment.status === "EXPIRED" ? "EXPIRED" : "PENDING");
    }
    if (payment.status !== "PROOF_SUBMITTED" || submission.status !== "SUBMITTED"
      || payment.submissions.filter(s => s.status === "SUBMITTED").length !== 1) {
      throw new CoursePaymentReviewError("The payment no longer has this reviewable proof; reload before reviewing");
    }
    if (submission.submittedAt >= payment.expiresAt) throw new CoursePaymentReviewError("The initial proof was not submitted before its deadline");
    await tx.$queryRaw`SELECT id FROM "CourseEnrollment" WHERE id = ${enrollment.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "StudentProfile" WHERE id = ${enrollment.studentId} FOR UPDATE`;
    if (enrollment.status !== "PENDING_PAYMENT" || enrollment.archivedAt || enrollment.portalAccess) {
      throw new CoursePaymentReviewError("Enrollment/access state is incompatible with initial payment review");
    }
    const relationship = await tx.customerStudentRelation.findUnique({ where: {
      customerId_studentId: { customerId: enrollment.customerId, studentId: enrollment.studentId },
    } });
    if (!relationship || relationship.endedAt || relationship.archivedAt
      || enrollment.customer.status !== "ACTIVE" || enrollment.customer.deactivatedAt || enrollment.customer.archivedAt
      || enrollment.student.status !== "ACTIVE" || enrollment.student.archivedAt) {
      throw new CoursePaymentReviewError("The payer/learner relationship is not active");
    }
    assertRelationship(relationship.type, enrollment.customer.supabaseUserId, enrollment.student.supabaseUserId);
    if (enrollment.coursePlan.code !== enrollment.planCodeSnapshot
      || enrollment.coursePlan.level !== enrollment.levelSnapshot || enrollment.coursePlan.format !== enrollment.formatSnapshot
      || (enrollment.application && (enrollment.application.status !== "APPROVED"
        || enrollment.application.customerId !== enrollment.customerId || enrollment.application.studentProfileId !== enrollment.studentId))) {
      throw new CoursePaymentReviewError("Course/application references require review");
    }
    let seatId: string | null = null;
    if (enrollment.formatSnapshot === "GROUP") {
      if (!enrollment.cohortId) throw new CoursePaymentReviewError("The group enrollment has no cohort");
      await tx.$queryRaw`SELECT id FROM "CourseCohort" WHERE id = ${enrollment.cohortId} FOR UPDATE`;
      const cohort = await tx.courseCohort.findUnique({ where: { id: enrollment.cohortId }, include: { seats: true } });
      if (!cohort || cohort.coursePlanId !== enrollment.coursePlanId || cohort.maximumStudents !== 4) {
        throw new CoursePaymentReviewError("Cohort does not match the enrollment");
      }
      assertFourSeats(cohort.seats);
      const seat = cohort.seats.find(s => s.currentEnrollmentId === enrollment.id);
      if (!seat || !seat.assignedAt || seat.reservedUntil?.getTime() !== payment.expiresAt.getTime()) {
        throw new CoursePaymentReviewError("The original cohort seat reservation is missing or inconsistent");
      }
      if (input.action === "VERIFY" && (cohort.archivedAt || !["OPEN", "FULL", "ACTIVE"].includes(cohort.status))) {
        throw new CoursePaymentReviewError("The cohort is no longer eligible for activation");
      }
      seatId = seat.id;
    } else if (enrollment.cohortId || await tx.courseCohortSeat.findUnique({ where: { currentEnrollmentId: enrollment.id } })) {
      throw new CoursePaymentReviewError("A 1-to-1 enrollment cannot have a group seat");
    }
    // Sample review time after acquiring locks, including on transaction retries.
    const reviewedAt = new Date();
    let resultingStatus: "VERIFIED" | "PENDING" | "EXPIRED";
    if (input.action === "VERIFY") {
      if (!enrollment.coursePlan.active || enrollment.coursePlan.archivedAt) throw new CoursePaymentReviewError("The course plan is inactive");
      const concurrent = await tx.courseEnrollment.findFirst({ where: {
        studentId: enrollment.studentId, status: "ACTIVE", id: { not: enrollment.id }, concurrentEnrollmentOverride: false,
      } });
      if (concurrent && !enrollment.concurrentEnrollmentOverride) throw new CoursePaymentReviewError("The learner already has an active enrollment");
      await tx.coursePaymentSubmission.update({ where: { id: submission.id }, data: {
        status: "ACCEPTED", reviewedAt, reviewedByAdminId: admin.id,
      } });
      await tx.coursePayment.update({ where: { id: paymentId }, data: { status: "VERIFIED", verifiedAt: reviewedAt, verifiedByAdminId: admin.id } });
      await tx.courseEnrollment.update({ where: { id: enrollment.id }, data: { status: "ACTIVE" } });
      await tx.coursePortalAccess.create({ data: {
        enrollmentId: enrollment.id, status: "ENABLED", archivedAt: null,
        changedByAdminId: admin.id, changedAt: reviewedAt, reason: "INITIAL_PAYMENT_VERIFIED",
      } });
      if (seatId) await tx.courseCohortSeat.update({ where: { id: seatId }, data: { reservedUntil: null } });
      resultingStatus = "VERIFIED";
    } else {
      await tx.coursePaymentSubmission.update({ where: { id: submission.id }, data: {
        status: "REJECTED", reviewedAt, reviewedByAdminId: admin.id, rejectionReason: input.reason,
      } });
      await tx.coursePayment.update({ where: { id: paymentId }, data: { status: "PENDING" } });
      const expiration = await expireInitialPaymentInTransaction(tx, paymentId, reviewedAt, { enqueueNotification: false });
      resultingStatus = expiration.outcome === "EXPIRED" ? "EXPIRED" : "PENDING";
    }
    await enqueueCoursePaymentNotification(tx, {
      paymentId,
      submissionId: input.action === "REJECT" ? submission.id : null,
      kind: input.action === "VERIFY" ? "PAYMENT_VERIFIED" : "PROOF_REJECTED",
      payload: paymentReviewedEmail({
        paymentId,
        customerEmail: enrollment.customer.email,
        locale: enrollment.application?.locale || enrollment.customer.locale,
        learnerName: enrollment.student.fullName,
        courseCode: enrollment.planCodeSnapshot,
        amountCents: payment.finalAmountCents,
        currency: payment.currency,
        deadline: payment.expiresAt,
        result: resultingStatus,
        reason: input.action === "REJECT" ? input.reason : null,
        selfPayer: enrollment.student.supabaseUserId === enrollment.customer.supabaseUserId,
        hasLearnerLogin: Boolean(enrollment.student.supabaseUserId),
      }),
    });
    if (enrollment.applicationId) await tx.courseApplicationEvent.create({ data: {
      applicationId: enrollment.applicationId, actorAdminId: admin.id,
      fromStatus: "APPROVED", toStatus: "APPROVED",
      note: `Payment ${paymentId}; submission ${submission.id}; review ${input.action}; PROOF_SUBMITTED -> ${resultingStatus}. Original deadline preserved.`,
    } });
    return dto(false, resultingStatus);
  });
}

export type CoursePaymentReviewResult = Awaited<ReturnType<typeof reviewCoursePayment>>;
