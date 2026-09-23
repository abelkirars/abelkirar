import "server-only";
import type { CoursePaymentNotificationKind, Prisma } from "@prisma/client";
import type { CourseEmailSnapshot } from "./course-payment-content";

const SUBMISSION_SCOPED = new Set<CoursePaymentNotificationKind>(["PROOF_RECEIVED", "PROOF_REJECTED"]);

export async function enqueueCoursePaymentNotification(
  tx: Pick<Prisma.TransactionClient, "coursePaymentNotification">,
  input: {
    paymentId: string;
    submissionId?: string | null;
    kind: CoursePaymentNotificationKind;
    payload: CourseEmailSnapshot;
    nextAttemptAt?: Date;
  },
) {
  const needsSubmission = SUBMISSION_SCOPED.has(input.kind);
  if (needsSubmission !== Boolean(input.submissionId)) throw new Error("Invalid course notification scope");
  const result = await tx.coursePaymentNotification.createMany({
    data: {
      paymentId: input.paymentId,
      submissionId: input.submissionId || null,
      kind: input.kind,
      deduplicationKey: input.submissionId ? `SUBMISSION:${input.submissionId}` : "PAYMENT",
      ...input.payload,
      nextAttemptAt: input.nextAttemptAt,
    },
    skipDuplicates: true,
  });
  return result.count === 1;
}
