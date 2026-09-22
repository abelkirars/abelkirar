import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { serializable } from "./admin-service";
import { CoursePaymentNotFoundError, getOwnedCoursePayment } from "./course-payment-access";
import type { CoursePaymentProofFields } from "./course-payment-proof-input";
import {
  removeCoursePaymentProof,
  uploadCoursePaymentProof,
  type ValidatedCoursePaymentProof,
} from "./course-payment-proofs";
import { expireInitialPaymentInTransaction } from "./expire-initial-payments";

export type CoursePaymentSubmissionProblem =
  | "EXPIRED"
  | "NOT_PENDING"
  | "NOT_FOUND";

export class CoursePaymentSubmissionError extends Error {
  constructor(public readonly problem: CoursePaymentSubmissionProblem, message: string) {
    super(message);
  }
}

type SubmissionResult = {
  idempotent: boolean;
  submission: { id: string; status: "SUBMITTED"; submittedAt: Date };
  notification: {
    paymentId: string;
    customerEmail: string;
    locale: string;
    learnerName: string;
    courseCode: string;
    amountCents: number;
    currency: string;
  };
};

type TransactionOutcome =
  | { kind: "CREATED"; result: SubmissionResult }
  | { kind: "DUPLICATE"; result: SubmissionResult }
  | { kind: "EXPIRED" }
  | { kind: "NOT_PENDING" };

type PaymentForSubmission = Prisma.CoursePaymentGetPayload<{
  include: {
    enrollment: {
      include: {
        customer: { select: { email: true; locale: true } };
        student: { select: { fullName: true } };
        coursePlan: { select: { code: true } };
        application: { select: { locale: true } };
      };
    };
  };
}>;

function resultFrom(
  payment: PaymentForSubmission,
  submission: { id: string; submittedAt: Date },
  idempotent: boolean,
): SubmissionResult {
  return {
    idempotent,
    submission: { id: submission.id, status: "SUBMITTED", submittedAt: submission.submittedAt },
    notification: {
      paymentId: payment.id,
      customerEmail: payment.enrollment.customer.email,
      locale: payment.enrollment.application?.locale || payment.enrollment.customer.locale || "en",
      learnerName: payment.enrollment.student.fullName,
      courseCode: payment.enrollment.coursePlan.code,
      amountCents: payment.finalAmountCents,
      currency: payment.currency,
    },
  };
}

export async function submitCoursePaymentProofForCustomer(
  customerId: string,
  paymentId: string,
  fields: CoursePaymentProofFields,
  proof: ValidatedCoursePaymentProof,
  authoritativeNow = new Date(),
): Promise<SubmissionResult> {
  let preflight;
  try {
    preflight = await getOwnedCoursePayment(customerId, paymentId, authoritativeNow);
  } catch (error) {
    if (error instanceof CoursePaymentNotFoundError) {
      throw new CoursePaymentSubmissionError("NOT_FOUND", "Course payment not found");
    }
    throw error;
  }
  if (preflight.status === "EXPIRED") {
    throw new CoursePaymentSubmissionError("EXPIRED", "The enrollment payment window has expired");
  }
  if (preflight.status === "PROOF_SUBMITTED" && preflight.latestSubmission?.status === "SUBMITTED") {
    return {
      idempotent: true,
      submission: {
        id: preflight.latestSubmission.id,
        status: "SUBMITTED",
        submittedAt: preflight.latestSubmission.submittedAt,
      },
      notification: {
        paymentId: preflight.id,
        customerEmail: preflight.enrollment.customer.email,
        locale: preflight.enrollment.customer.locale || "en",
        learnerName: preflight.enrollment.learner.fullName,
        courseCode: preflight.enrollment.course.code,
        amountCents: preflight.finalAmountCents,
        currency: preflight.currency,
      },
    };
  }
  if (preflight.status !== "PENDING") {
    throw new CoursePaymentSubmissionError("NOT_PENDING", "This payment is not accepting a new proof");
  }

  const submissionId = randomUUID();
  const storagePath = await uploadCoursePaymentProof(paymentId, submissionId, proof);
  let outcome: TransactionOutcome;
  try {
    outcome = await serializable(async tx => {
      const expiration = await expireInitialPaymentInTransaction(tx, paymentId, authoritativeNow);
      const payment = await tx.coursePayment.findFirst({
        where: { id: paymentId, enrollment: { customerId } },
        include: {
          enrollment: {
            include: {
              customer: { select: { email: true, locale: true } },
              student: { select: { fullName: true } },
              coursePlan: { select: { code: true } },
              application: { select: { locale: true } },
            },
          },
        },
      });
      if (!payment) throw new CoursePaymentSubmissionError("NOT_FOUND", "Course payment not found");
      if (expiration.outcome === "EXPIRED" || payment.status === "EXPIRED") return { kind: "EXPIRED" };

      const current = await tx.coursePaymentSubmission.findFirst({
        where: { paymentId, status: "SUBMITTED" },
        select: { id: true, submittedAt: true },
      });
      if (current) return { kind: "DUPLICATE", result: resultFrom(payment, current, true) };
      if (payment.status !== "PENDING") return { kind: "NOT_PENDING" };

      const aggregate = await tx.coursePaymentSubmission.aggregate({
        where: { paymentId },
        _max: { attemptNumber: true },
      });
      const submission = await tx.coursePaymentSubmission.create({
        data: {
          id: submissionId,
          paymentId,
          attemptNumber: (aggregate._max.attemptNumber ?? 0) + 1,
          status: "SUBMITTED",
          method: fields.method,
          senderName: fields.senderName,
          transactionReference: fields.transactionReference,
          amountSentCents: fields.amountSentCents,
          sentAt: fields.sentAt,
          proofStoragePath: storagePath,
          originalFileName: proof.originalFileName,
          mimeType: proof.mimeType,
          fileSizeBytes: proof.fileSizeBytes,
          submittedAt: authoritativeNow,
        },
        select: { id: true, submittedAt: true },
      });
      await tx.coursePayment.update({
        where: { id: paymentId },
        data: { status: "PROOF_SUBMITTED" },
      });
      return { kind: "CREATED", result: resultFrom(payment, submission, false) };
    });
  } catch (error) {
    await removeCoursePaymentProof(storagePath);
    throw error;
  }

  if (outcome.kind !== "CREATED") await removeCoursePaymentProof(storagePath);
  if (outcome.kind === "EXPIRED") {
    throw new CoursePaymentSubmissionError("EXPIRED", "The enrollment payment window has expired");
  }
  if (outcome.kind === "NOT_PENDING") {
    throw new CoursePaymentSubmissionError("NOT_PENDING", "This payment is not accepting a new proof");
  }
  return outcome.result;
}
