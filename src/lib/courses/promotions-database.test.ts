import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ authenticated: true }));
vi.mock("@/lib/admin/dal", () => ({ verifyAdminSession: async () => state.authenticated ? { adminId: "test-admin" } : null }));
vi.mock("@/lib/db", () => {
  const url = new URL(process.env.COURSE_PROMOTION_TEST_DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/course_promotions") throw new Error("Refusing non-disposable promotion test target");
  return { prisma: new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) }) };
});
describe.runIf(Boolean(process.env.COURSE_PROMOTION_TEST_DATABASE_URL))("PostgreSQL promotion management", () => {
  let db: PrismaClient;
  let service: typeof import("./promotions");
  let planId: string;
  beforeAll(async () => {
    db = (await import("@/lib/db")).prisma;
    service = await import("./promotions");
    expect((await db.$queryRaw<{ host: string }[]>`SELECT host(inet_server_addr()) AS host`)[0].host).toBe("127.0.0.1");
    planId = (await db.coursePlan.findUniqueOrThrow({ where: { code: "BEGINNER_ONE_TO_ONE" } })).id;
  });
  afterAll(async () => { await db?.$disconnect(); });
  const input = (month: number) => ({ coursePlanId: planId, name: "Local test promotion", discountType: "PERCENT" as const, discountValue: 10,
    startsAt: `2090-${String(month).padStart(2, "0")}-01T00:00:00.000Z`, endsAt: `2090-${String(month).padStart(2, "0")}-15T00:00:00.000Z`, publicCountdownEnabled: true });
  it("denies unauthorized changes", async () => {
    state.authenticated = false;
    try { await expect(service.createPromotion(input(1))).rejects.toThrow("Admin authentication required"); }
    finally { state.authenticated = true; }
    expect(await db.coursePromotion.count()).toBe(0);
  });
  it("concurrent overlapping creation has one winner and a clear conflict", async () => {
    const results = await Promise.allSettled([service.createPromotion(input(2)), service.createPromotion(input(2))]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(service.PromotionConflictError);
  });
  it("allows adjacent ranges but DB rejects bypassed overlap", async () => {
    const first = await service.createPromotion(input(3));
    const second = await service.createPromotion({ ...input(3), startsAt: first.endsAt.toISOString(), endsAt: "2090-03-30T00:00:00.000Z" });
    expect(second.id).not.toBe(first.id);
    await expect(db.coursePromotion.create({ data: { ...input(3), startsAt: new Date("2090-03-14T00:00:00Z"), endsAt: new Date("2090-03-16T00:00:00Z") } })).rejects.toThrow();
  });
  it("rejects invalid discount, reverse dates and inactive plan", async () => {
    await expect(service.createPromotion({ ...input(4), discountValue: 100 })).rejects.toThrow();
    await expect(service.createPromotion({ ...input(4), endsAt: "2089-01-01T00:00:00.000Z" })).rejects.toThrow();
    await db.coursePlan.update({ where: { id: planId }, data: { active: false } });
    try { await expect(service.createPromotion(input(4))).rejects.toThrow("Plan unavailable"); }
    finally { await db.coursePlan.update({ where: { id: planId }, data: { active: true } }); }
  });
  it("cancellation preserves a payment snapshot and permits a replacement range", async () => {
    const promotion = await service.createPromotion(input(5));
    const uuid = randomUUID();
    const customer = await db.customer.create({ data: { supabaseUserId: uuid, email: "local@example.invalid", emailNormalized: "local@example.invalid", emailVerifiedAt: new Date(), emailSyncedAt: new Date() } });
    const student = await db.studentProfile.create({ data: { fullName: "Local learner" } });
    const enrollment = await db.courseEnrollment.create({ data: { customerId: customer.id, studentId: student.id, coursePlanId: planId, levelSnapshot: "BEGINNER", formatSnapshot: "ONE_TO_ONE", planCodeSnapshot: "BEGINNER_ONE_TO_ONE", billingTimeZone: "Africa/Addis_Ababa" } });
    const { paymentPriceSnapshot } = await import("./course-payment-pricing");
    const createdAt = new Date();
    const payment = await db.coursePayment.create({ data: { enrollmentId: enrollment.id, kind: "INITIAL_ENROLLMENT", periodStart: new Date("2090-05-01T00:00:00Z"), periodEnd: new Date("2090-06-01T00:00:00Z"), createdAt, expiresAt: new Date(createdAt.getTime() + 7 * 86400000), ...paymentPriceSnapshot(7000, "USD", promotion) } });
    await service.cancelPromotion(promotion.id);
    await service.cancelPromotion(promotion.id);
    expect(await db.coursePayment.findUnique({ where: { id: payment.id } })).toEqual(payment);
    expect((await db.coursePromotion.findUniqueOrThrow({ where: { id: promotion.id } })).enabled).toBe(false);
    await expect(service.createPromotion(input(5))).resolves.toHaveProperty("id");
    expect(await db.coursePaymentNotification.count()).toBe(0);
  });
});
