import "server-only";

import { prisma } from "@/lib/db";
import { serializable } from "./admin-service";

export type InitialPaymentExpirationResult = {
  paymentId: string;
  outcome: "EXPIRED" | "SKIPPED" | "PROOF_REVIEWABLE";
};

export async function expireInitialPayment(paymentId: string, authoritativeNow = new Date()): Promise<InitialPaymentExpirationResult> {
  return serializable(async tx => {
    await tx.$queryRaw`SELECT id FROM "CoursePayment" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.coursePayment.findUnique({ where: { id: paymentId }, include: {
      enrollment: { include: { cohort: { include: { coursePlan: true, seats: true } } } },
    } });
    if (!payment || payment.kind !== "INITIAL_ENROLLMENT" || payment.status !== "PENDING" || payment.expiresAt > authoritativeNow) {
      return { paymentId, outcome: "SKIPPED" };
    }
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
        await tx.courseCohortSeat.updateMany({
          where: { cohortId: payment.enrollment.cohortId, currentEnrollmentId: payment.enrollmentId },
          data: { currentEnrollmentId: null, assignedAt: null, reservedUntil: null },
        });
        if (payment.enrollment.cohort?.status === "FULL" && !payment.enrollment.cohort.archivedAt) {
          await tx.courseCohort.update({ where: { id: payment.enrollment.cohortId }, data: { status: "OPEN" } });
        }
      }
    }
    return { paymentId, outcome: "EXPIRED" };
  });
}

/** Scheduler-ready domain entry point. No cron or public endpoint is installed. */
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
