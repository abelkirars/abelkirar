/** Opt-in tests against the loopback-only disposable PostgreSQL 17 cluster. */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";

vi.mock("server-only", () => ({}));
const send = vi.hoisted(() => vi.fn());
vi.mock("./email", () => ({ sendEmail: send }));
vi.mock("@/lib/db", () => {
  const url = new URL(process.env.COURSE_OUTBOX_TEST_DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/course_outbox") throw new Error("Refusing non-disposable DB");
  return { prisma: new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 8 }) }) };
});

describe.runIf(Boolean(process.env.COURSE_OUTBOX_TEST_DATABASE_URL))("PostgreSQL course notification outbox", () => {
  let db: PrismaClient;
  let enqueue: typeof import("./course-payment-outbox").enqueueCoursePaymentNotification;
  let generate: typeof import("@/lib/courses/payment-reminders").generateInitialPaymentReminders;
  let deliver: typeof import("./course-payment-worker").deliverCoursePaymentNotifications;
  const base = new Date("2035-05-01T12:00:00Z");
  const hour = 60 * 60 * 1000;

  beforeAll(async () => {
    db = (await import("@/lib/db")).prisma;
    expect((await db.$queryRaw<{ host: string; port: number }[]>`SELECT host(inet_server_addr()) AS host, inet_server_port() AS port`)[0]).toEqual({ host: "127.0.0.1", port: 55439 });
    enqueue = (await import("./course-payment-outbox")).enqueueCoursePaymentNotification;
    generate = (await import("@/lib/courses/payment-reminders")).generateInitialPaymentReminders;
    deliver = (await import("./course-payment-worker")).deliverCoursePaymentNotifications;
  });
  afterEach(() => { vi.unstubAllEnvs(); send.mockReset(); });
  afterAll(async () => db?.$disconnect());

  async function fixture(hours: number, options: {
    paymentStatus?: "PENDING" | "PROOF_SUBMITTED" | "VERIFIED" | "EXPIRED";
    enrollmentStatus?: "PENDING_PAYMENT" | "CANCELLED";
  } = {}) {
    const token = randomUUID();
    const customer = await db.customer.create({ data: {
      supabaseUserId: token, email: `${token}@example.invalid`, emailNormalized: `${token}@example.invalid`,
      emailVerifiedAt: base, emailSyncedAt: base,
    } });
    const student = await db.studentProfile.create({ data: { fullName: `Learner ${token}` } });
    await db.customerStudentRelation.create({ data: { customerId: customer.id, studentId: student.id, type: "GUARDIAN" } });
    const plan = await db.coursePlan.findUniqueOrThrow({ where: { code: "BEGINNER_ONE_TO_ONE" } });
    const application = await db.courseApplication.create({ data: {
      fullName: student.fullName, email: customer.email, status: "APPROVED", locale: "en",
      customerId: customer.id, studentProfileId: student.id, requestedPlanId: plan.id,
    } });
    const enrollmentStatus = options.enrollmentStatus ?? "PENDING_PAYMENT";
    const enrollment = await db.courseEnrollment.create({ data: {
      customerId: customer.id, studentId: student.id, applicationId: application.id, coursePlanId: plan.id,
      status: enrollmentStatus, startsAt: new Date("2035-05-10T00:00:00Z"),
      cancelledAt: enrollmentStatus === "CANCELLED" ? base : null,
      cancellationReason: enrollmentStatus === "CANCELLED" ? "TEST" : null,
      levelSnapshot: plan.level, formatSnapshot: plan.format, planCodeSnapshot: plan.code,
    } });
    const verifiedBy = options.paymentStatus === "VERIFIED" ? await db.admin.create({ data: {
      username: randomUUID(), displayName: "Disposable verifier", passwordHash: "local-test-only",
    } }) : null;
    const expiresAt = new Date(base.getTime() + hours * hour);
    const payment = await db.coursePayment.create({ data: {
      enrollmentId: enrollment.id, kind: "INITIAL_ENROLLMENT", status: options.paymentStatus ?? "PENDING",
      periodStart: new Date("2035-05-10T00:00:00Z"), periodEnd: new Date("2035-06-10T00:00:00Z"),
      baseAmountCents: plan.monthlyPriceCents, finalAmountCents: plan.monthlyPriceCents,
      currency: "USD", expiresAt, createdAt: new Date(expiresAt.getTime() - 7 * 24 * hour),
      verifiedAt: verifiedBy ? base : null, verifiedByAdminId: verifiedBy?.id,
    } });
    return { customer, student, enrollment, payment };
  }

  const payload = (email: string) => ({ recipientEmailSnapshot: email, subjectSnapshot: "Course payment", htmlSnapshot: "<p>Course payment</p>" });

  it("migration created RLS, claim indexes, checks and restrictive foreign keys", async () => {
    const [table] = await db.$queryRaw<{ relrowsecurity: boolean }[]>`
      SELECT relrowsecurity FROM pg_class WHERE oid = 'public."CoursePaymentNotification"'::regclass
    `;
    const indexes = await db.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'CoursePaymentNotification'
    `;
    const constraints = await db.$queryRaw<{ conname: string; delete_action: string | null }[]>`
      SELECT c.conname, CASE WHEN c.contype = 'f' THEN c.confdeltype::text ELSE NULL END AS delete_action
      FROM pg_constraint c WHERE c.conrelid = 'public."CoursePaymentNotification"'::regclass
    `;
    expect(table.relrowsecurity).toBe(true);
    expect(indexes.map(row => row.indexname)).toEqual(expect.arrayContaining([
      "CoursePaymentNotification_paymentId_kind_deduplicationKey_key",
      "CoursePaymentNotification_status_nextAttemptAt_idx",
      "CoursePaymentNotification_leaseExpiresAt_idx",
    ]));
    expect(constraints.map(row => row.conname)).toEqual(expect.arrayContaining([
      "CoursePaymentNotification_scope_consistent", "CoursePaymentNotification_lease_consistent",
      "CoursePaymentNotification_sent_consistent", "CoursePaymentNotification_submissionId_paymentId_fkey",
    ]));
    expect(constraints.filter(row => row.conname.endsWith("_fkey")).every(row => row.delete_action === "r")).toBe(true);
  });

  it("database uniqueness permits distinct proof attempts but suppresses repeat enqueue", async () => {
    const f = await fixture(72, { paymentStatus: "PROOF_SUBMITTED" });
    const reviewer = await db.admin.create({ data: { username: randomUUID(), displayName: "Disposable reviewer", passwordHash: "local-test-only" } });
    const first = await db.coursePaymentSubmission.create({ data: {
      paymentId: f.payment.id, attemptNumber: 1, status: "REJECTED", method: "ZELLE", amountSentCents: 7000,
      proofStoragePath: `local/${randomUUID()}.png`, mimeType: "image/png", fileSizeBytes: 1,
      reviewedAt: base, reviewedByAdminId: reviewer.id, rejectionReason: "Try again",
    } });
    const second = await db.coursePaymentSubmission.create({ data: {
      paymentId: f.payment.id, attemptNumber: 2, method: "ZELLE", amountSentCents: 7000,
      proofStoragePath: `local/${randomUUID()}.png`, mimeType: "image/png", fileSizeBytes: 1,
    } });
    const submissions = [first, second];
    await Promise.all(submissions.flatMap(submission => [
      enqueue(db, { paymentId: f.payment.id, submissionId: submission.id, kind: "PROOF_RECEIVED", payload: payload(f.customer.email) }),
      enqueue(db, { paymentId: f.payment.id, submissionId: submission.id, kind: "PROOF_RECEIVED", payload: payload(f.customer.email) }),
    ]));
    expect(await db.coursePaymentNotification.count({ where: { paymentId: f.payment.id, kind: "PROOF_RECEIVED" } })).toBe(2);
  });

  it("composite submission ownership, scope checks, and deletion restrictions are enforced", async () => {
    const left = await fixture(72, { paymentStatus: "PROOF_SUBMITTED" });
    const right = await fixture(72, { paymentStatus: "PROOF_SUBMITTED" });
    const submission = await db.coursePaymentSubmission.create({ data: {
      paymentId: right.payment.id, attemptNumber: 1, method: "ZELLE", amountSentCents: 7000,
      proofStoragePath: `local/${randomUUID()}.png`, mimeType: "image/png", fileSizeBytes: 1,
    } });
    await expect(db.coursePaymentNotification.create({ data: {
      paymentId: left.payment.id, submissionId: submission.id, kind: "PROOF_RECEIVED",
      deduplicationKey: `SUBMISSION:${submission.id}`, ...payload(left.customer.email),
    } })).rejects.toThrow();
    await enqueue(db, { paymentId: left.payment.id, kind: "PAYMENT_REQUIRED", payload: payload(left.customer.email) });
    await expect(db.coursePayment.delete({ where: { id: left.payment.id } })).rejects.toThrow();
  });

  it("concurrent reminder generation creates one 48h and one 24h row, with exclusions and deadline preservation", async () => {
    const at48 = await fixture(47);
    const at24 = await fixture(23);
    const rejected = await fixture(46);
    const reviewer = await db.admin.create({ data: { username: randomUUID(), displayName: "Disposable reviewer", passwordHash: "local-test-only" } });
    await db.coursePaymentSubmission.create({ data: {
      paymentId: rejected.payment.id, attemptNumber: 1, status: "REJECTED", method: "CASH_APP", amountSentCents: 7000,
      proofStoragePath: `local/${randomUUID()}.png`, mimeType: "image/png", fileSizeBytes: 1, rejectionReason: "Try again",
      reviewedAt: base, reviewedByAdminId: reviewer.id,
    } });
    const excluded = await Promise.all([
      fixture(47, { paymentStatus: "PROOF_SUBMITTED" }), fixture(23, { paymentStatus: "VERIFIED" }),
      fixture(47, { paymentStatus: "EXPIRED" }), fixture(23, { enrollmentStatus: "CANCELLED" }),
    ]);
    await Promise.all([generate(base), generate(base)]);
    expect(await db.coursePaymentNotification.count({ where: { paymentId: at48.payment.id, kind: "INITIAL_PAYMENT_REMINDER_48H" } })).toBe(1);
    expect(await db.coursePaymentNotification.count({ where: { paymentId: at24.payment.id, kind: "INITIAL_PAYMENT_REMINDER_24H" } })).toBe(1);
    expect(await db.coursePaymentNotification.count({ where: { paymentId: rejected.payment.id, kind: "INITIAL_PAYMENT_REMINDER_48H" } })).toBe(1);
    expect(await db.coursePaymentNotification.count({ where: { paymentId: { in: excluded.map(item => item.payment.id) } } })).toBe(0);
    expect((await db.coursePayment.findUniqueOrThrow({ where: { id: at48.payment.id } })).expiresAt).toEqual(at48.payment.expiresAt);
  });

  it("concurrent workers claim once, persist provider ID, and recover a stale lease", async () => {
    await db.coursePaymentNotification.updateMany({ where: { status: { in: ["PENDING", "RETRY", "PROCESSING"] } }, data: { status: "CANCELLED", leaseToken: null, leaseExpiresAt: null } });
    const f = await fixture(72);
    await enqueue(db, { paymentId: f.payment.id, kind: "PAYMENT_REQUIRED", payload: payload(f.customer.email) });
    vi.stubEnv("RESEND_API_KEY", "local-test-only");
    vi.stubEnv("RESEND_FROM_EMAIL", "courses@example.invalid");
    send.mockResolvedValue({ sent: true, providerMessageId: "provider-one" });
    const results = await Promise.all([deliver(1, base), deliver(1, base)]);
    expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await db.coursePaymentNotification.findFirst({ where: { paymentId: f.payment.id } })).toMatchObject({ status: "SENT", providerMessageId: "provider-one", attemptCount: 1 });

    const stale = await fixture(72);
    const staleRow = await db.coursePaymentNotification.create({ data: {
      paymentId: stale.payment.id, kind: "PAYMENT_REQUIRED", deduplicationKey: "PAYMENT", ...payload(stale.customer.email),
      status: "PROCESSING", senderEmailSnapshot: "courses@example.invalid", attemptCount: 1,
      firstAttemptAt: new Date(base.getTime() - hour), lastAttemptAt: new Date(base.getTime() - hour),
      leaseToken: randomUUID(), leaseExpiresAt: new Date(base.getTime() - 1), nextAttemptAt: new Date(base.getTime() - hour),
    } });
    send.mockResolvedValue({ sent: true, providerMessageId: "provider-stale" });
    expect(await deliver(1, base)).toMatchObject({ claimed: 1, sent: 1 });
    expect(await db.coursePaymentNotification.findUnique({ where: { id: staleRow.id } })).toMatchObject({ status: "SENT", attemptCount: 2, providerMessageId: "provider-stale" });
  });
});
