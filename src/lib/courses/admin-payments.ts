import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { courseAdmin } from "./admin-service";
import { getPaymentScreenshotSignedUrl } from "@/lib/payment-screenshots";

export const PAYMENT_QUEUE_FILTERS = ["PROOF_SUBMITTED", "PENDING", "VERIFIED", "EXPIRED", "PAST_DUE", "CANCELLED"] as const;
export type PaymentQueueFilter = typeof PAYMENT_QUEUE_FILTERS[number];
export const PAYMENT_KIND_FILTERS = ["ALL", "INITIAL_ENROLLMENT", "MONTHLY"] as const;
export type PaymentKindFilter = typeof PAYMENT_KIND_FILTERS[number];
export function paymentQueueFilter(raw?: string): PaymentQueueFilter {
  return PAYMENT_QUEUE_FILTERS.find(value => value === raw) ?? "PROOF_SUBMITTED";
}

const enrollmentInclude = {
  student: true, customer: true, coursePlan: true, cohort: true, currentCohortSeat: true, portalAccess: true,
} satisfies Prisma.CourseEnrollmentInclude;

export async function listAdminCoursePayments(status: PaymentQueueFilter, page = 1, kind: PaymentKindFilter = "ALL") {
  await courseAdmin();
  const where = { status, ...(kind === "ALL" ? {} : { kind }) };
  const [payments, count] = await Promise.all([
    prisma.coursePayment.findMany({
      where, include: { enrollment: { include: enrollmentInclude }, submissions: { orderBy: { attemptNumber: "desc" }, take: 1 } },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: 50, skip: (page - 1) * 50,
    }),
    prisma.coursePayment.count({ where }),
  ]);
  const relations = await prisma.customerStudentRelation.findMany({ where: {
    OR: payments.map(p => ({ customerId: p.enrollment.customerId, studentId: p.enrollment.studentId })),
  }, select: { customerId: true, studentId: true, type: true, endedAt: true, archivedAt: true } });
  return { count, payments: payments.map(payment => ({ ...payment,
    relationship: relations.find(r => r.customerId === payment.enrollment.customerId && r.studentId === payment.enrollment.studentId),
  })) };
}

export async function getAdminCoursePayment(paymentId: string) {
  await courseAdmin();
  const payment = await prisma.coursePayment.findUnique({ where: { id: paymentId }, include: {
    enrollment: { include: { ...enrollmentInclude, payments: { select: { id: true, kind: true, status: true, periodStart: true, periodEnd: true, dueAt: true, finalAmountCents: true }, orderBy: { periodStart: "desc" } } } },
    submissions: { orderBy: { attemptNumber: "desc" }, include: { reviewedByAdmin: { select: { displayName: true } } } },
    verifiedByAdmin: { select: { displayName: true } },
  } });
  if (!payment) return null;
  const relationship = await prisma.customerStudentRelation.findUnique({ where: {
    customerId_studentId: { customerId: payment.enrollment.customerId, studentId: payment.enrollment.studentId },
  } });
  return { ...payment, relationship };
}

export async function getAdminCourseProofUrl(paymentId: string, submissionId: string) {
  await courseAdmin();
  const submission = await prisma.coursePaymentSubmission.findFirst({
    where: { id: submissionId, paymentId }, select: { proofStoragePath: true },
  });
  if (!submission || !submission.proofStoragePath.startsWith(`course-payments/${paymentId}/${submissionId}/`)) return null;
  return getPaymentScreenshotSignedUrl(submission.proofStoragePath, 60, true);
}
