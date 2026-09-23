import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { enqueueCoursePaymentNotification } from "./course-payment-outbox";

const payload = { recipientEmailSnapshot: "payer@example.invalid", subjectSnapshot: "Subject", htmlSnapshot: "<p>Body</p>" };

describe("course payment outbox enqueue", () => {
  it("uses payment-level deduplication for one-per-obligation kinds", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    expect(await enqueueCoursePaymentNotification({ coursePaymentNotification: { createMany } } as never, {
      paymentId: "payment", kind: "PAYMENT_REQUIRED", payload,
    })).toBe(true);
    expect(createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ paymentId: "payment", submissionId: null, deduplicationKey: "PAYMENT", kind: "PAYMENT_REQUIRED" }),
      skipDuplicates: true,
    });
  });

  it("uses submission-level deduplication so later proof attempts remain distinct", async () => {
    const createMany = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const tx = { coursePaymentNotification: { createMany } } as never;
    const input = { paymentId: "payment", submissionId: "proof-2", kind: "PROOF_REJECTED" as const, payload };
    expect(await enqueueCoursePaymentNotification(tx, input)).toBe(true);
    expect(await enqueueCoursePaymentNotification(tx, input)).toBe(false);
    expect(createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ submissionId: "proof-2", deduplicationKey: "SUBMISSION:proof-2" }),
      skipDuplicates: true,
    });
  });

  it.each([
    { kind: "PROOF_RECEIVED" as const },
    { kind: "PAYMENT_VERIFIED" as const, submissionId: "proof" },
  ])("rejects an invalid scope for $kind", async input => {
    const createMany = vi.fn();
    await expect(enqueueCoursePaymentNotification({ coursePaymentNotification: { createMany } } as never, {
      paymentId: "payment", ...input, payload,
    })).rejects.toThrow("Invalid course notification scope");
    expect(createMany).not.toHaveBeenCalled();
  });
});
