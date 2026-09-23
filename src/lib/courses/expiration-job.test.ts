import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ find: vi.fn(), expire: vi.fn(), notify: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { coursePayment: { findMany: mocks.find } } }));
vi.mock("./expire-initial-payments", () => ({ expireInitialPayment: mocks.expire }));
vi.mock("@/lib/notifications/course-payment-expired", () => ({ notifyCoursePaymentExpired: mocks.notify }));
import { runInitialPaymentExpirationJob } from "./expiration-job";

describe("bounded expiration runner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.find.mockResolvedValue([{ id: "payment" }]);
    mocks.expire.mockResolvedValue({ paymentId: "payment", outcome: "EXPIRED" });
    mocks.notify.mockResolvedValue({ sent: true });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
  it("uses bounded indexed candidates and emails after the domain commits", async () => {
    const order: string[] = [];
    mocks.expire.mockImplementation(async () => { order.push("commit"); return { outcome: "EXPIRED" }; });
    mocks.notify.mockImplementation(async () => { order.push("email"); return { sent: true }; });
    expect(await runInitialPaymentExpirationJob()).toMatchObject({ candidates: 1, processed: 1, expired: 1, emailAccepted: 1, failed: 0 });
    expect(order).toEqual(["commit", "email"]);
    expect(mocks.find.mock.calls[0][0]).toMatchObject({ where: { kind: "INITIAL_ENROLLMENT", status: "PENDING", expiresAt: { lte: expect.any(Date) }, enrollment: { status: "PENDING_PAYMENT" } }, select: { id: true }, take: 101 });
  });
  it.each(["SKIPPED", "PROOF_REVIEWABLE"])("does not notify for %s or repeat execution", async outcome => {
    mocks.expire.mockResolvedValue({ outcome });
    await runInitialPaymentExpirationJob(); await runInitialPaymentExpirationJob();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("isolates malformed records without exposing raw errors", async () => {
    mocks.find.mockResolvedValue([{ id: "broken" }, { id: "good" }]);
    mocks.expire.mockRejectedValueOnce(new Error("private connection information"));
    const result = await runInitialPaymentExpirationJob();
    expect(result).toMatchObject({ processed: 2, failed: 1, expired: 1, emailAccepted: 1 });
    expect(mocks.notify).toHaveBeenCalledWith("good");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private connection");
  });
  it.each([false, "throw"])("email failure %s never reruns expiration", async mode => {
    if (mode === "throw") mocks.notify.mockRejectedValue(new Error("provider private detail"));
    else mocks.notify.mockResolvedValue({ sent: false });
    expect(await runInitialPaymentExpirationJob()).toMatchObject({ expired: 1, failed: 0, emailFailed: 1 });
    expect(mocks.expire).toHaveBeenCalledTimes(1);
  });
  it("bounds email waiting, reports uncertain delivery, and continues", async () => {
    vi.useFakeTimers(); mocks.notify.mockReturnValue(new Promise(() => {}));
    const job = runInitialPaymentExpirationJob();
    await vi.advanceTimersByTimeAsync(5001);
    expect(await job).toMatchObject({ expired: 1, emailUnknown: 1 });
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
