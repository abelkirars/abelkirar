/** Opt-in tests against a fresh loopback-only PostgreSQL cluster. Auth/storage are mocked. */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ adminId: "", authorized: true, advanceAtUpload: null as Date | null }));
const expiredNotify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notifications/course-payment-expired", () => ({ notifyCoursePaymentExpired: expiredNotify }));
vi.mock("@/lib/admin/dal", () => ({ verifyAdminSession: async () => state.authorized ? { adminId: state.adminId } : null }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("./course-payment-proofs", () => ({
  uploadCoursePaymentProof: async (paymentId: string, submissionId: string) => {
    if (state.advanceAtUpload) vi.setSystemTime(state.advanceAtUpload);
    return `course-payments/${paymentId}/${submissionId}/proof.png`;
  },
  removeCoursePaymentProof: vi.fn(),
}));
vi.mock("@/lib/db", () => {
  const url = new URL(process.env.COURSE_REVIEW_TEST_DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/course_review") throw new Error("Refusing non-disposable DB");
  return { prisma: new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 8 }) }) };
});

describe.runIf(Boolean(process.env.COURSE_REVIEW_TEST_DATABASE_URL))("PostgreSQL course payment review", () => {
  let db: PrismaClient;
  let review: typeof import("./review-course-payment").reviewCoursePayment;
  let submit: typeof import("./submit-course-payment-proof").submitCoursePaymentProofForCustomer;
  let expire: typeof import("./expire-initial-payments").expireInitialPayment;
  let portalGuard: typeof import("@/lib/student/dal").hasStudentPortalAccess;
  let runJob: typeof import("./expiration-job").runInitialPaymentExpirationJob;
  const day = 86400000;
  beforeAll(async () => {
    db = (await import("@/lib/db")).prisma;
    expect((await db.$queryRaw<{ host: string }[]>`SELECT host(inet_server_addr()) AS host`)[0].host).toBe("127.0.0.1");
    review = (await import("./review-course-payment")).reviewCoursePayment;
    submit = (await import("./submit-course-payment-proof")).submitCoursePaymentProofForCustomer;
    expire = (await import("./expire-initial-payments")).expireInitialPayment;
    portalGuard = (await import("@/lib/student/dal")).hasStudentPortalAccess;
    runJob = (await import("./expiration-job")).runInitialPaymentExpirationJob;
    state.adminId = (await db.admin.create({ data: { username: randomUUID(), displayName: "Disposable reviewer", passwordHash: "local-test-only" } })).id;
  });
  afterEach(() => { state.authorized = true; state.advanceAtUpload = null; vi.useRealTimers(); vi.restoreAllMocks(); expiredNotify.mockReset(); });
  afterAll(async () => { await db?.$disconnect(); });

  async function fixture({ self = false, group = true, expired = false, pending = false, deadline }: {
    self?: boolean; group?: boolean; expired?: boolean; pending?: boolean; deadline?: Date;
  } = {}) {
    const id = randomUUID();
    const customer = await db.customer.create({ data: { supabaseUserId: id, email: `${id}@example.invalid`, emailNormalized: `${id}@example.invalid`, emailVerifiedAt: new Date(), emailSyncedAt: new Date() } });
    const learner = await db.studentProfile.create({ data: { fullName: "Disposable learner", supabaseUserId: self ? id : null, email: self ? customer.email : null, portalAccess: false } });
    await db.customerStudentRelation.create({ data: { customerId: customer.id, studentId: learner.id, type: self ? "SELF" : "GUARDIAN" } });
    const plan = await db.coursePlan.findUniqueOrThrow({ where: { code: group ? "BEGINNER_GROUP" : "BEGINNER_ONE_TO_ONE" } });
    const cohort = group ? await db.courseCohort.create({ data: {
      coursePlanId: plan.id, code: id, name: "Disposable group", status: "OPEN", weeklyDay: "SATURDAY",
      localStartTime: new Date("1970-01-01T18:00:00Z"), durationMinutes: 60, timeZone: "America/New_York",
      courseStartDate: new Date("2026-10-10T00:00:00Z"), seats: { create: [1, 2, 3, 4].map(position => ({ position })) },
    }, include: { seats: { orderBy: { position: "asc" } } } }) : null;
    const application = await db.courseApplication.create({ data: { fullName: learner.fullName, email: customer.email,
      customerId: customer.id, studentProfileId: learner.id, requestedPlanId: plan.id, status: "APPROVED" } });
    const enrollment = await db.courseEnrollment.create({ data: {
      studentId: learner.id, customerId: customer.id, applicationId: application.id, coursePlanId: plan.id,
      cohortId: cohort?.id, status: "PENDING_PAYMENT", levelSnapshot: plan.level, formatSnapshot: plan.format, planCodeSnapshot: plan.code,
    } });
    const expiresAt = deadline ?? new Date(Date.now() + (expired ? -day : day));
    const createdAt = new Date(expiresAt.getTime() - 7 * day);
    const payment = await db.coursePayment.create({ data: {
      enrollmentId: enrollment.id, kind: "INITIAL_ENROLLMENT", status: pending ? "PENDING" : "PROOF_SUBMITTED",
      periodStart: new Date("2026-10-10T00:00:00Z"), periodEnd: new Date("2026-11-10T00:00:00Z"),
      baseAmountCents: plan.monthlyPriceCents, finalAmountCents: plan.monthlyPriceCents, currency: "USD", createdAt, expiresAt,
    } });
    const proof = pending ? null : await db.coursePaymentSubmission.create({ data: {
      paymentId: payment.id, attemptNumber: 1, method: "ZELLE", amountSentCents: payment.finalAmountCents,
      proofStoragePath: `disposable/${id}.png`, mimeType: "image/png", fileSizeBytes: 20,
      submittedAt: new Date(createdAt.getTime() + day),
    } });
    if (cohort) await db.courseCohortSeat.update({ where: { id: cohort.seats[0].id }, data: {
      currentEnrollmentId: enrollment.id, assignedAt: createdAt, reservedUntil: expiresAt,
    } });
    return { customer, learner, plan, cohort, application, enrollment, payment, proof };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const verifyInput = (f: Fixture) => ({ action: "VERIFY", submissionId: f.proof!.id, confirmation: true });
  const rejectInput = (f: Fixture) => ({ action: "REJECT", submissionId: f.proof!.id, confirmation: true, reason: "Payment could not be found" });
  const proofFile = { bytes: new Uint8Array([1]), mimeType: "image/png" as const, fileSizeBytes: 1, originalFileName: "local.png", storageExtension: "png" };
  const proofFields = { method: "ZELLE" as const, senderName: "Local payer", amountSentCents: 5000, sentAt: new Date(), transactionReference: null };

  async function assertInactive(f: Fixture) {
    expect(await db.coursePortalAccess.count({ where: { enrollmentId: f.enrollment.id } })).toBe(0);
    expect((await db.studentProfile.findUniqueOrThrow({ where: { id: f.learner.id } })).portalAccess).toBe(false);
  }

  function isolateJob(...ids: string[]) {
    // Keep each job test independent of the other synthetic fixtures while
    // retaining the production candidate filters and real PostgreSQL queries.
    const find = db.coursePayment.findMany.bind(db.coursePayment);
    vi.spyOn(db.coursePayment, "findMany").mockImplementation(((args?: import("@prisma/client").Prisma.CoursePaymentFindManyArgs) => find({ ...args, where: { ...args?.where, id: { in: ids } } })) as typeof db.coursePayment.findMany);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expiredNotify.mockImplementation(async paymentId => {
      const p = await db.coursePayment.findUniqueOrThrow({ where: { id: paymentId }, include: { enrollment: true } });
      expect(p.status).toBe("EXPIRED"); expect(p.enrollment.status).toBe("CANCELLED");
      return { sent: true };
    });
  }

  it("requires an authorized, still-active admin", async () => {
    const f = await fixture();
    state.authorized = false;
    await expect(review(f.payment.id, verifyInput(f))).rejects.toThrow("authentication");
    state.authorized = true;
    await db.admin.update({ where: { id: state.adminId }, data: { isActive: false } });
    try { await expect(review(f.payment.id, verifyInput(f))).rejects.toThrow("authorization"); }
    finally { await db.admin.update({ where: { id: state.adminId }, data: { isActive: true } }); }
    await assertInactive(f);
  });

  it.each([true, false])("verifies SELF=%s, preserves identity and activates only the existing enrollment/access/seat", async self => {
    const f = await fixture({ self });
    const result = await review(f.payment.id, verifyInput(f));
    expect(result.status).toBe("VERIFIED");
    expect(await db.coursePaymentSubmission.findUnique({ where: { id: f.proof!.id } })).toMatchObject({ status: "ACCEPTED", reviewedByAdminId: state.adminId });
    const e = await db.courseEnrollment.findUniqueOrThrow({ where: { id: f.enrollment.id }, include: { portalAccess: true } });
    expect(e.status).toBe("ACTIVE");
    expect(portalGuard(false, [e])).toBe(true);
    expect(await db.coursePortalAccess.count({ where: { enrollmentId: e.id } })).toBe(1);
    expect(await db.studentProfile.findUnique({ where: { id: f.learner.id } })).toEqual(f.learner);
    expect(await db.courseCohortSeat.findUnique({ where: { id: f.cohort!.seats[0].id } })).toMatchObject({ currentEnrollmentId: e.id, reservedUntil: null });
    expect(await db.courseCohortSeat.count({ where: { cohortId: f.cohort!.id } })).toBe(4);
    expect((await db.coursePayment.findUniqueOrThrow({ where: { id: f.payment.id } })).expiresAt).toEqual(f.payment.expiresAt);
  });

  it("verifies 1-to-1 without creating any seat", async () => {
    const f = await fixture({ group: false, self: true });
    await review(f.payment.id, verifyInput(f));
    expect(await db.courseCohortSeat.count({ where: { currentEnrollmentId: f.enrollment.id } })).toBe(0);
  });

  it("rejection preserves original reservation and permits a historical second attempt before expiry", async () => {
    const f = await fixture();
    const result = await review(f.payment.id, rejectInput(f));
    expect(result.status).toBe("PENDING");
    await assertInactive(f);
    expect(await db.courseEnrollment.findUnique({ where: { id: f.enrollment.id } })).toMatchObject({ status: "PENDING_PAYMENT" });
    expect(await db.courseCohortSeat.findUnique({ where: { id: f.cohort!.seats[0].id } })).toMatchObject({ currentEnrollmentId: f.enrollment.id, reservedUntil: f.payment.expiresAt });
    const next = await submit(f.customer.id, f.payment.id, proofFields, proofFile);
    expect(next.idempotent).toBe(false);
    expect(await db.coursePaymentSubmission.findUnique({ where: { id: f.proof!.id } })).toMatchObject({ status: "REJECTED", rejectionReason: rejectInput(f).reason });
    expect(await db.coursePaymentSubmission.count({ where: { paymentId: f.payment.id } })).toBe(2);
    expect(await db.coursePayment.count({ where: { enrollmentId: f.enrollment.id } })).toBe(1);
    expect((await db.coursePayment.findUniqueOrThrow({ where: { id: f.payment.id } })).expiresAt).toEqual(f.payment.expiresAt);
    await expect(review(f.payment.id, verifyInput(f))).rejects.toThrow("latest submission");
    await review(f.payment.id, { ...verifyInput(f), submissionId: next.submission.id });
  });

  it("a timely proof remains reviewable and can verify after deadline", async () => {
    const f = await fixture({ expired: true });
    expect((await expire(f.payment.id)).outcome).toBe("SKIPPED");
    expect((await review(f.payment.id, verifyInput(f))).status).toBe("VERIFIED");
  });

  it("rejection after deadline expires/cancels/releases atomically and forbids resubmission", async () => {
    const f = await fixture({ expired: true });
    await db.courseCohort.update({ where: { id: f.cohort!.id }, data: { status: "FULL" } });
    expect((await review(f.payment.id, rejectInput(f))).status).toBe("EXPIRED");
    expect(await db.courseEnrollment.findUnique({ where: { id: f.enrollment.id } })).toMatchObject({ status: "CANCELLED", cancellationReason: "INITIAL_PAYMENT_EXPIRED", cohortId: f.cohort!.id });
    expect(await db.courseCohortSeat.findUnique({ where: { id: f.cohort!.seats[0].id } })).toMatchObject({ currentEnrollmentId: null, reservedUntil: null, assignedAt: null });
    expect(await db.courseCohort.findUnique({ where: { id: f.cohort!.id } })).toMatchObject({ status: "OPEN" });
    expect((await db.coursePayment.findUniqueOrThrow({ where: { id: f.payment.id } })).expiresAt).toEqual(f.payment.expiresAt);
    await expect(submit(f.customer.id, f.payment.id, proofFields, proofFile)).rejects.toThrow("expired");
    await assertInactive(f);
  });

  it.each(["VERIFY", "REJECT"] as const)("concurrent %s vs itself produces one audit result", async action => {
    const f = await fixture();
    const input = action === "VERIFY" ? verifyInput(f) : rejectInput(f);
    const results = await Promise.all([review(f.payment.id, input), review(f.payment.id, input)]);
    expect(results.map(r => r.idempotent).sort()).toEqual([false, true]);
    expect(await db.courseApplicationEvent.count({ where: { applicationId: f.application.id } })).toBe(1);
    expect(await db.coursePortalAccess.count({ where: { enrollmentId: f.enrollment.id } })).toBe(action === "VERIFY" ? 1 : 0);
  });

  it("VERIFY vs REJECT has exactly one winning outcome", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([review(f.payment.id, verifyInput(f)), review(f.payment.id, rejectInput(f))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const p = await db.coursePayment.findUniqueOrThrow({ where: { id: f.payment.id } });
    const s = await db.coursePaymentSubmission.findUniqueOrThrow({ where: { id: f.proof!.id } });
    expect(s.status).toBe(p.status === "VERIFIED" ? "ACCEPTED" : "REJECTED");
    expect(await db.courseApplicationEvent.count({ where: { applicationId: f.application.id } })).toBe(1);
  });

  it("REJECT vs expiration never resurrects the enrollment", async () => {
    const f = await fixture({ expired: true });
    await Promise.all([review(f.payment.id, rejectInput(f)), expire(f.payment.id)]);
    expect(await db.coursePayment.findUnique({ where: { id: f.payment.id } })).toMatchObject({ status: "EXPIRED" });
    await expect(review(f.payment.id, verifyInput(f))).rejects.toThrow();
    await assertInactive(f);
  });

  it("rechecks server time after upload and refuses resubmission crossing the deadline", async () => {
    const f = await fixture({ deadline: new Date(Date.now() + 60000) });
    await review(f.payment.id, rejectInput(f));
    state.advanceAtUpload = new Date(f.payment.expiresAt.getTime() + 1);
    await expect(submit(f.customer.id, f.payment.id, proofFields, proofFile)).rejects.toThrow("expired");
    expect(await db.coursePaymentSubmission.count({ where: { paymentId: f.payment.id } })).toBe(1);
    expect(await db.coursePayment.findUnique({ where: { id: f.payment.id } })).toMatchObject({ status: "EXPIRED", expiresAt: f.payment.expiresAt });
  });

  it("rejects missing proof, wrong association, client financial fields, and invalid reason", async () => {
    const f = await fixture();
    await expect(review(f.payment.id, { ...verifyInput(f), amountCents: 1 })).rejects.toThrow();
    await expect(review(f.payment.id, { ...verifyInput(f), submissionId: randomUUID() })).rejects.toThrow("latest submission");
    await expect(review(f.payment.id, { ...rejectInput(f), reason: " " })).rejects.toThrow();
    const noProof = await fixture({ pending: true });
    await expect(review(noProof.payment.id, verifyInput(f))).rejects.toThrow();
    await assertInactive(f);
  });

  it("missing reservation or ended relationship cannot activate access", async () => {
    const f = await fixture();
    await db.courseCohortSeat.update({ where: { id: f.cohort!.seats[0].id }, data: { currentEnrollmentId: null, assignedAt: null, reservedUntil: null } });
    await expect(review(f.payment.id, verifyInput(f))).rejects.toThrow("reservation");
    const g = await fixture();
    await db.customerStudentRelation.updateMany({ where: { customerId: g.customer.id }, data: { endedAt: new Date() } });
    await expect(review(g.payment.id, verifyInput(g))).rejects.toThrow("relationship");
    await assertInactive(f); await assertInactive(g);
  });

  it("expired/no-proof or cancelled enrollment cannot be resurrected", async () => {
    const f = await fixture({ expired: true, pending: true });
    await expire(f.payment.id);
    await expect(review(f.payment.id, { action: "VERIFY", submissionId: "missing", confirmation: true })).rejects.toThrow();
    const g = await fixture();
    await db.courseEnrollment.update({ where: { id: g.enrollment.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: "Admin cancellation" } });
    await expect(review(g.payment.id, verifyInput(g))).rejects.toThrow("Enrollment/access");
    await assertInactive(f); await assertInactive(g);
    expect(await db.coursePayment.findUnique({ where: { id: g.payment.id } })).toMatchObject({ status: "PROOF_SUBMITTED", verifiedAt: null });
  });

  it("rolls back all review writes if a later audit write fails", async () => {
    const f = await fixture();
    // Exercise a real PostgreSQL rollback after financial/access writes. The
    // injected failure is in this test process only, not a schema alteration.
    const transaction = db.$transaction.bind(db);
    const spy = vi.spyOn(db, "$transaction").mockImplementationOnce(((work: (tx: import("@prisma/client").Prisma.TransactionClient) => Promise<unknown>, options: object) =>
      transaction(async tx => {
        const guarded = new Proxy(tx, { get(target, key) {
          if (key === "courseApplicationEvent") return { create: async () => { throw new Error("Injected audit failure"); } };
          return Reflect.get(target, key);
        } });
        return work(guarded);
      }, options)) as typeof db.$transaction);
    try { await expect(review(f.payment.id, verifyInput(f))).rejects.toThrow("Injected audit failure"); }
    finally { spy.mockRestore(); }
    await assertInactive(f);
    expect(await db.coursePayment.findUnique({ where: { id: f.payment.id } })).toMatchObject({ status: "PROOF_SUBMITTED", verifiedAt: null });
    expect(await db.coursePaymentSubmission.findUnique({ where: { id: f.proof!.id } })).toMatchObject({ status: "SUBMITTED", reviewedAt: null });
    expect(await db.courseEnrollment.findUnique({ where: { id: f.enrollment.id } })).toMatchObject({ status: "PENDING_PAYMENT" });
    expect(await db.courseCohortSeat.findUnique({ where: { id: f.cohort!.seats[0].id } })).toMatchObject({ reservedUntil: f.payment.expiresAt });
  });

  it("scheduler vs scheduler and restart produce one transition, audit and email", async () => {
    const f = await fixture({ expired: true, pending: true }); isolateJob(f.payment.id);
    await db.courseCohort.update({ where: { id: f.cohort!.id }, data: { status: "FULL" } });
    const jobs = await Promise.all([runJob(), runJob()]);
    expect(jobs.reduce((n, j) => n + j.expired, 0)).toBe(1);
    expect(expiredNotify).toHaveBeenCalledTimes(1);
    expect(await db.courseApplicationEvent.count({ where: { applicationId: f.application.id } })).toBe(1);
    expect(await db.courseCohortSeat.findUnique({ where: { id: f.cohort!.seats[0].id } })).toMatchObject({ currentEnrollmentId: null, reservedUntil: null });
    expect(await db.courseCohort.findUnique({ where: { id: f.cohort!.id } })).toMatchObject({ status: "OPEN" });
    expect((await runJob()).expired).toBe(0); expect(expiredNotify).toHaveBeenCalledTimes(1);
    expect((await db.coursePayment.findUniqueOrThrow({ where: { id: f.payment.id } })).expiresAt).toEqual(f.payment.expiresAt);
  });

  it("scheduler vs VERIFY protects timely proof and active access", async () => {
    const f = await fixture({ expired: true }); isolateJob(f.payment.id);
    await Promise.all([runJob(), review(f.payment.id, verifyInput(f))]);
    expect(await db.coursePayment.findUnique({ where: { id: f.payment.id } })).toMatchObject({ status: "VERIFIED" });
    expect(await db.coursePortalAccess.count({ where: { enrollmentId: f.enrollment.id, status: "ENABLED" } })).toBe(1);
    expect((await runJob()).expired).toBe(0); expect(expiredNotify).not.toHaveBeenCalled();
  });

  it("scheduler vs REJECT expires once without sending a second rejection email", async () => {
    const f = await fixture({ expired: true }); isolateJob(f.payment.id);
    await Promise.all([runJob(), review(f.payment.id, rejectInput(f))]);
    expect(await db.coursePayment.findUnique({ where: { id: f.payment.id } })).toMatchObject({ status: "EXPIRED" });
    expect((await runJob()).expired).toBe(0); expect(expiredNotify).not.toHaveBeenCalled();
    // One expiration event plus the existing explicit admin-rejection event.
    expect(await db.courseApplicationEvent.count({ where: { applicationId: f.application.id } })).toBe(2);
    await assertInactive(f);
  });

  it("scheduler vs proof submission accepts timely proof but never a late proof", async () => {
    const f = await fixture({ pending: true }); isolateJob(f.payment.id);
    await Promise.all([runJob(), submit(f.customer.id, f.payment.id, proofFields, proofFile)]);
    expect(await db.coursePayment.findUnique({ where: { id: f.payment.id } })).toMatchObject({ status: "PROOF_SUBMITTED" });
    vi.restoreAllMocks();
    const g = await fixture({ pending: true, expired: true }); isolateJob(g.payment.id);
    await Promise.allSettled([runJob(), submit(g.customer.id, g.payment.id, proofFields, proofFile)]);
    expect(await db.coursePayment.findUnique({ where: { id: g.payment.id } })).toMatchObject({ status: "EXPIRED" });
    expect(await db.coursePaymentSubmission.count({ where: { paymentId: g.payment.id } })).toBe(0);
    expect(await db.courseCohortSeat.count({ where: { currentEnrollmentId: g.enrollment.id } })).toBe(0);
  });

  it("scheduler cannot touch an active enrollment even with an inconsistent pending obligation", async () => {
    const f = await fixture({ pending: true, expired: true }); isolateJob(f.payment.id);
    await db.courseEnrollment.update({ where: { id: f.enrollment.id }, data: { status: "ACTIVE" } });
    const access = await db.coursePortalAccess.create({ data: { enrollmentId: f.enrollment.id, status: "ENABLED" } });
    expect((await runJob()).expired).toBe(0);
    expect((await expire(f.payment.id)).outcome).toBe("SKIPPED");
    expect(await db.coursePortalAccess.findUnique({ where: { id: access.id } })).toEqual(access);
    expect(await db.coursePayment.findUnique({ where: { id: f.payment.id } })).toMatchObject({ status: "PENDING" });
  });

  it("scheduler notification failure never rolls back expiration", async () => {
    const f = await fixture({ pending: true, expired: true }); isolateJob(f.payment.id);
    expiredNotify.mockResolvedValue({ sent: false });
    expect(await runJob()).toMatchObject({ expired: 1, emailFailed: 1, failed: 0 });
    expect(await db.coursePayment.findUnique({ where: { id: f.payment.id } })).toMatchObject({ status: "EXPIRED" });
    expect((await runJob()).expired).toBe(0); expect(expiredNotify).toHaveBeenCalledTimes(1);
  });
});
