import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => {
  const state: { status: string; current: { id: string; submittedAt: Date } | null } = {
    status: "PENDING",
    current: null,
  };
  const tx = {
    coursePayment: { findFirst: vi.fn(), update: vi.fn() },
    coursePaymentSubmission: { findFirst: vi.fn(), aggregate: vi.fn(), create: vi.fn() },
  };
  return {
    state,
    tx,
    preflight: vi.fn(),
    serializable: vi.fn(),
    expire: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
  };
});

vi.mock("./course-payment-access", () => ({
  CoursePaymentNotFoundError: class CoursePaymentNotFoundError extends Error {},
  getOwnedCoursePayment: mocks.preflight,
}));
vi.mock("./admin-service", () => ({ serializable: mocks.serializable }));
vi.mock("./expire-initial-payments", () => ({ expireInitialPaymentInTransaction: mocks.expire }));
vi.mock("./course-payment-proofs", () => ({
  uploadCoursePaymentProof: mocks.upload,
  removeCoursePaymentProof: mocks.remove,
}));

import {
  CoursePaymentSubmissionError,
  submitCoursePaymentProofForCustomer,
} from "./submit-course-payment-proof";

const now = new Date("2026-10-12T12:00:00Z");
const proof = {
  bytes: new Uint8Array([1]),
  mimeType: "image/png" as const,
  fileSizeBytes: 1,
  originalFileName: "proof.png",
  storageExtension: "png",
};
const fields = {
  method: "ZELLE" as const,
  senderName: "Sender",
  amountSentCents: 4500,
  sentAt: new Date("2026-10-12T11:00:00Z"),
  transactionReference: "reference",
};
const payment = {
  id: "payment-1",
  kind: "INITIAL_ENROLLMENT",
  status: "PENDING",
  expiresAt: new Date("2026-10-20T00:00:00Z"),
  finalAmountCents: 4500,
  currency: "USD",
  enrollment: {
    customer: { email: "payer@example.invalid", locale: "en" },
    student: { fullName: "Learner" },
    coursePlan: { code: "BEGINNER_GROUP" },
  },
};

function preflight(status = "PENDING") {
  return {
    id: "payment-1",
    status,
    latestSubmission: null,
    enrollment: {
      customer: { email: "payer@example.invalid", locale: "en" },
      learner: { fullName: "Learner" },
      course: { code: "BEGINNER_GROUP" },
    },
    finalAmountCents: 4500,
    currency: "USD",
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.state.status = "PENDING";
  mocks.state.current = null;
  mocks.preflight.mockResolvedValue(preflight());
  mocks.expire.mockResolvedValue({ paymentId: "payment-1", outcome: "SKIPPED" });
  mocks.upload.mockImplementation(async (_paymentId, submissionId) => `course-payments/payment-1/${submissionId}/proof.png`);
  mocks.serializable.mockImplementation(async work => work(mocks.tx));
  mocks.tx.coursePayment.findFirst.mockImplementation(async () => ({ ...payment, status: mocks.state.status }));
  mocks.tx.coursePaymentSubmission.findFirst.mockImplementation(async () => mocks.state.current);
  mocks.tx.coursePaymentSubmission.aggregate.mockResolvedValue({ _max: { attemptNumber: null } });
  mocks.tx.coursePaymentSubmission.create.mockImplementation(async ({ data }) => {
    mocks.state.current = { id: data.id, submittedAt: data.submittedAt };
    return mocks.state.current;
  });
  mocks.tx.coursePayment.update.mockImplementation(async () => {
    mocks.state.status = "PROOF_SUBMITTED";
    return {};
  });
});

describe("course payment proof transaction", () => {
  it("creates one SUBMITTED attempt and transitions only PENDING to PROOF_SUBMITTED", async () => {
    const result = await submitCoursePaymentProofForCustomer("customer-1", "payment-1", fields, proof, now);
    expect(result).toMatchObject({ idempotent: false, submission: { status: "SUBMITTED", submittedAt: now } });
    expect(mocks.tx.coursePayment.findFirst.mock.calls[0][0].where).toEqual({ id: "payment-1", enrollment: { customerId: "customer-1" } });
    expect(mocks.tx.coursePaymentSubmission.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      paymentId: "payment-1",
      attemptNumber: 1,
      status: "SUBMITTED",
      method: "ZELLE",
      amountSentCents: 4500,
      proofStoragePath: expect.stringMatching(/^course-payments\/payment-1\//),
      submittedAt: now,
    }), select: { id: true, submittedAt: true } });
    expect(mocks.tx.coursePayment.update).toHaveBeenCalledWith({ where: { id: "payment-1" }, data: { status: "PROOF_SUBMITTED" } });
    expect((mocks.tx as Record<string, unknown>).courseEnrollment).toBeUndefined();
    expect((mocks.tx as Record<string, unknown>).coursePortalAccess).toBeUndefined();
  });

  it("rejects an expired first proof before storage", async () => {
    mocks.preflight.mockResolvedValue(preflight("EXPIRED"));
    await expect(submitCoursePaymentProofForCustomer("customer-1", "payment-1", fields, proof, now))
      .rejects.toMatchObject({ problem: "EXPIRED" } satisfies Partial<CoursePaymentSubmissionError>);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("returns an existing current submission on browser retry without a second upload", async () => {
    mocks.preflight.mockResolvedValue({
      ...preflight("PROOF_SUBMITTED"),
      latestSubmission: { id: "existing", status: "SUBMITTED", submittedAt: now },
    });
    const result = await submitCoursePaymentProofForCustomer("customer-1", "payment-1", fields, proof, now);
    expect(result).toMatchObject({ idempotent: true, submission: { id: "existing" } });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("serializes concurrent double-clicks into one record and removes the losing upload", async () => {
    let tail = Promise.resolve();
    mocks.serializable.mockImplementation(work => {
      const run = tail.then(() => work(mocks.tx));
      tail = run.then(() => undefined, () => undefined);
      return run;
    });
    const [left, right] = await Promise.all([
      submitCoursePaymentProofForCustomer("customer-1", "payment-1", fields, proof, now),
      submitCoursePaymentProofForCustomer("customer-1", "payment-1", fields, proof, now),
    ]);
    expect([left.idempotent, right.idempotent].sort()).toEqual([false, true]);
    expect(mocks.tx.coursePaymentSubmission.create).toHaveBeenCalledTimes(1);
    expect(mocks.tx.coursePayment.update).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });

  it("commits expiration at the final locked recheck and compensates storage", async () => {
    mocks.expire.mockResolvedValue({ paymentId: "payment-1", outcome: "EXPIRED" });
    mocks.tx.coursePayment.findFirst.mockResolvedValue({ ...payment, status: "EXPIRED" });
    await expect(submitCoursePaymentProofForCustomer("customer-1", "payment-1", fields, proof, now))
      .rejects.toMatchObject({ problem: "EXPIRED" } satisfies Partial<CoursePaymentSubmissionError>);
    expect(mocks.tx.coursePaymentSubmission.create).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });
});
