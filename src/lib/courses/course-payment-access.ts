import "server-only";

import { prisma } from "@/lib/db";
import {
  CustomerAuthenticationError,
  CustomerEmailNotVerifiedError,
  getCurrentAuthenticatedCustomer,
} from "@/lib/customer/dal";
import { expireInitialPayment } from "./expire-initial-payments";

export class CoursePaymentCustomerDeniedError extends Error {}
export class CoursePaymentNotFoundError extends Error {}

export async function requireActiveCourseCustomer() {
  const customer = await getCurrentAuthenticatedCustomer();
  if (
    !customer ||
    customer.status !== "ACTIVE" ||
    customer.archivedAt ||
    customer.deactivatedAt
  ) {
    throw new CoursePaymentCustomerDeniedError("An active customer account is required");
  }
  return customer;
}

async function findOwnedPayment(customerId: string, paymentId: string) {
  return prisma.coursePayment.findFirst({
    where: { id: paymentId, enrollment: { customerId } },
    include: {
      enrollment: {
        include: {
          student: { select: { id: true, fullName: true } },
          customer: { select: { id: true, email: true, locale: true } },
          coursePlan: { select: { code: true, level: true, format: true } },
          cohort: {
            select: {
              code: true,
              name: true,
              weeklyDay: true,
              localStartTime: true,
              durationMinutes: true,
              timeZone: true,
              courseStartDate: true,
              courseEndDate: true,
            },
          },
        },
      },
      submissions: { orderBy: { submittedAt: "desc" }, take: 1 },
    },
  });
}

export async function getOwnedCoursePayment(
  customerId: string,
  paymentId: string,
  authoritativeNow = new Date(),
) {
  let payment = await findOwnedPayment(customerId, paymentId);
  if (!payment) throw new CoursePaymentNotFoundError("Course payment not found");

  if (
    payment.kind === "INITIAL_ENROLLMENT" &&
    payment.status === "PENDING" &&
    payment.expiresAt <= authoritativeNow
  ) {
    await expireInitialPayment(payment.id, authoritativeNow);
    payment = await findOwnedPayment(customerId, paymentId);
    if (!payment) throw new CoursePaymentNotFoundError("Course payment not found");
  }

  const relation = await prisma.customerStudentRelation.findUnique({
    where: {
      customerId_studentId: {
        customerId,
        studentId: payment.enrollment.student.id,
      },
    },
    select: { type: true, endedAt: true, archivedAt: true },
  });

  const latestSubmission = payment.submissions[0] ?? null;
  const displayStatus =
    ["PENDING", "PAST_DUE"].includes(payment.status) && latestSubmission?.status === "REJECTED"
      ? "REJECTED"
      : payment.status;

  return {
    id: payment.id,
    kind: payment.kind,
    status: payment.status,
    displayStatus,
    periodStart: payment.periodStart,
    periodEnd: payment.periodEnd,
    dueAt: payment.dueAt,
    expiresAt: payment.expiresAt,
    baseAmountCents: payment.baseAmountCents,
    discountAmountCents: payment.discountAmountCents,
    finalAmountCents: payment.finalAmountCents,
    currency: payment.currency,
    promotionName: payment.promotionNameSnapshot,
    enrollment: {
      id: payment.enrollment.id,
      status: payment.enrollment.status,
      learner: payment.enrollment.student,
      customer: payment.enrollment.customer,
      course: payment.enrollment.coursePlan,
      cohort: payment.enrollment.cohort,
    },
    relationship:
      relation && !relation.endedAt && !relation.archivedAt ? relation.type : null,
    latestSubmission: latestSubmission
      ? {
          id: latestSubmission.id,
          status: latestSubmission.status,
          submittedAt: latestSubmission.submittedAt,
          method: latestSubmission.method,
          rejectionReason: latestSubmission.rejectionReason,
        }
      : null,
  };
}

export async function getCurrentCustomerCoursePayment(
  paymentId: string,
  authoritativeNow = new Date(),
) {
  const customer = await requireActiveCourseCustomer();
  return getOwnedCoursePayment(customer.id, paymentId, authoritativeNow);
}

export async function listCurrentCustomerCoursePayments() {
  const customer = await requireActiveCourseCustomer();
  return prisma.coursePayment.findMany({
    where: { enrollment: { customerId: customer.id } },
    include: { enrollment: { select: { planCodeSnapshot: true, billingTimeZone: true, student: { select: { fullName: true } } } }, submissions: { orderBy: { attemptNumber: "desc" }, take: 1 } },
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }], take: 100,
  });
}

export {
  CustomerAuthenticationError,
  CustomerEmailNotVerifiedError,
};
