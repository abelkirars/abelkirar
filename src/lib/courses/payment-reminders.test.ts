import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), enqueue: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { coursePayment: { findMany: mocks.findMany } } }));
vi.mock("@/lib/notifications/course-payment-outbox", () => ({ enqueueCoursePaymentNotification: mocks.enqueue }));
import {
  generateInitialPaymentReminders,
  generateMonthlyPaymentReminders,
  monthlyReminderWindow,
  reminderWindow,
} from "./payment-reminders";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-10-01T12:00:00Z");
function payment(hours: number, id = `payment-${hours}`) {
  return {
    id, expiresAt: new Date(now.getTime() + hours * HOUR), finalAmountCents: 5000, currency: "USD",
    enrollment: {
      planCodeSnapshot: "BEGINNER_GROUP",
      customer: { email: "payer@example.invalid", locale: "en" },
      student: { fullName: "Learner" }, application: { locale: "en" },
    },
  };
}

function monthlyPayment(hours: number, id = `monthly-${hours}`) {
  return { ...payment(hours, id), dueAt: new Date(now.getTime() + hours * HOUR) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enqueue.mockResolvedValue(true);
});

describe("monthly payment reminder generation", () => {
  it.each([
    [72, 72], [49, 72], [48, null], [25, null], [24, 24], [13, 24], [12, null], [0, null],
  ])("maps %sh before due to %s", (hours, expected) => {
    expect(monthlyReminderWindow(new Date(now.getTime() + Number(hours) * HOUR), now)).toBe(expected);
  });

  it("creates distinct durable 72h and 24h reminder kinds", async () => {
    mocks.findMany.mockResolvedValue([monthlyPayment(72), monthlyPayment(24)]);
    expect(await generateMonthlyPaymentReminders(now)).toEqual({ candidates: 2, created: 2, duplicate: 0, hasMore: false });
    expect(mocks.enqueue.mock.calls.map(call => call[1].kind)).toEqual([
      "MONTHLY_PAYMENT_REMINDER_72H", "MONTHLY_PAYMENT_REMINDER_24H",
    ]);
  });

  it("selects only pending monthly obligations on active enrollment", async () => {
    mocks.findMany.mockResolvedValue([]);
    await generateMonthlyPaymentReminders(now);
    expect(mocks.findMany.mock.calls[0][0].where).toMatchObject({
      kind: "MONTHLY", status: "PENDING",
      enrollment: { status: "ACTIVE", archivedAt: null },
    });
  });
});

describe("initial payment reminder generation", () => {
  it.each([
    [48, 48], [47, 48], [36, null], [25, null], [24, 24], [13, 24], [12, null], [0, null], [-1, null],
  ])("maps %sh remaining to %s", (hours, expected) => {
    expect(reminderWindow(new Date(now.getTime() + Number(hours) * HOUR), now)).toBe(expected);
  });

  it("creates each useful reminder with a payment-level unique kind", async () => {
    mocks.findMany.mockResolvedValue([payment(48), payment(24)]);
    expect(await generateInitialPaymentReminders(now)).toEqual({ candidates: 2, created: 2, duplicate: 0, hasMore: false });
    expect(mocks.enqueue.mock.calls.map(call => call[1].kind)).toEqual(["INITIAL_PAYMENT_REMINDER_48H", "INITIAL_PAYMENT_REMINDER_24H"]);
  });

  it("reports repeat/concurrent uniqueness conflicts as duplicates", async () => {
    mocks.findMany.mockResolvedValue([payment(47)]);
    mocks.enqueue.mockResolvedValue(false);
    expect(await generateInitialPaymentReminders(now)).toMatchObject({ created: 0, duplicate: 1 });
  });

  it("uses an authoritative eligibility query and never changes expiresAt", async () => {
    mocks.findMany.mockResolvedValue([]);
    await generateInitialPaymentReminders(now);
    const args = mocks.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      kind: "INITIAL_ENROLLMENT", status: "PENDING",
      enrollment: {
        status: "PENDING_PAYMENT", archivedAt: null, portalAccess: { is: null },
        customer: { status: "ACTIVE", archivedAt: null, deactivatedAt: null },
      },
    });
    expect(JSON.stringify(args)).not.toContain("PROOF_SUBMITTED");
    expect(args.take).toBe(101);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("skips a row that became stale before rendering", async () => {
    mocks.findMany.mockResolvedValue([payment(35)]);
    expect(await generateInitialPaymentReminders(now)).toMatchObject({ created: 0, duplicate: 0 });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
