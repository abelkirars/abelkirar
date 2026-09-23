/** Opt-in integration coverage. Refuses every target except the disposable loopback database. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  adminId: "",
  authId: "22222222-2222-4222-8222-222222222222",
}));
vi.mock("@/lib/admin/dal", () => ({ verifyAdminSession: async () => ({ adminId: state.adminId }) }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { auth: { admin: {
  getUserById: async (id: string) => ({ data: { user: { id, email: `${id}@example.invalid`, email_confirmed_at: "2026-01-01T00:00:00Z" } }, error: null }),
} } } }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const url = new URL(process.env.COURSE_FINAL_ENROLLMENT_TEST_DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/final_enrollment") throw new Error("Refusing non-disposable DB");
  return { prisma: new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 8 }) }) };
});

describe.runIf(Boolean(process.env.COURSE_FINAL_ENROLLMENT_TEST_DATABASE_URL))("real PostgreSQL final enrollment safety", () => {
  let db: PrismaClient;
  let create: typeof import("./create-enrollment");
  let expiration: typeof import("./expire-initial-payments");
  let planId: string;
  const prefix = `final-${Date.now()}`;

  async function createCohort(suffix: string) {
    return db.courseCohort.create({ data: {
      coursePlanId: planId,
      code: `${prefix}-${suffix}`,
      name: `Disposable ${suffix}`,
      status: "OPEN",
      weeklyDay: "SATURDAY",
      localStartTime: new Date("1970-01-01T18:00:00Z"),
      durationMinutes: 60,
      timeZone: "America/New_York",
      courseStartDate: new Date("2026-10-10T00:00:00Z"),
      seats: { create: [1, 2, 3, 4].map(position => ({ position })) },
    }, include: { seats: { orderBy: { position: "asc" } } } });
  }

  async function createApprovedApplication(suffix: string) {
    const learner = await db.studentProfile.create({ data: { fullName: `Learner ${suffix}`, portalAccess: false } });
    const application = await db.courseApplication.create({ data: {
      fullName: learner.fullName,
      email: `${prefix}-${suffix}@example.invalid`,
      status: "APPROVED",
      requestedPlanId: planId,
    } });
    return { learner, application };
  }

  function input(application: Awaited<ReturnType<typeof createApprovedApplication>>, cohortId: string) {
    return {
      relationship: "GUARDIAN" as const,
      supabaseUserId: state.authId,
      learner: { mode: "EXISTING" as const, studentId: application.learner.id },
      coursePlanId: planId,
      cohortId,
      agreedStartDate: null,
      confirmation: true,
    };
  }

  beforeAll(async () => {
    db = (await import("@/lib/db")).prisma;
    const target = await db.$queryRaw<{ host: string }[]>`SELECT host(inet_server_addr()) AS host`;
    expect(target[0].host).toBe("127.0.0.1");
    create = await import("./create-enrollment");
    expiration = await import("./expire-initial-payments");
    const admin = await db.admin.create({ data: { username: prefix, displayName: "Disposable final test", passwordHash: "disposable-test-only" } });
    state.adminId = admin.id;
    planId = (await db.coursePlan.findUniqueOrThrow({ where: { code: "BEGINNER_GROUP" } })).id;
  });
  afterAll(async () => { await db?.$disconnect(); });

  it("concurrent retries create one enrollment, payment, relation and seat reservation", async () => {
    const cohort = await createCohort("idempotent");
    const application = await createApprovedApplication("idempotent");
    const request = input(application, cohort.id);
    const [first, second] = await Promise.all([
      create.createEnrollmentAndInitialPayment(application.application.id, request),
      create.createEnrollmentAndInitialPayment(application.application.id, request),
    ]);
    expect(first.enrollment.id).toBe(second.enrollment.id);
    expect(first.payment.id).toBe(second.payment.id);
    expect([first.idempotent, second.idempotent].sort()).toEqual([false, true]);
    expect(await db.courseEnrollment.count({ where: { applicationId: application.application.id } })).toBe(1);
    expect(await db.coursePayment.count({ where: { enrollmentId: first.enrollment.id, kind: "INITIAL_ENROLLMENT" } })).toBe(1);
    expect(await db.customerStudentRelation.count({ where: { studentId: application.learner.id } })).toBe(1);
    const seat = await db.courseCohortSeat.findFirstOrThrow({ where: { currentEnrollmentId: first.enrollment.id } });
    const payment = await db.coursePayment.findUniqueOrThrow({ where: { id: first.payment.id } });
    expect(seat.position).toBe(1);
    expect(seat.reservedUntil).toEqual(payment.expiresAt);
    expect(payment.expiresAt.getTime() - payment.createdAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(await db.coursePortalAccess.count({ where: { enrollmentId: first.enrollment.id } })).toBe(0);
    expect((await db.studentProfile.findUniqueOrThrow({ where: { id: application.learner.id } })).portalAccess).toBe(false);
  });

  it("a concurrent final-seat race creates no fifth enrollment", async () => {
    const cohort = await createCohort("last-seat");
    const fillerCustomer = await db.customer.create({ data: {
      supabaseUserId: randomUUID(),
      email: `${prefix}-filler@example.invalid`, emailNormalized: `${prefix}-filler@example.invalid`,
      emailVerifiedAt: new Date(), emailSyncedAt: new Date(),
    } });
    for (let index = 0; index < 3; index++) {
      const student = await db.studentProfile.create({ data: { fullName: `Filler ${index}` } });
      const enrollment = await db.courseEnrollment.create({ data: {
        studentId: student.id, customerId: fillerCustomer.id, coursePlanId: planId, cohortId: cohort.id,
        levelSnapshot: "BEGINNER", formatSnapshot: "GROUP", planCodeSnapshot: "BEGINNER_GROUP",
        startsAt: cohort.courseStartDate,
      } });
      await db.courseCohortSeat.update({ where: { id: cohort.seats[index].id }, data: {
        currentEnrollmentId: enrollment.id, assignedAt: new Date(), reservedUntil: new Date(Date.now() + 86_400_000),
      } });
    }
    const left = await createApprovedApplication("race-left");
    const right = await createApprovedApplication("race-right");
    const settled = await Promise.allSettled([
      create.createEnrollmentAndInitialPayment(left.application.id, input(left, cohort.id)),
      create.createEnrollmentAndInitialPayment(right.application.id, input(right, cohort.id)),
    ]);
    expect(settled.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter(item => item.status === "rejected")).toHaveLength(1);
    expect(await db.courseCohortSeat.count({ where: { cohortId: cohort.id, currentEnrollmentId: { not: null } } })).toBe(4);
    expect(await db.courseEnrollment.count({ where: { applicationId: { in: [left.application.id, right.application.id] } } })).toBe(1);
    expect((await db.courseCohort.findUniqueOrThrow({ where: { id: cohort.id } })).status).toBe("FULL");
  });

  it("an invalid financial snapshot rolls back identity links, relation, enrollment and seat", async () => {
    const failureAuthId = "44444444-4444-4444-8444-444444444444";
    state.authId = failureAuthId;
    const cohort = await createCohort("rollback");
    const application = await createApprovedApplication("rollback");
    const now = new Date();
    const invalidPromotion = await db.coursePromotion.create({ data: {
      coursePlanId: planId,
      name: "Invalid full discount for rollback test",
      discountType: "FIXED",
      discountValue: 5000,
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() + 60_000),
    } });
    await expect(create.createEnrollmentAndInitialPayment(application.application.id, input(application, cohort.id))).rejects.toThrow("invalid payment amount");
    await db.coursePromotion.update({ where: { id: invalidPromotion.id }, data: { enabled: false, cancelledAt: new Date() } });
    expect(await db.customer.count({ where: { supabaseUserId: failureAuthId } })).toBe(0);
    expect(await db.customerStudentRelation.count({ where: { studentId: application.learner.id } })).toBe(0);
    expect(await db.courseEnrollment.count({ where: { applicationId: application.application.id } })).toBe(0);
    expect(await db.coursePayment.count({ where: { enrollment: { applicationId: application.application.id } } })).toBe(0);
    expect(await db.courseCohortSeat.count({ where: { cohortId: cohort.id, currentEnrollmentId: null } })).toBe(4);
    expect(await db.courseApplication.findUniqueOrThrow({ where: { id: application.application.id } })).toMatchObject({ customerId: null, studentProfileId: null });
    state.authId = "22222222-2222-4222-8222-222222222222";
  });

  it("expiration preserves timely proof, then expires another unpaid obligation and releases its seat", async () => {
    const proofCohort = await createCohort("proof");
    const proofApp = await createApprovedApplication("proof");
    const proofResult = await create.createEnrollmentAndInitialPayment(proofApp.application.id, input(proofApp, proofCohort.id));
    const expiresAt = new Date(proofResult.payment.expiresAt);
    await db.coursePaymentSubmission.create({ data: {
      paymentId: proofResult.payment.id, attemptNumber: 1, method: "ZELLE", amountSentCents: 5000,
      proofStoragePath: "disposable/proof.png", mimeType: "image/png", fileSizeBytes: 10,
      submittedAt: new Date(expiresAt.getTime() - 1),
    } });
    expect(await expiration.expireInitialPayment(proofResult.payment.id, new Date(expiresAt.getTime() + 1))).toEqual({ paymentId: proofResult.payment.id, outcome: "PROOF_REVIEWABLE" });
    expect((await db.coursePayment.findUniqueOrThrow({ where: { id: proofResult.payment.id } })).status).toBe("PENDING");

    const unpaidCohort = await createCohort("expire");
    const unpaidApp = await createApprovedApplication("expire");
    const unpaid = await create.createEnrollmentAndInitialPayment(unpaidApp.application.id, input(unpaidApp, unpaidCohort.id));
    await db.courseCohort.update({ where: { id: unpaidCohort.id }, data: { status: "FULL" } });
    expect(await expiration.expireInitialPayment(unpaid.payment.id, new Date(new Date(unpaid.payment.expiresAt).getTime() + 1))).toEqual({ paymentId: unpaid.payment.id, outcome: "EXPIRED" });
    expect(await db.coursePayment.findUniqueOrThrow({ where: { id: unpaid.payment.id } })).toMatchObject({ status: "EXPIRED" });
    expect(await db.courseEnrollment.findUniqueOrThrow({ where: { id: unpaid.enrollment.id } })).toMatchObject({ status: "CANCELLED", cancellationReason: "INITIAL_PAYMENT_EXPIRED" });
    expect(await db.courseCohortSeat.count({ where: { cohortId: unpaidCohort.id, currentEnrollmentId: null } })).toBe(4);
    expect((await db.courseCohort.findUniqueOrThrow({ where: { id: unpaidCohort.id } })).status).toBe("OPEN");
  });
});
