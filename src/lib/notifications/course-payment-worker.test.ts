import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ raw: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: mocks.raw,
    coursePaymentNotification: { updateMany: mocks.updateMany, findMany: mocks.findMany },
  },
}));
vi.mock("./email", () => ({ sendEmail: mocks.send }));
import { deliverCoursePaymentNotifications } from "./course-payment-worker";

const now = new Date("2026-10-01T12:00:00Z");
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "notification-1", kind: "PAYMENT_REQUIRED", status: "PROCESSING",
    recipientEmailSnapshot: "payer@example.invalid", subjectSnapshot: "Subject", htmlSnapshot: "<p>Body</p>",
    senderEmailSnapshot: "courses@example.invalid", attemptCount: 1, firstAttemptAt: now,
    nextAttemptAt: now, leaseToken: "lease", submission: null,
    payment: {
      status: "PENDING", kind: "INITIAL_ENROLLMENT", dueAt: null, expiresAt: new Date(now.getTime() + 47 * 60 * 60 * 1000),
      enrollment: {
        status: "PENDING_PAYMENT", archivedAt: null, cancellationReason: null, portalAccess: null,
        customer: { status: "ACTIVE", archivedAt: null, deactivatedAt: null },
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("RESEND_API_KEY", "test-only");
  vi.stubEnv("RESEND_FROM_EMAIL", "courses@example.invalid");
  mocks.raw.mockResolvedValue([{ id: "notification-1" }]);
  mocks.findMany.mockResolvedValue([row()]);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.send.mockResolvedValue({ sent: true, providerMessageId: "provider-1" });
});
afterEach(() => vi.unstubAllEnvs());

describe("course payment notification worker", () => {
  it("fails closed before claiming when email is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await deliverCoursePaymentNotifications()).toMatchObject({ claimed: 0, configurationUnavailable: true });
    expect(mocks.raw).not.toHaveBeenCalled();
  });

  it("claims, revalidates, sends immutable content with provider idempotency, and records SENT", async () => {
    expect(await deliverCoursePaymentNotifications(20, now)).toMatchObject({ claimed: 1, sent: 1, uncertain: 0 });
    expect(mocks.send).toHaveBeenCalledWith({
      from: "courses@example.invalid", to: "payer@example.invalid", subject: "Subject", html: "<p>Body</p>",
      idempotencyKey: "course-payment-notification/notification-1", redactErrors: true,
    });
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: "notification-1", status: "PROCESSING", leaseToken: expect.any(String) },
      data: expect.objectContaining({ status: "SENT", providerMessageId: "provider-1", leaseToken: null }),
    }));
    // Even a caller-requested batch of 20 is capped to four actual provider attempts.
    expect(mocks.raw.mock.calls[0].slice(1)).toContain(4);
  });

  it("normally permits only one concurrent claimant to send", async () => {
    mocks.raw.mockResolvedValueOnce([{ id: "notification-1" }]).mockResolvedValueOnce([]);
    mocks.findMany.mockImplementation(async ({ where }) => where.id.in.length ? [row()] : []);
    const results = await Promise.all([deliverCoursePaymentNotifications(1, now), deliverCoursePaymentNotifications(1, now)]);
    expect(results.reduce((sum, result) => sum + result.claimed, 0)).toBe(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("cancels a claimed message whose authoritative state is no longer eligible", async () => {
    mocks.findMany.mockResolvedValue([row({ payment: { ...row().payment, status: "VERIFIED" } })]);
    expect(await deliverCoursePaymentNotifications(1, now)).toMatchObject({ cancelled: 1, sent: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED", lastErrorCode: "STATE_NOT_ELIGIBLE" }) }));
  });

  it.each([
    ["PAYMENT_REQUIRED", 100],
    ["MONTHLY_PAYMENT_REMINDER_72H", 72],
    ["MONTHLY_PAYMENT_REMINDER_24H", 24],
  ])("delivers eligible monthly %s notifications", async (kind, hours) => {
    mocks.findMany.mockResolvedValue([row({
      kind,
      payment: {
        ...row().payment,
        kind: "MONTHLY",
        dueAt: new Date(now.getTime() + Number(hours) * 60 * 60 * 1000),
        enrollment: { ...row().payment.enrollment, status: "ACTIVE", portalAccess: { status: "ENABLED" } },
      },
    })]);
    expect(await deliverCoursePaymentNotifications(1, now)).toMatchObject({ sent: 1, cancelled: 0 });
  });

  it("delivers past-due notice without suspending or requiring absent access", async () => {
    mocks.findMany.mockResolvedValue([row({
      kind: "MONTHLY_PAYMENT_PAST_DUE",
      payment: {
        ...row().payment,
        kind: "MONTHLY", status: "PAST_DUE", dueAt: new Date(now.getTime() - 1),
        enrollment: { ...row().payment.enrollment, status: "ACTIVE", portalAccess: { status: "ENABLED" } },
      },
    })]);
    expect(await deliverCoursePaymentNotifications(1, now)).toMatchObject({ sent: 1 });
  });

  it("retries a transient provider failure with bounded backoff and redacted code", async () => {
    mocks.send.mockResolvedValue({ sent: false, retryable: true, errorCode: "rate-limit/private" });
    expect(await deliverCoursePaymentNotifications(1, now)).toMatchObject({ retried: 1, failed: 0 });
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: "RETRY", nextAttemptAt: new Date(now.getTime() + 5 * 60 * 1000), lastErrorCode: "RATE_LIMIT_PRIVATE",
    }) }));
  });

  it("fails terminally for permanent provider rejection or exhausted attempts", async () => {
    mocks.send.mockResolvedValue({ sent: false, retryable: false, errorCode: "validation_error" });
    expect(await deliverCoursePaymentNotifications(1, now)).toMatchObject({ failed: 1, retried: 0 });
    expect(mocks.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", lastErrorCode: "VALIDATION_ERROR" }) }));
  });

  it("leaves the lease intact when provider acceptance cannot be recorded", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 }).mockRejectedValueOnce(new Error("database unavailable"));
    expect(await deliverCoursePaymentNotifications(1, now)).toMatchObject({ sent: 0, uncertain: 1 });
    expect(mocks.send).toHaveBeenCalledOnce();
  });
});
