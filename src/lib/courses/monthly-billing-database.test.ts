/** Opt-in monthly billing coverage against a loopback-only disposable PostgreSQL database. */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/email", () => ({ sendEmail: vi.fn(async () => ({ sent: true, providerMessageId: "local-only" })) }));
const state = vi.hoisted(() => ({ adminId: "" }));
vi.mock("@/lib/admin/dal", () => ({ verifyAdminSession: async () => ({ adminId: state.adminId }) }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("./course-payment-proofs", () => ({
  uploadCoursePaymentProof: async (paymentId: string, submissionId: string) =>
    `course-payments/${paymentId}/${submissionId}/proof.png`,
  removeCoursePaymentProof: vi.fn(),
}));
vi.mock("@/lib/db", () => {
  const url = new URL(process.env.MONTHLY_BILLING_TEST_DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/monthly_billing") {
    throw new Error("Refusing non-disposable monthly billing database");
  }
  return { prisma: new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 12 }) }) };
});

describe.runIf(Boolean(process.env.MONTHLY_BILLING_TEST_DATABASE_URL))("PostgreSQL monthly billing", () => {
  let db: PrismaClient;
  let generate: typeof import("./monthly-billing").generateMonthlyPaymentForEnrollment;
  let pastDue: typeof import("./monthly-billing").markMonthlyPaymentPastDue;
  let submit: typeof import("./submit-course-payment-proof").submitCoursePaymentProofForCustomer;
  let review: typeof import("./review-course-payment").reviewCoursePayment;
  let reminders: typeof import("./payment-reminders").generateMonthlyPaymentReminders;
  const prefix = `monthly-${Date.now()}`;

  beforeAll(async () => {
    db = (await import("@/lib/db")).prisma;
    expect((await db.$queryRaw<{ host: string }[]>`SELECT host(inet_server_addr()) AS host`)[0].host).toBe("127.0.0.1");
    generate = (await import("./monthly-billing")).generateMonthlyPaymentForEnrollment;
    pastDue = (await import("./monthly-billing")).markMonthlyPaymentPastDue;
    submit = (await import("./submit-course-payment-proof")).submitCoursePaymentProofForCustomer;
    review = (await import("./review-course-payment")).reviewCoursePayment;
    reminders = (await import("./payment-reminders")).generateMonthlyPaymentReminders;
    state.adminId = (await db.admin.create({ data: {
      username: `${prefix}-admin`, displayName: "Disposable monthly reviewer", passwordHash: "local-test-only",
    } })).id;
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  afterAll(async () => { await db?.$disconnect(); });

  async function fixture(options: { courseEndDate?: string | null; billingTimeZone?: string | null; status?: "ACTIVE" | "COMPLETED"; archived?: boolean } = {}) {
    const id = randomUUID();
    const plan = await db.coursePlan.findUniqueOrThrow({ where: { code: "BEGINNER_GROUP" } });
    const customer = await db.customer.create({ data: {
      supabaseUserId: id, email: `${id}@example.invalid`, emailNormalized: `${id}@example.invalid`,
      emailVerifiedAt: new Date(), emailSyncedAt: new Date(),
    } });
    const learner = await db.studentProfile.create({ data: { fullName: `Learner ${id}` } });
    await db.customerStudentRelation.create({ data: { customerId: customer.id, studentId: learner.id, type: "GUARDIAN" } });
    const cohort = await db.courseCohort.create({ data: {
      coursePlanId: plan.id, code: id, name: "Disposable monthly cohort", status: "ACTIVE",
      weeklyDay: "SATURDAY", localStartTime: new Date("1970-01-01T18:00:00Z"), durationMinutes: 60,
      timeZone: options.billingTimeZone ?? "America/New_York",
      courseStartDate: new Date("2026-01-31T00:00:00Z"),
      courseEndDate: options.courseEndDate ? new Date(`${options.courseEndDate}T00:00:00Z`) : null,
      seats: { create: [1, 2, 3, 4].map(position => ({ position })) },
    }, include: { seats: { orderBy: { position: "asc" } } } });
    const application = await db.courseApplication.create({ data: {
      fullName: learner.fullName, email: customer.email, customerId: customer.id, studentProfileId: learner.id,
      requestedPlanId: plan.id, status: "APPROVED", locale: "en",
    } });
    const enrollment = await db.courseEnrollment.create({ data: {
      studentId: learner.id, customerId: customer.id, applicationId: application.id, coursePlanId: plan.id,
      cohortId: cohort.id, status: options.status ?? "ACTIVE",
      completedAt: options.status === "COMPLETED" ? new Date("2026-02-01T00:00:00Z") : null,
      levelSnapshot: plan.level,
      formatSnapshot: plan.format, planCodeSnapshot: plan.code, startsAt: cohort.courseStartDate,
      billingTimeZone: options.billingTimeZone === undefined ? "America/New_York" : options.billingTimeZone,
      archivedAt: options.archived ? new Date() : null,
    } });
    const createdAt = new Date("2026-01-20T12:00:00Z");
    const initial = await db.coursePayment.create({ data: {
      enrollmentId: enrollment.id, kind: "INITIAL_ENROLLMENT", status: "VERIFIED",
      periodStart: new Date("2026-01-31T00:00:00Z"), periodEnd: new Date("2026-02-28T00:00:00Z"),
      baseAmountCents: plan.monthlyPriceCents, finalAmountCents: plan.monthlyPriceCents, currency: "USD",
      createdAt, expiresAt: new Date(createdAt.getTime() + 7 * 86_400_000),
      verifiedAt: new Date("2026-01-21T12:00:00Z"), verifiedByAdminId: state.adminId,
    } });
    const access = await db.coursePortalAccess.create({ data: {
      enrollmentId: enrollment.id, status: "ENABLED", changedByAdminId: state.adminId,
      changedAt: new Date("2026-01-21T12:00:00Z"), reason: "INITIAL_PAYMENT_VERIFIED",
    } });
    const seat = await db.courseCohortSeat.update({ where: { id: cohort.seats[0].id }, data: {
      currentEnrollmentId: enrollment.id, assignedAt: new Date("2026-01-21T12:00:00Z"), reservedUntil: null,
    } });
    return { plan, customer, learner, cohort, application, enrollment, initial, access, seat };
  }

  const proof = { bytes: new Uint8Array([1]), mimeType: "image/png" as const, fileSizeBytes: 1, originalFileName: "proof.png", storageExtension: "png" };
  const fields = { method: "ZELLE" as const, senderName: "Guardian payer", amountSentCents: 5000, sentAt: new Date("2026-03-01T12:00:00Z"), transactionReference: null };

  it("filters ineligible schedules before the batch limit and respects the exact local horizon", async () => {
    const f = await fixture();
    expect((await generate(f.enrollment.id, new Date("2026-02-21T04:59:59.999Z"))).outcome).toBe("TOO_EARLY");
    const missing = await fixture({ billingTimeZone: null });
    const archived = await fixture({ archived: true });
    expect((await generate(missing.enrollment.id)).outcome).toBe("INELIGIBLE");
    expect((await generate(archived.enrollment.id)).outcome).toBe("INELIGIBLE");
    const batch = (await import("./monthly-billing")).generateEligibleMonthlyPayments;
    const results = await batch(new Date("2026-02-21T05:00:00Z"), 1);
    expect(results.results).toEqual([expect.objectContaining({ enrollmentId: f.enrollment.id, outcome: "CREATED" })]);
    expect((await batch(new Date("2026-02-21T05:00:00Z"), 1)).results).toHaveLength(0);
  });

  it("serializes completion versus generation without resurrecting enrollment", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      generate(f.enrollment.id, new Date("2026-02-21T05:00:00Z")),
      db.courseEnrollment.update({ where: { id: f.enrollment.id }, data: { status: "COMPLETED", completedAt: new Date() } }),
    ]);
    expect(results.every(result => result.status === "fulfilled")).toBe(true);
    expect((await generate(f.enrollment.id)).outcome).toBe("INELIGIBLE");
    expect(await db.coursePayment.count({ where: { enrollmentId: f.enrollment.id, kind: "MONTHLY" } })).toBeLessThanOrEqual(1);
    expect(await db.coursePortalAccess.findUnique({ where: { id: f.access.id } })).toEqual(f.access);
  });

  it("monthly scheduler races, duplicate proofs and verify preserve the existing access/seat", async () => {
    const f = await fixture();
    vi.setSystemTime(new Date("2026-02-28T06:00:00Z"));
    const job = (await import("./expiration-job")).runInitialPaymentExpirationJob;
    vi.spyOn(console, "info").mockImplementation(() => {});
    await Promise.all([job(), job()]);
    const payments = await db.coursePayment.findMany({ where: { enrollmentId: f.enrollment.id, kind: "MONTHLY" } });
    expect(payments).toHaveLength(1);
    const p = payments[0];
    const results = await Promise.all([
      submit(f.customer.id, p.id, fields, proof), submit(f.customer.id, p.id, fields, proof), job(),
    ]);
    expect(results[0].submission.id).toBe(results[1].submission.id);
    expect(await db.coursePaymentSubmission.count({ where: { paymentId: p.id } })).toBe(1);
    const input = { action: "VERIFY", submissionId: results[0].submission.id, confirmation: true };
    await Promise.all([job(), review(p.id, input)]);
    expect(await db.coursePayment.findUnique({ where: { id: p.id } })).toMatchObject({ status: "VERIFIED" });
    expect(await db.coursePaymentNotification.count({ where: { paymentId: p.id, kind: "PAYMENT_VERIFIED" } })).toBe(1);
    expect(await db.coursePortalAccess.findUnique({ where: { id: f.access.id } })).toEqual(f.access);
    expect(await db.courseCohortSeat.findUnique({ where: { id: f.seat.id } })).toEqual(f.seat);
  });

  it("rejection before due returns PENDING; rejection after due races safely with past-due", async () => {
    const f = await fixture();
    await generate(f.enrollment.id, new Date("2026-02-21T05:00:00Z"));
    const p = await db.coursePayment.findFirstOrThrow({ where: { enrollmentId: f.enrollment.id, kind: "MONTHLY" } });
    const first = await submit(f.customer.id, p.id, fields, proof, new Date("2026-02-22T00:00:00Z"));
    vi.setSystemTime(new Date("2026-02-23T00:00:00Z"));
    const rejection = { action: "REJECT", submissionId: first.submission.id, confirmation: true, reason: "Funds not received" };
    expect((await review(p.id, rejection)).status).toBe("PENDING");
    const second = await submit(f.customer.id, p.id, fields, proof, new Date("2026-02-24T00:00:00Z"));
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    await Promise.all([review(p.id, { ...rejection, submissionId: second.submission.id }), pastDue(p.id)]);
    expect(await db.coursePayment.findUnique({ where: { id: p.id } })).toMatchObject({ status: "PAST_DUE" });
    expect(await db.coursePortalAccess.findUnique({ where: { id: f.access.id } })).toEqual(f.access);
    expect(await db.courseCohortSeat.findUnique({ where: { id: f.seat.id } })).toEqual(f.seat);
  });

  it("generates one anchored obligation concurrently, snapshots current price, and never applies promotion", async () => {
    const f = await fixture();
    const originalPrice = f.plan.monthlyPriceCents;
    try {
      await db.coursePlan.update({ where: { id: f.plan.id }, data: { monthlyPriceCents: originalPrice + 100 } });
      const now = new Date("2026-02-21T05:00:00Z");
      const results = await Promise.all([generate(f.enrollment.id, now), generate(f.enrollment.id, now)]);
      expect(results.filter(result => result.outcome === "CREATED")).toHaveLength(1);
      expect(results.filter(result => result.outcome !== "CREATED")).toHaveLength(1);
      const first = await db.coursePayment.findFirstOrThrow({ where: { enrollmentId: f.enrollment.id, kind: "MONTHLY" } });
      expect(first).toMatchObject({
        periodStart: new Date("2026-02-28T00:00:00Z"), periodEnd: new Date("2026-03-31T00:00:00Z"),
        baseAmountCents: originalPrice + 100, discountAmountCents: 0, finalAmountCents: originalPrice + 100,
        promotionId: null, promotionNameSnapshot: null, discountTypeSnapshot: null, discountValueSnapshot: null,
      });
      expect(await db.coursePaymentNotification.count({ where: { paymentId: first.id, kind: "PAYMENT_REQUIRED" } })).toBe(1);

      await db.coursePlan.update({ where: { id: f.plan.id }, data: { monthlyPriceCents: originalPrice + 200 } });
      expect((await generate(f.enrollment.id, new Date("2026-03-24T04:00:00Z"))).outcome).toBe("CREATED");
      const payments = await db.coursePayment.findMany({ where: { enrollmentId: f.enrollment.id, kind: "MONTHLY" }, orderBy: { periodStart: "asc" } });
      expect(payments.map(payment => payment.finalAmountCents)).toEqual([originalPrice + 100, originalPrice + 200]);
      expect(payments[0].finalAmountCents).toBe(originalPrice + 100);
    } finally {
      await db.coursePlan.update({ where: { id: f.plan.id }, data: { monthlyPriceCents: originalPrice } });
    }
  });

  it("creates a late ledger obligation after grace and marks it past due without changing access, enrollment, or seat", async () => {
    const f = await fixture();
    expect((await generate(f.enrollment.id, new Date("2026-03-20T12:00:00Z"))).outcome).toBe("CREATED");
    const payment = await db.coursePayment.findFirstOrThrow({ where: { enrollmentId: f.enrollment.id, kind: "MONTHLY" } });
    expect(payment.expiresAt < payment.createdAt).toBe(true);
    const results = await Promise.all([pastDue(payment.id, new Date("2026-03-20T12:00:00Z")), pastDue(payment.id, new Date("2026-03-20T12:00:00Z"))]);
    expect(results.map(result => result.outcome).sort()).toEqual(["PAST_DUE", "SKIPPED"]);
    expect(await db.coursePaymentNotification.count({ where: { paymentId: payment.id, kind: "MONTHLY_PAYMENT_PAST_DUE" } })).toBe(1);
    await expect(submit(f.customer.id, payment.id, fields, proof, new Date(payment.expiresAt.getTime() + 1))).rejects.toThrow("expired");
    expect(await db.courseEnrollment.findUnique({ where: { id: f.enrollment.id } })).toMatchObject({ status: "ACTIVE" });
    expect(await db.coursePortalAccess.findUnique({ where: { id: f.access.id } })).toEqual(f.access);
    expect(await db.courseCohortSeat.findUnique({ where: { id: f.seat.id } })).toEqual(f.seat);
  });

  it("protects submitted proof from past-due transition and keeps monthly review financially isolated", async () => {
    const f = await fixture();
    await generate(f.enrollment.id, new Date("2026-02-21T05:00:00Z"));
    const payment = await db.coursePayment.findFirstOrThrow({ where: { enrollmentId: f.enrollment.id, kind: "MONTHLY" } });
    const submittedAt = new Date(payment.dueAt!.getTime() + 1);
    const [submission] = await Promise.all([
      submit(f.customer.id, payment.id, { ...fields, amountSentCents: payment.finalAmountCents }, proof, submittedAt),
      pastDue(payment.id, submittedAt),
    ]);
    expect(await db.coursePayment.findUnique({ where: { id: payment.id } })).toMatchObject({ status: "PROOF_SUBMITTED" });
    expect((await pastDue(payment.id, submittedAt)).outcome).toBe("SKIPPED");

    vi.useFakeTimers();
    vi.setSystemTime(new Date(payment.dueAt!.getTime() + 2));
    expect((await review(payment.id, { action: "REJECT", submissionId: submission.submission.id, confirmation: true, reason: "Reference could not be confirmed" })).status).toBe("PAST_DUE");
    expect(await db.courseEnrollment.findUnique({ where: { id: f.enrollment.id } })).toMatchObject({ status: "ACTIVE" });
    expect(await db.coursePortalAccess.findUnique({ where: { id: f.access.id } })).toEqual(f.access);
    expect(await db.courseCohortSeat.findUnique({ where: { id: f.seat.id } })).toEqual(f.seat);

    const retry = await submit(f.customer.id, payment.id, { ...fields, amountSentCents: payment.finalAmountCents }, proof, new Date(payment.expiresAt.getTime() - 1));
    expect(retry.idempotent).toBe(false);
    expect((await review(payment.id, { action: "VERIFY", submissionId: retry.submission.id, confirmation: true })).status).toBe("VERIFIED");
    expect(await db.coursePaymentSubmission.count({ where: { paymentId: payment.id } })).toBe(2);
    expect(await db.courseApplicationEvent.count({ where: { applicationId: f.application.id } })).toBe(2);
    expect(await db.coursePortalAccess.findUnique({ where: { id: f.access.id } })).toEqual(f.access);
    expect(await db.courseCohortSeat.findUnique({ where: { id: f.seat.id } })).toEqual(f.seat);
  });

  it("deduplicates concurrent reminders and excludes inactive or final-partial enrollments", async () => {
    const active = await fixture();
    await generate(active.enrollment.id, new Date("2026-02-21T05:00:00Z"));
    const payment = await db.coursePayment.findFirstOrThrow({ where: { enrollmentId: active.enrollment.id, kind: "MONTHLY" } });
    const reminderNow = new Date(payment.dueAt!.getTime() - 72 * 60 * 60 * 1000);
    await Promise.all([reminders(reminderNow), reminders(reminderNow)]);
    expect(await db.coursePaymentNotification.count({ where: { paymentId: payment.id, kind: "MONTHLY_PAYMENT_REMINDER_72H" } })).toBe(1);

    const completed = await fixture({ status: "COMPLETED" });
    expect((await generate(completed.enrollment.id, new Date("2026-02-21T05:00:00Z"))).outcome).toBe("INELIGIBLE");
    const partial = await fixture({ courseEndDate: "2026-03-15" });
    expect((await generate(partial.enrollment.id, new Date("2026-02-21T05:00:00Z"))).outcome).toBe("PARTIAL_FINAL_PERIOD");
    expect(await db.coursePayment.count({ where: { enrollmentId: { in: [completed.enrollment.id, partial.enrollment.id] }, kind: "MONTHLY" } })).toBe(0);
  });

  it("enforces immutable billing timezone and payment snapshots while allowing workflow status", async () => {
    const f = await fixture();
    await expect(db.courseEnrollment.update({ where: { id: f.enrollment.id }, data: { billingTimeZone: "Europe/London" } })).rejects.toThrow();
    await generate(f.enrollment.id, new Date("2026-02-21T05:00:00Z"));
    const payment = await db.coursePayment.findFirstOrThrow({ where: { enrollmentId: f.enrollment.id, kind: "MONTHLY" } });
    await expect(db.coursePayment.update({ where: { id: payment.id }, data: { finalAmountCents: payment.finalAmountCents + 1 } })).rejects.toThrow();
    await expect(db.coursePayment.update({ where: { id: payment.id }, data: { expiresAt: new Date(payment.expiresAt.getTime() + 1) } })).rejects.toThrow();
    await expect(db.coursePayment.update({ where: { id: payment.id }, data: { status: "PAST_DUE" } })).resolves.toMatchObject({ status: "PAST_DUE" });
  });
});
