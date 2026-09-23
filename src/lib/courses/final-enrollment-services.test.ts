import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  });
  const tx = {
    courseApplication: model(), courseApplicationEvent: model(), coursePlan: model(), courseCohort: model(),
    courseCohortSeat: model(), courseEnrollment: model(), coursePayment: model(), coursePaymentSubmission: model(),
    coursePaymentNotification: model(),
    coursePromotion: model(), coursePortalAccess: model(), customerStudentRelation: model(), customer: model(),
    studentProfile: model(), $queryRaw: vi.fn(),
  };
  return { tx, auth: vi.fn(), getUser: vi.fn(), transaction: vi.fn() };
});
vi.mock("@/lib/db", () => ({ prisma: { ...mocks.tx, $transaction: mocks.transaction } }));
vi.mock("@/lib/admin/dal", () => ({ verifyAdminSession: mocks.auth }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { auth: { admin: { getUserById: mocks.getUser } } } }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: vi.fn() }));

import { createEnrollmentAndInitialPayment } from "./create-enrollment";
import { expireInitialPayment } from "./expire-initial-payments";

const authId = "11111111-1111-4111-8111-111111111111";
const plan = {
  id: "plan", code: "BEGINNER_GROUP", level: "BEGINNER", format: "GROUP", billingInterval: "MONTHLY",
  monthlyPriceCents: 5000, currency: "USD", active: true, archivedAt: null,
};
const customer = {
  id: "customer", supabaseUserId: authId, email: "payer@example.invalid", status: "ACTIVE",
  archivedAt: null, deactivatedAt: null,
};
const learner = {
  id: "learner", fullName: "Learner", supabaseUserId: null, email: null, status: "ACTIVE",
  archivedAt: null, portalAccess: false,
};
const seats = [1, 2, 3, 4].map(position => ({
  id: `seat-${position}`, position, currentEnrollmentId: null, assignedAt: null, reservedUntil: null,
}));
const cohort = {
  id: "cohort", code: "GROUP-A", name: "Group A", coursePlanId: "plan", coursePlan: { ...plan, groupMinimumStudents: 3, groupMaximumStudents: 4 },
  status: "OPEN", archivedAt: null, minimumStudents: 3, maximumStudents: 4, weeklyDay: "SATURDAY",
  localStartTime: new Date("1970-01-01T18:00:00Z"), durationMinutes: 60, timeZone: "America/New_York",
  courseStartDate: new Date("2026-01-31T00:00:00Z"), courseEndDate: null, seats,
};
const application = {
  id: "app", status: "APPROVED", requestedPlanId: "plan", customerId: "customer", studentProfileId: "learner",
  locale: "en", courseEnrollment: null,
};
const input = {
  relationship: "GUARDIAN", supabaseUserId: authId, learner: { mode: "EXISTING", studentId: "learner" },
  coursePlanId: "plan", cohortId: "cohort", agreedStartDate: null,
  confirmation: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ adminId: "admin" });
  mocks.getUser.mockResolvedValue({ data: { user: { id: authId, email: customer.email, email_confirmed_at: "2026-01-01T00:00:00Z" } }, error: null });
  mocks.transaction.mockImplementation(async work => work(mocks.tx));
  mocks.tx.courseApplication.findUnique.mockResolvedValue(application);
  mocks.tx.coursePlan.findUnique.mockResolvedValue(plan);
  mocks.tx.courseCohort.findUnique.mockResolvedValue(cohort);
  mocks.tx.customer.upsert.mockResolvedValue(customer);
  mocks.tx.studentProfile.findUnique.mockResolvedValue(learner);
  mocks.tx.customerStudentRelation.findMany.mockResolvedValue([]);
  mocks.tx.customerStudentRelation.create.mockResolvedValue({ id: "relation", customerId: "customer", studentId: "learner", type: "GUARDIAN", isPrimary: true, endedAt: null, archivedAt: null });
  mocks.tx.coursePromotion.findFirst.mockResolvedValue(null);
  mocks.tx.courseEnrollment.create.mockImplementation(async ({ data }) => ({ id: "enrollment", ...data }));
  mocks.tx.coursePayment.create.mockImplementation(async ({ data }) => ({ id: "payment", promotionNameSnapshot: null, ...data }));
  mocks.tx.coursePaymentNotification.createMany.mockResolvedValue({ count: 1 });
});

describe("final enrollment transaction", () => {
  it("creates one pending group enrollment, deterministic seat and pending initial payment", async () => {
    const result = await createEnrollmentAndInitialPayment("app", input);
    expect(result).toMatchObject({
      idempotent: false,
      relationship: "GUARDIAN",
      cohort: { id: "cohort", seatPosition: 1 },
      enrollment: { id: "enrollment", status: "PENDING_PAYMENT", startsAt: "2026-01-31" },
      payment: { kind: "INITIAL_ENROLLMENT", status: "PENDING", periodStart: "2026-01-31", periodEnd: "2026-02-28", baseAmountCents: 5000, discountAmountCents: 0, finalAmountCents: 5000 },
      warnings: ["PAYMENT NOT VERIFIED", "PORTAL ACCESS NOT ACTIVE"],
    });
    expect(mocks.tx.customerStudentRelation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "GUARDIAN" }) });
    expect(mocks.tx.courseEnrollment.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      applicationId: "app", status: "PENDING_PAYMENT", levelSnapshot: "BEGINNER", formatSnapshot: "GROUP", planCodeSnapshot: "BEGINNER_GROUP",
    }) });
    const paymentData = mocks.tx.coursePayment.create.mock.calls[0][0].data;
    const seatData = mocks.tx.courseCohortSeat.update.mock.calls[0][0].data;
    expect(paymentData.dueAt).toBeNull();
    expect(paymentData.revision).toBe(1);
    expect(paymentData.expiresAt.getTime() - paymentData.createdAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(seatData.reservedUntil).toEqual(paymentData.expiresAt);
    expect(seatData.assignedAt).toEqual(paymentData.createdAt);
    expect(mocks.tx.coursePortalAccess.create).not.toHaveBeenCalled();
    expect(mocks.tx.studentProfile.update).not.toHaveBeenCalled();
    expect(mocks.tx.coursePaymentNotification.createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ paymentId: "payment", kind: "PAYMENT_REQUIRED", deduplicationKey: "PAYMENT" }),
      skipDuplicates: true,
    });
  });

  it("evaluates promotion eligibility at the same authoritative timestamp and snapshots it", async () => {
    mocks.tx.coursePromotion.findFirst.mockResolvedValue({ id: "promo", name: "Ten percent", discountType: "PERCENT", discountValue: 10 });
    await createEnrollmentAndInitialPayment("app", input);
    const paymentData = mocks.tx.coursePayment.create.mock.calls[0][0].data;
    const where = mocks.tx.coursePromotion.findFirst.mock.calls[0][0].where;
    expect(where.startsAt.lte).toEqual(paymentData.createdAt);
    expect(where.endsAt.gt).toEqual(paymentData.createdAt);
    expect(where).toMatchObject({ enabled: true, cancelledAt: null, coursePlanId: "plan" });
    expect(paymentData).toMatchObject({ promotionId: "promo", promotionNameSnapshot: "Ten percent", discountAmountCents: 500, finalAmountCents: 4500 });
  });

  it("creates 1-to-1 without a cohort or seat and requires the explicit start", async () => {
    mocks.tx.coursePlan.findUnique.mockResolvedValue({ ...plan, code: "INTERMEDIATE_ONE_TO_ONE", level: "INTERMEDIATE", format: "ONE_TO_ONE", monthlyPriceCents: 8500 });
    const result = await createEnrollmentAndInitialPayment("app", { ...input, cohortId: null, agreedStartDate: "2028-01-31" });
    expect(result.cohort).toBeNull();
    expect(result.payment.periodEnd).toBe("2028-02-29");
    expect(mocks.tx.courseCohortSeat.update).not.toHaveBeenCalled();
    expect(mocks.tx.courseEnrollment.create.mock.calls[0][0].data.cohortId).toBeNull();
  });

  it("requires approval and verified identity before creating business records", async () => {
    mocks.tx.courseApplication.findUnique.mockResolvedValue({ ...application, status: "DECLINED" });
    await expect(createEnrollmentAndInitialPayment("app", input)).rejects.toThrow("APPROVED");
    expect(mocks.tx.courseEnrollment.create).not.toHaveBeenCalled();
    mocks.getUser.mockResolvedValue({ data: { user: { id: authId, email: customer.email, email_confirmed_at: null } }, error: null });
    await expect(createEnrollmentAndInitialPayment("app", input)).rejects.toThrow("verified");
  });

  it("does not accept client-controlled price, promotion, status or seat", async () => {
    await expect(createEnrollmentAndInitialPayment("app", { ...input, confirmation: false })).rejects.toThrow();
    await expect(createEnrollmentAndInitialPayment("app", { ...input, finalAmountCents: 1 })).rejects.toThrow();
    await expect(createEnrollmentAndInitialPayment("app", { ...input, seatId: "seat-4" })).rejects.toThrow();
    expect(mocks.tx.courseEnrollment.create).not.toHaveBeenCalled();
  });

  it("keeps all writes inside one serializable transaction and propagates payment failure", async () => {
    mocks.tx.coursePayment.create.mockRejectedValue(new Error("injected payment failure"));
    await expect(createEnrollmentAndInitialPayment("app", input)).rejects.toThrow("injected payment failure");
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(mocks.tx.courseApplicationEvent.create).not.toHaveBeenCalled();
  });
});

describe("initial payment expiration", () => {
  const expiredPayment = {
    id: "payment", kind: "INITIAL_ENROLLMENT", status: "PENDING", expiresAt: new Date("2026-10-08T00:00:00Z"),
    enrollmentId: "enrollment", enrollment: {
      id: "enrollment", status: "PENDING_PAYMENT", archivedAt: null, cohortId: "cohort",
      planCodeSnapshot: "BEGINNER_GROUP", portalAccess: null, applicationId: null, application: null,
      customer: { email: "payer@example.invalid", locale: "en" }, student: { fullName: "Learner" },
      cohort: { id: "cohort", status: "FULL", archivedAt: null },
    },
  };

  it("expires payment, cancels pending enrollment, releases the seat and reopens a full cohort", async () => {
    mocks.tx.courseCohortSeat.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.coursePayment.findUnique.mockResolvedValue(expiredPayment);
    mocks.tx.coursePaymentSubmission.findFirst.mockResolvedValue(null);
    expect(await expireInitialPayment("payment", new Date("2026-10-09T00:00:00Z"))).toEqual({ paymentId: "payment", outcome: "EXPIRED" });
    expect(mocks.tx.coursePayment.update).toHaveBeenCalledWith({ where: { id: "payment" }, data: { status: "EXPIRED" } });
    expect(mocks.tx.courseEnrollment.update).toHaveBeenCalledWith({ where: { id: "enrollment" }, data: expect.objectContaining({ status: "CANCELLED", cancellationReason: "INITIAL_PAYMENT_EXPIRED" }) });
    expect(mocks.tx.courseCohortSeat.updateMany).toHaveBeenCalledWith({ where: { cohortId: "cohort", currentEnrollmentId: "enrollment" }, data: { currentEnrollmentId: null, assignedAt: null, reservedUntil: null } });
    expect(mocks.tx.courseCohort.update).toHaveBeenCalledWith({ where: { id: "cohort" }, data: { status: "OPEN" } });
    expect(mocks.tx.coursePortalAccess.update).not.toHaveBeenCalled();
    expect(mocks.tx.coursePaymentNotification.createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ paymentId: "payment", kind: "INITIAL_PAYMENT_EXPIRED", deduplicationKey: "PAYMENT" }),
      skipDuplicates: true,
    });
  });

  it("preserves a timely reviewable proof after the deadline", async () => {
    mocks.tx.coursePayment.findUnique.mockResolvedValue(expiredPayment);
    mocks.tx.coursePaymentSubmission.findFirst.mockResolvedValue({ id: "proof" });
    expect(await expireInitialPayment("payment", new Date("2026-10-09T00:00:00Z"))).toEqual({ paymentId: "payment", outcome: "PROOF_REVIEWABLE" });
    expect(mocks.tx.coursePaymentSubmission.findFirst.mock.calls[0][0].where).toMatchObject({ submittedAt: { lt: expiredPayment.expiresAt }, status: { in: ["SUBMITTED", "ACCEPTED"] } });
    expect(mocks.tx.coursePayment.update).not.toHaveBeenCalled();
    expect(mocks.tx.courseEnrollment.update).not.toHaveBeenCalled();
  });

  it("does not reopen a full cohort when no seat belonging to this enrollment was released", async () => {
    mocks.tx.coursePayment.findUnique.mockResolvedValue(expiredPayment);
    mocks.tx.coursePaymentSubmission.findFirst.mockResolvedValue(null);
    mocks.tx.courseCohortSeat.updateMany.mockResolvedValue({ count: 0 });
    await expireInitialPayment("payment", new Date("2026-10-09T00:00:00Z"));
    expect(mocks.tx.courseCohort.update).not.toHaveBeenCalled();
  });

  it("does not cancel an unrelated active enrollment", async () => {
    mocks.tx.coursePayment.findUnique.mockResolvedValue({ ...expiredPayment, enrollment: { ...expiredPayment.enrollment, status: "ACTIVE" } });
    mocks.tx.coursePaymentSubmission.findFirst.mockResolvedValue(null);
    await expireInitialPayment("payment", new Date("2026-10-09T00:00:00Z"));
    expect(mocks.tx.coursePayment.update).not.toHaveBeenCalled();
    expect(mocks.tx.courseEnrollment.update).not.toHaveBeenCalled();
    expect(mocks.tx.courseCohortSeat.updateMany).not.toHaveBeenCalled();
  });
});
