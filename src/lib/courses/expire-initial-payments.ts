import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { serializable } from "./admin-service";
import { enqueueCoursePaymentNotification } from "@/lib/notifications/course-payment-outbox";
import { paymentExpiredEmail } from "@/lib/notifications/course-payment-content";

export type InitialPaymentExpirationResult = {
  paymentId: string;
  outcome: "EXPIRED" | "SKIPPED" | "PROOF_REVIEWABLE";
};

export async function expireInitialPaymentInTransaction(
  tx: Prisma.TransactionClient,
  paymentId: string,
  authoritativeNow: Date,
  options: { enqueueNotification?: boolean } = {},
): Promise<InitialPaymentExpirationResult> {
  await tx.$queryRaw`SELECT id FROM "CoursePayment" WHERE id = ${paymentId} FOR UPDATE`;
  const payment = await tx.coursePayment.findUnique({ where: { id: paymentId }, include: {
    enrollment: { include: {
      portalAccess: true, application: true, customer: true, student: true,
      cohort: { include: { coursePlan: true, seats: true } },
    } },
  } });
  if (!payment || payment.kind !== "INITIAL_ENROLLMENT" || payment.status !== "PENDING" || payment.expiresAt > authoritativeNow) {
    return { paymentId, outcome: "SKIPPED" };
  }
  // An inconsistent initial obligation must never disturb active/history-only
  // enrollments or manually enabled access. Leave it for administrator review.
  if (payment.enrollment.status !== "PENDING_PAYMENT" || payment.enrollment.archivedAt
    || payment.enrollment.portalAccess) return { paymentId, outcome: "SKIPPED" };
  const timelyProof = await tx.coursePaymentSubmission.findFirst({ where: {
    paymentId,
    submittedAt: { lt: payment.expiresAt },
    status: { in: ["SUBMITTED", "ACCEPTED"] },
  }, select: { id: true } });
  if (timelyProof) return { paymentId, outcome: "PROOF_REVIEWABLE" };

  await tx.coursePayment.update({ where: { id: paymentId }, data: { status: "EXPIRED" } });
  if (payment.enrollment.status === "PENDING_PAYMENT") {
    await tx.courseEnrollment.update({ where: { id: payment.enrollmentId }, data: {
      status: "CANCELLED",
      cancelledAt: authoritativeNow,
      cancellationReason: "INITIAL_PAYMENT_EXPIRED",
    } });
    if (payment.enrollment.cohortId) {
      const released = await tx.courseCohortSeat.updateMany({
        where: { cohortId: payment.enrollment.cohortId, currentEnrollmentId: payment.enrollmentId },
        data: { currentEnrollmentId: null, assignedAt: null, reservedUntil: null },
      });
      if (released.count > 0 && payment.enrollment.cohort?.status === "FULL" && !payment.enrollment.cohort.archivedAt) {
        await tx.courseCohort.update({ where: { id: payment.enrollment.cohortId }, data: { status: "OPEN" } });
      }
    }
  }
  if (payment.enrollment.applicationId && payment.enrollment.application) {
    await tx.courseApplicationEvent.create({ data: {
      applicationId: payment.enrollment.applicationId,
      fromStatus: payment.enrollment.application.status,
      toStatus: payment.enrollment.application.status,
      actorAdminId: null,
      note: `System: initial payment ${paymentId} expired; enrollment ${payment.enrollmentId} cancelled (INITIAL_PAYMENT_EXPIRED). Original deadline preserved.`,
    } });
  }
  if (options.enqueueNotification !== false) {
    await enqueueCoursePaymentNotification(tx, {
      paymentId,
      kind: "INITIAL_PAYMENT_EXPIRED",
      payload: paymentExpiredEmail({
        customerEmail: payment.enrollment.customer.email,
        locale: payment.enrollment.application?.locale || payment.enrollment.customer.locale,
        learnerName: payment.enrollment.student.fullName,
        courseCode: payment.enrollment.planCodeSnapshot,
      }),
    });
  }
  return { paymentId, outcome: "EXPIRED" };
}

export async function expireInitialPayment(paymentId: string, authoritativeNow = new Date()): Promise<InitialPaymentExpirationResult> {
  return serializable(tx => expireInitialPaymentInTransaction(tx, paymentId, authoritativeNow));
}

/** Domain batch entry point; the scheduled runner adds bounded execution and notification handling. */
export async function expireEligibleInitialPayments(authoritativeNow = new Date(), limit = 100) {
  const candidates = await prisma.coursePayment.findMany({
    where: { kind: "INITIAL_ENROLLMENT", status: "PENDING", expiresAt: { lte: authoritativeNow } },
    select: { id: true },
    orderBy: { expiresAt: "asc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
  const results: InitialPaymentExpirationResult[] = [];
  for (const candidate of candidates) results.push(await expireInitialPayment(candidate.id, authoritativeNow));
  return results;
}
