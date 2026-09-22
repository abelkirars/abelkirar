import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  findPayment: vi.fn(),
  findRelation: vi.fn(),
  expire: vi.fn(),
  currentCustomer: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    coursePayment: { findFirst: mocks.findPayment },
    customerStudentRelation: { findUnique: mocks.findRelation },
  },
}));
vi.mock("@/lib/customer/dal", () => ({
  CustomerAuthenticationError: class CustomerAuthenticationError extends Error {},
  CustomerEmailNotVerifiedError: class CustomerEmailNotVerifiedError extends Error {},
  getCurrentAuthenticatedCustomer: mocks.currentCustomer,
}));
vi.mock("./expire-initial-payments", () => ({ expireInitialPayment: mocks.expire }));

import {
  CoursePaymentCustomerDeniedError,
  CoursePaymentNotFoundError,
  getOwnedCoursePayment,
  requireActiveCourseCustomer,
} from "./course-payment-access";

const payment = {
  id: "payment-1",
  kind: "INITIAL_ENROLLMENT",
  status: "PENDING",
  periodStart: new Date("2026-10-10T00:00:00Z"),
  periodEnd: new Date("2026-11-10T00:00:00Z"),
  expiresAt: new Date("2026-10-20T00:00:00Z"),
  baseAmountCents: 5000,
  discountAmountCents: 500,
  finalAmountCents: 4500,
  currency: "USD",
  promotionNameSnapshot: "Launch offer",
  enrollment: {
    id: "enrollment-1",
    status: "PENDING_PAYMENT",
    student: { id: "learner-1", fullName: "Learner" },
    customer: { id: "customer-1", email: "owner@example.invalid", locale: "en" },
    coursePlan: { code: "BEGINNER_GROUP", level: "BEGINNER", format: "GROUP" },
    cohort: null,
  },
  submissions: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findPayment.mockResolvedValue(payment);
  mocks.findRelation.mockResolvedValue({ type: "GUARDIAN", endedAt: null, archivedAt: null });
});

describe("course payment ownership and display", () => {
  it("scopes by authoritative customer id and returns immutable payment snapshots", async () => {
    const result = await getOwnedCoursePayment("customer-1", "payment-1", new Date("2026-10-12T00:00:00Z"));
    expect(mocks.findPayment.mock.calls[0][0].where).toEqual({
      id: "payment-1",
      enrollment: { customerId: "customer-1" },
    });
    expect(JSON.stringify(mocks.findPayment.mock.calls[0][0].where)).not.toContain("email");
    expect(result).toMatchObject({
      baseAmountCents: 5000,
      discountAmountCents: 500,
      finalAmountCents: 4500,
      currency: "USD",
      promotionName: "Launch offer",
      relationship: "GUARDIAN",
      periodStart: new Date("2026-10-10T00:00:00Z"),
      expiresAt: new Date("2026-10-20T00:00:00Z"),
    });
  });

  it("does not reveal an enumerated payment to another customer, even with a colliding email", async () => {
    mocks.findPayment.mockResolvedValue(null);
    await expect(getOwnedCoursePayment("wrong-customer", "payment-1")).rejects.toBeInstanceOf(CoursePaymentNotFoundError);
    expect(mocks.findRelation).not.toHaveBeenCalled();
  });

  it("runs authoritative expiration before displaying a late initial payment", async () => {
    mocks.findPayment
      .mockResolvedValueOnce({ ...payment, expiresAt: new Date("2026-10-08T00:00:00Z") })
      .mockResolvedValueOnce({ ...payment, status: "EXPIRED", expiresAt: new Date("2026-10-08T00:00:00Z") });
    const result = await getOwnedCoursePayment("customer-1", "payment-1", new Date("2026-10-09T00:00:00Z"));
    expect(mocks.expire).toHaveBeenCalledWith("payment-1", new Date("2026-10-09T00:00:00Z"));
    expect(result.displayStatus).toBe("EXPIRED");
  });

  it("supports both active SELF and GUARDIAN ownership relationships", async () => {
    mocks.findRelation.mockResolvedValue({ type: "SELF", endedAt: null, archivedAt: null });
    await expect(getOwnedCoursePayment("customer-1", "payment-1")).resolves.toMatchObject({ relationship: "SELF" });
    mocks.findRelation.mockResolvedValue({ type: "GUARDIAN", endedAt: null, archivedAt: null });
    await expect(getOwnedCoursePayment("customer-1", "payment-1")).resolves.toMatchObject({ relationship: "GUARDIAN" });
  });
});

describe("active customer requirement", () => {
  it("denies missing, disabled, deactivated, or archived customer rows", async () => {
    for (const customer of [
      null,
      { status: "DISABLED", archivedAt: null, deactivatedAt: null },
      { status: "ACTIVE", archivedAt: null, deactivatedAt: new Date() },
      { status: "ACTIVE", archivedAt: new Date(), deactivatedAt: null },
    ]) {
      mocks.currentCustomer.mockResolvedValueOnce(customer);
      await expect(requireActiveCourseCustomer()).rejects.toBeInstanceOf(CoursePaymentCustomerDeniedError);
    }
  });
});
