import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  find: vi.fn(), expire: vi.fn(), reminders: vi.fn(), deliver: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { coursePayment: { findMany: mocks.find } } }));
vi.mock("./expire-initial-payments", () => ({ expireInitialPayment: mocks.expire }));
vi.mock("./payment-reminders", () => ({ generateInitialPaymentReminders: mocks.reminders }));
vi.mock("@/lib/notifications/course-payment-worker", () => ({ deliverCoursePaymentNotifications: mocks.deliver }));
import { runInitialPaymentExpirationJob } from "./expiration-job";

describe("bounded expiration/outbox runner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.find.mockResolvedValue([{ id: "payment" }]);
    mocks.expire.mockResolvedValue({ paymentId: "payment", outcome: "EXPIRED" });
    mocks.reminders.mockResolvedValue({ candidates: 0, created: 0, duplicate: 0, hasMore: false });
    mocks.deliver.mockResolvedValue({ claimed: 1, sent: 1, retried: 0, failed: 0, cancelled: 0, uncertain: 0, configurationUnavailable: false });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("uses bounded indexed candidates, then generates reminders and delivers the outbox", async () => {
    const result = await runInitialPaymentExpirationJob();
    expect(result).toMatchObject({ candidates: 1, processed: 1, expired: 1, notificationsCreated: 1, notificationsClaimed: 1, notificationsSent: 1, failed: 0 });
    expect(mocks.find.mock.calls[0][0]).toMatchObject({ where: { kind: "INITIAL_ENROLLMENT", status: "PENDING", expiresAt: { lte: expect.any(Date) }, enrollment: { status: "PENDING_PAYMENT" } }, select: { id: true }, take: 101 });
    expect(mocks.reminders).toHaveBeenCalledWith(expect.any(Date));
    expect(mocks.deliver).toHaveBeenCalledWith(20, expect.any(Date));
  });

  it.each(["SKIPPED", "PROOF_REVIEWABLE"])("does not count an outbox record for %s", async outcome => {
    mocks.expire.mockResolvedValue({ outcome });
    expect(await runInitialPaymentExpirationJob()).toMatchObject({ expired: 0, skipped: 1, notificationsCreated: 0 });
  });

  it("isolates malformed expiration records and continues", async () => {
    mocks.find.mockResolvedValue([{ id: "broken" }, { id: "good" }]);
    mocks.expire.mockRejectedValueOnce(new Error("private connection information"));
    const result = await runInitialPaymentExpirationJob();
    expect(result).toMatchObject({ processed: 2, failed: 1, expired: 1, notificationsCreated: 1 });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private connection");
  });

  it("keeps committed expiration independent from reminder or delivery failures", async () => {
    mocks.reminders.mockRejectedValue(new Error("private reminder detail"));
    mocks.deliver.mockRejectedValue(new Error("private provider detail"));
    expect(await runInitialPaymentExpirationJob()).toMatchObject({ expired: 1, notificationsCreated: 1, failed: 2 });
    expect(mocks.expire).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/private reminder|private provider/);
  });

  it("reports reminder and worker observability without message content", async () => {
    mocks.reminders.mockResolvedValue({ candidates: 3, created: 2, duplicate: 1, hasMore: true });
    mocks.deliver.mockResolvedValue({ claimed: 4, sent: 1, retried: 1, failed: 1, cancelled: 1, uncertain: 0 });
    expect(await runInitialPaymentExpirationJob()).toMatchObject({
      notificationsCreated: 3, remindersCreated: 2, notificationsClaimed: 4,
      notificationsSent: 1, notificationsRetried: 1, notificationsFailed: 1,
      notificationsCancelled: 1, hasMore: true,
    });
  });

  it("reports more work without accepting a client-controlled limit", async () => {
    mocks.find.mockResolvedValue(Array.from({ length: 101 }, (_, i) => ({ id: `payment-${i}` })));
    expect(await runInitialPaymentExpirationJob()).toMatchObject({ candidates: 100, processed: 100, hasMore: true });
    expect(mocks.expire).toHaveBeenCalledTimes(100);
  });

  it("redacts candidate-query failures", async () => {
    mocks.find.mockRejectedValue(new Error("private connection information"));
    await expect(runInitialPaymentExpirationJob()).rejects.toThrow("Expiration job unavailable");
    expect(mocks.expire).not.toHaveBeenCalled();
  });
});
