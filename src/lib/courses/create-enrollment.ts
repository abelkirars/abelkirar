import "server-only";

import type { Prisma } from "@prisma/client";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { upsertVerifiedCustomer, verifiedIdentityFromUser } from "@/lib/customer/dal";
import { assertCohortSelectable } from "./cohorts";
import { courseAdmin, serializable } from "./admin-service";
import { paymentPriceSnapshot } from "./course-payment-pricing";
import { enqueueCoursePaymentNotification } from "@/lib/notifications/course-payment-outbox";
import { paymentRequiredEmail } from "@/lib/notifications/course-payment-content";
import {
  assertRelationship,
  dateOnlyToUtc,
  finalEnrollmentSchema,
  monthlyPeriod,
  PreparationValidationError,
  type FinalEnrollmentInput,
} from "./preparation-rules";

const INITIAL_PAYMENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type Tx = Prisma.TransactionClient;

export type EnrollmentCreationResult = {
  idempotent: boolean;
  learner: { id: string; fullName: string };
  customer: { id: string; email: string; locale: string };
  relationship: "SELF" | "GUARDIAN";
  course: { code: string; level: string; format: string };
  cohort: { id: string; code: string; seatPosition: number } | null;
  enrollment: { id: string; status: string; startsAt: string };
  payment: {
    id: string;
    status: string;
    kind: string;
    periodStart: string;
    periodEnd: string;
    createdAt: string;
    expiresAt: string;
    baseAmountCents: number;
    discountAmountCents: number;
    finalAmountCents: number;
    currency: string;
    promotionName: string | null;
  };
  warnings: ["PAYMENT NOT VERIFIED", "PORTAL ACCESS NOT ACTIVE"];
};

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function existingConversionResult(
  tx: Tx,
  enrollmentId: string,
  input: FinalEnrollmentInput,
  verifiedSupabaseUserId: string,
): Promise<EnrollmentCreationResult> {
  const enrollment = await tx.courseEnrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      student: true,
      customer: true,
      coursePlan: true,
      cohort: true,
      currentCohortSeat: true,
      application: { select: { locale: true } },
      payments: { where: { kind: "INITIAL_ENROLLMENT", revision: 1 }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!enrollment || enrollment.payments.length !== 1) {
    throw new PreparationValidationError("Existing application conversion is incomplete and requires review");
  }
  if (
    enrollment.customer.supabaseUserId !== verifiedSupabaseUserId
    || enrollment.coursePlanId !== input.coursePlanId
    || (input.learner.mode === "EXISTING" && enrollment.studentId !== input.learner.studentId)
    || (input.learner.mode === "NEW" && enrollment.student.fullName !== input.learner.fullName)
    || enrollment.customer.status !== "ACTIVE"
    || enrollment.customer.archivedAt
    || enrollment.customer.deactivatedAt
    || enrollment.student.status !== "ACTIVE"
    || enrollment.student.archivedAt
  ) {
    throw new PreparationValidationError("Application was already converted with different authoritative details");
  }
  assertRelationship(input.relationship, verifiedSupabaseUserId, enrollment.student.supabaseUserId);
  const relation = await tx.customerStudentRelation.findUnique({
    where: { customerId_studentId: { customerId: enrollment.customerId, studentId: enrollment.studentId } },
  });
  if (!relation || relation.type !== input.relationship || relation.endedAt || relation.archivedAt) {
    throw new PreparationValidationError("Existing conversion relationship requires review");
  }
  if (enrollment.formatSnapshot === "GROUP") {
    if (input.cohortId !== enrollment.cohortId || input.agreedStartDate || input.billingTimeZone || !enrollment.cohort || !enrollment.currentCohortSeat) {
      throw new PreparationValidationError("Application was already converted to a different cohort");
    }
  } else if (input.cohortId || !input.agreedStartDate || !input.billingTimeZone || enrollment.billingTimeZone !== input.billingTimeZone || dateKey(enrollment.startsAt!) !== input.agreedStartDate) {
    throw new PreparationValidationError("Application was already converted with a different start date");
  }
  return resultDto(enrollment, enrollment.payments[0], input.relationship, true);
}

function resultDto(
  enrollment: {
    id: string;
    status: string;
    startsAt: Date | null;
    student: { id: string; fullName: string };
    customer: { id: string; email: string; locale: string | null };
    application?: { locale: string } | null;
    coursePlan: { code: string; level: string; format: string };
    cohort: { id: string; code: string } | null;
    currentCohortSeat: { position: number } | null;
  },
  payment: {
    id: string;
    status: string;
    kind: string;
    periodStart: Date;
    periodEnd: Date;
    createdAt: Date;
    expiresAt: Date;
    baseAmountCents: number;
    discountAmountCents: number;
    finalAmountCents: number;
    currency: string;
    promotionNameSnapshot: string | null;
  },
  relationship: "SELF" | "GUARDIAN",
  idempotent: boolean,
): EnrollmentCreationResult {
  if (!enrollment.startsAt) throw new PreparationValidationError("Enrollment start date is missing");
  return {
    idempotent,
    learner: { id: enrollment.student.id, fullName: enrollment.student.fullName },
    customer: {
      id: enrollment.customer.id,
      email: enrollment.customer.email,
      locale: enrollment.application?.locale || enrollment.customer.locale || "en",
    },
    relationship,
    course: enrollment.coursePlan,
    cohort: enrollment.cohort && enrollment.currentCohortSeat
      ? { id: enrollment.cohort.id, code: enrollment.cohort.code, seatPosition: enrollment.currentCohortSeat.position }
      : null,
    enrollment: { id: enrollment.id, status: enrollment.status, startsAt: dateKey(enrollment.startsAt) },
    payment: {
      id: payment.id,
      status: payment.status,
      kind: payment.kind,
      periodStart: dateKey(payment.periodStart),
      periodEnd: dateKey(payment.periodEnd),
      createdAt: payment.createdAt.toISOString(),
      expiresAt: payment.expiresAt.toISOString(),
      baseAmountCents: payment.baseAmountCents,
      discountAmountCents: payment.discountAmountCents,
      finalAmountCents: payment.finalAmountCents,
      currency: payment.currency,
      promotionName: payment.promotionNameSnapshot,
    },
    warnings: ["PAYMENT NOT VERIFIED", "PORTAL ACCESS NOT ACTIVE"],
  };
}

export async function createEnrollmentAndInitialPayment(applicationId: string, raw: unknown) {
  const admin = await courseAdmin();
  const input = finalEnrollmentSchema.parse(raw);
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(input.supabaseUserId);
  if (error || !data.user || data.user.id !== input.supabaseUserId) {
    throw new PreparationValidationError("Verified account could not be resolved by Supabase ID");
  }
  const identity = verifiedIdentityFromUser(data.user);

  return serializable(async tx => {
    await tx.$queryRaw`SELECT id FROM "CourseApplication" WHERE id = ${applicationId} FOR UPDATE`;
    const application = await tx.courseApplication.findUnique({
      where: { id: applicationId },
      include: { courseEnrollment: { select: { id: true } } },
    });
    if (!application || application.status !== "APPROVED") {
      throw new PreparationValidationError("An APPROVED application is required");
    }
    if (application.courseEnrollment) {
      return existingConversionResult(tx, application.courseEnrollment.id, input, identity.supabaseUserId);
    }

    const plan = await tx.coursePlan.findUnique({ where: { id: input.coursePlanId } });
    if (!plan || !plan.active || plan.archivedAt || plan.currency !== "USD" || plan.billingInterval !== "MONTHLY") {
      throw new PreparationValidationError("Choose an active USD monthly course plan");
    }
    if (application.requestedPlanId && application.requestedPlanId !== plan.id) {
      throw new PreparationValidationError("Plan must match the approved application");
    }

    let cohort: {
      id: string;
      code: string;
      seats: { id: string; position: number; currentEnrollmentId: string | null }[];
    } | null = null;
    let startsAt: Date;
    let billingTimeZone: string;
    if (plan.format === "GROUP") {
      if (!input.cohortId || input.agreedStartDate || input.billingTimeZone) {
        throw new PreparationValidationError("Group start must come from the selected cohort");
      }
      await tx.$queryRaw`SELECT id FROM "CourseCohort" WHERE id = ${input.cohortId} FOR UPDATE`;
      const loaded = await tx.courseCohort.findUnique({
        where: { id: input.cohortId },
        include: { seats: { orderBy: { position: "asc" } }, coursePlan: true },
      });
      if (!loaded) throw new PreparationValidationError("Cohort not found");
      assertCohortSelectable(loaded, plan.id);
      cohort = loaded;
      startsAt = loaded.courseStartDate!;
      billingTimeZone = loaded.timeZone!;
    } else {
      if (input.cohortId || !input.agreedStartDate || !input.billingTimeZone) {
        throw new PreparationValidationError("1-to-1 requires an explicit start date and no cohort");
      }
      startsAt = dateOnlyToUtc(input.agreedStartDate);
      billingTimeZone = input.billingTimeZone;
    }

    const customer = await upsertVerifiedCustomer(identity, tx);
    if (customer.status !== "ACTIVE" || customer.archivedAt || customer.deactivatedAt) {
      throw new PreparationValidationError("Customer is not active");
    }
    if (application.customerId && application.customerId !== customer.id) {
      throw new PreparationValidationError("Application already resolved to a different payer");
    }

    let learnerId = input.learner.mode === "EXISTING" ? input.learner.studentId : application.studentProfileId;
    if (application.studentProfileId && learnerId !== application.studentProfileId) {
      throw new PreparationValidationError("Application already resolved to a different learner");
    }
    if (learnerId) await tx.$queryRaw`SELECT id FROM "StudentProfile" WHERE id = ${learnerId} FOR UPDATE`;
    let learner = learnerId ? await tx.studentProfile.findUnique({ where: { id: learnerId } }) : null;
    if (learnerId && !learner) throw new PreparationValidationError("Learner not found");
    if (!learner) {
      if (input.learner.mode !== "NEW") {
        throw new PreparationValidationError("Choose an existing learner or explicitly create one");
      }
      if (input.relationship === "SELF" && await tx.studentProfile.findUnique({ where: { supabaseUserId: identity.supabaseUserId } })) {
        throw new PreparationValidationError("This login already has a learner; explicitly select that learner's ID");
      }
      learner = await tx.studentProfile.create({ data: {
        fullName: input.learner.fullName,
        supabaseUserId: input.relationship === "SELF" ? identity.supabaseUserId : null,
        email: input.relationship === "SELF" ? identity.email : null,
        locale: application.locale,
        portalAccess: false,
      } });
      learnerId = learner.id;
    } else if (input.learner.mode === "NEW" && learner.fullName !== input.learner.fullName) {
      throw new PreparationValidationError("The application already has a learner with different details");
    }
    if (learner.status !== "ACTIVE" || learner.archivedAt) {
      throw new PreparationValidationError("Learner is not active");
    }
    assertRelationship(input.relationship, identity.supabaseUserId, learner.supabaseUserId);

    const relations = await tx.customerStudentRelation.findMany({ where: { studentId: learner.id } });
    let relation = relations.find(item => item.customerId === customer.id);
    if (relation && (relation.type !== input.relationship || relation.endedAt || relation.archivedAt)) {
      throw new PreparationValidationError("Existing relationship contradicts this choice or is inactive");
    }
    if (input.relationship === "SELF" && relations.some(item => item.type === "SELF" && item.customerId !== customer.id && !item.endedAt && !item.archivedAt)) {
      throw new PreparationValidationError("Learner already has another SELF relationship");
    }
    if (!relation) {
      relation = await tx.customerStudentRelation.create({ data: {
        customerId: customer.id,
        studentId: learner.id,
        type: input.relationship,
        isPrimary: !relations.some(item => item.isPrimary && !item.endedAt && !item.archivedAt),
      } });
    }

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + INITIAL_PAYMENT_WINDOW_MS);
    const period = monthlyPeriod(dateKey(startsAt));
    const promotion = await tx.coursePromotion.findFirst({ where: {
      coursePlanId: plan.id,
      enabled: true,
      cancelledAt: null,
      startsAt: { lte: createdAt },
      endsAt: { gt: createdAt },
    } });
    const pricing = paymentPriceSnapshot(plan.monthlyPriceCents, plan.currency, promotion);

    const enrollment = await tx.courseEnrollment.create({ data: {
      studentId: learner.id,
      customerId: customer.id,
      coursePlanId: plan.id,
      applicationId,
      cohortId: plan.format === "GROUP" ? input.cohortId : null,
      status: "PENDING_PAYMENT",
      levelSnapshot: plan.level,
      formatSnapshot: plan.format,
      planCodeSnapshot: plan.code,
      startsAt,
      billingTimeZone,
      createdAt,
    } });

    let seat: { id: string; position: number } | null = null;
    if (plan.format === "GROUP") {
      const seats = cohort!.seats;
      seat = seats.find(item => !item.currentEnrollmentId) ?? null;
      if (!seat) throw new PreparationValidationError("No cohort seat remains");
      await tx.courseCohortSeat.update({ where: { id: seat.id }, data: {
        currentEnrollmentId: enrollment.id,
        assignedAt: createdAt,
        reservedUntil: expiresAt,
      } });
      if (seats.filter(item => !item.currentEnrollmentId).length === 1) {
        await tx.courseCohort.update({ where: { id: input.cohortId! }, data: { status: "FULL" } });
      }
    }

    const payment = await tx.coursePayment.create({ data: {
      enrollmentId: enrollment.id,
      kind: "INITIAL_ENROLLMENT",
      periodStart: dateOnlyToUtc(period.periodStart),
      periodEnd: dateOnlyToUtc(period.periodEnd),
      revision: 1,
      dueAt: null,
      expiresAt,
      status: "PENDING",
      ...pricing,
      createdAt,
    } });

    await enqueueCoursePaymentNotification(tx, {
      paymentId: payment.id,
      kind: "PAYMENT_REQUIRED",
      payload: paymentRequiredEmail({
        paymentId: payment.id,
        customerEmail: customer.email,
        locale: application.locale || customer.locale,
        learnerName: learner.fullName,
        courseCode: plan.code,
        amountCents: payment.finalAmountCents,
        currency: payment.currency,
        deadline: payment.expiresAt,
      }),
    });

    if (application.customerId !== customer.id || application.studentProfileId !== learner.id) {
      await tx.courseApplication.update({ where: { id: applicationId }, data: {
        customerId: customer.id,
        studentProfileId: learner.id,
      } });
    }
    await tx.courseApplicationEvent.create({ data: {
      applicationId,
      fromStatus: "APPROVED",
      toStatus: "APPROVED",
      actorAdminId: admin.adminId,
      note: `Enrollment created: ${enrollment.id}; initial payment ${payment.id}; explicit ${relation.type}. Payment pending; portal access not created.`,
    } });

    return resultDto({
      ...enrollment,
      student: learner,
      customer,
      coursePlan: plan,
      cohort: cohort ? { id: cohort.id, code: cohort.code } : null,
      currentCohortSeat: seat,
      application: { locale: application.locale },
    }, payment, input.relationship, false);
  });
}
