/** Opt-in tests against a fresh loopback-only PostgreSQL cluster. Auth/storage are mocked. */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  adminId: "", authorized: true, advanceAtUpload: null as Date | null,
  studentAuth: null as { supabaseUserId: string; email: string } | null,
  signOut: vi.fn(),
  sendEmail: vi.fn(() => { throw new Error("Real notification delivery is forbidden in disposable review tests"); }),
}));
vi.mock("@/lib/admin/dal", () => ({ verifyAdminSession: async () => state.authorized ? { adminId: state.adminId } : null }));
vi.mock("@/lib/student/session", () => ({ readStudentAuthUser: async () => state.studentAuth }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: async () => ({ auth: { signOut: state.signOut } }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@/lib/notifications/email", () => ({ sendEmail: state.sendEmail }));
vi.mock("./course-payment-proofs", () => ({
  uploadCoursePaymentProof: async (paymentId: string, submissionId: string) => {
    if (state.advanceAtUpload) vi.setSystemTime(state.advanceAtUpload);
    return `course-payments/${paymentId}/${submissionId}/proof.png`;
  },
  removeCoursePaymentProof: vi.fn(),
}));
vi.mock("@/lib/db", () => {
  const url = new URL(process.env.COURSE_REVIEW_TEST_DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/course_review" || url.search || url.hash) throw new Error("Refusing non-disposable DB");
  return { prisma: new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 8 }) }) };
});

describe.runIf(Boolean(process.env.COURSE_REVIEW_TEST_DATABASE_URL))("PostgreSQL course payment review", () => {
  let db: PrismaClient;
  let review: typeof import("./review-course-payment").reviewCoursePayment;
  let submit: typeof import("./submit-course-payment-proof").submitCoursePaymentProofForCustomer;
  let expire: typeof import("./expire-initial-payments").expireInitialPayment;
  let portalGuard: typeof import("@/lib/student/dal").hasStudentPortalAccess;
  let requireStudentPage: typeof import("@/lib/student/dal").requireStudentPage;
  let requireStudentApi: typeof import("@/lib/student/dal").requireStudentApi;
  let runJob: typeof import("./expiration-job").runInitialPaymentExpirationJob;
  const day = 86400000;
  beforeAll(async () => {
    db = (await import("@/lib/db")).prisma;
    const expectedDirectory = process.env.COURSE_REVIEW_TEST_DATA_DIRECTORY;
    if (!expectedDirectory) throw new Error("Explicit disposable data directory required before fixture writes");
    const [target] = await db.$queryRaw<{ host: string; port: number; database: string; directory: string; version: number; listen: string }[]>`
      SELECT host(inet_server_addr()) AS host, inet_server_port() AS port, current_database() AS database,
        current_setting('data_directory') AS directory, current_setting('server_version_num')::int AS version,
        current_setting('listen_addresses') AS listen`;
    expect(target).toMatchObject({ host: "127.0.0.1", port: 55439, database: "course_review", listen: "127.0.0.1" });
    expect(target.version).toBeGreaterThanOrEqual(170000);
    expect(target.version).toBeLessThan(180000);
    expect(realpathSync(target.directory)).toBe(realpathSync(expectedDirectory));
    expect(path.basename(path.dirname(realpathSync(expectedDirectory)))).toMatch(/^academy-review-acceptance-/);
    review = (await import("./review-course-payment")).reviewCoursePayment;
    submit = (await import("./submit-course-payment-proof")).submitCoursePaymentProofForCustomer;
    expire = (await import("./expire-initial-payments")).expireInitialPayment;
    portalGuard = (await import("@/lib/student/dal")).hasStudentPortalAccess;
    ({ requireStudentPage, requireStudentApi } = await import("@/lib/student/dal"));
    runJob = (await import("./expiration-job")).runInitialPaymentExpirationJob;
    state.adminId = (await db.admin.create({ data: { username: randomUUID(), displayName: "Disposable reviewer", passwordHash: "local-test-only" } })).id;
  });
  afterEach(() => {
    state.authorized = true; state.advanceAtUpload = null; state.studentAuth = null;
    state.signOut.mockClear();
    expect(state.sendEmail).not.toHaveBeenCalled();
    vi.useRealTimers(); vi.restoreAllMocks();
  });
  afterAll(async () => { await db?.$disconnect(); });

  async function fixture({ self = false, group = true, expired = false, pending = false, deadline, acceptance = false }: {
    self?: boolean; group?: boolean; expired?: boolean; pending?: boolean; deadline?: Date; acceptance?: boolean;
  } = {}) {
    const id = randomUUID();
    const customer = await db.customer.create({ data: { supabaseUserId: id, email: `${id}@example.invalid`, emailNormalized: `${id}@example.invalid`, emailVerifiedAt: new Date(), emailSyncedAt: new Date() } });
    const learner = await db.studentProfile.create({ data: { fullName: "Disposable learner", supabaseUserId: self ? id : null, email: self ? customer.email : null, portalAccess: false } });
    await db.customerStudentRelation.create({ data: { customerId: customer.id, studentId: learner.id, type: self ? "SELF" : "GUARDIAN" } });
    const plan = await db.coursePlan.findUniqueOrThrow({ where: { code: group ? "BEGINNER_GROUP" : "BEGINNER_ONE_TO_ONE" } });
    const cohort = group ? await db.courseCohort.create({ data: {
      coursePlanId: plan.id, code: id, name: "Disposable group", status: "OPEN", weeklyDay: "SATURDAY",
      localStartTime: new Date(acceptance ? "1970-01-01T10:00:00Z" : "1970-01-01T18:00:00Z"), durationMinutes: 60,
      timeZone: acceptance ? "America/Chicago" : "America/New_York",
      courseStartDate: new Date(acceptance ? "2026-10-03T00:00:00Z" : "2026-10-10T00:00:00Z"), seats: { create: [1, 2, 3, 4].map(position => ({ position })) },
    }, include: { seats: { orderBy: { position: "asc" } } } }) : null;
    const application = await db.courseApplication.create({ data: { fullName: learner.fullName, email: customer.email,
      customerId: customer.id, studentProfileId: learner.id, requestedPlanId: plan.id, status: "APPROVED" } });
    const enrollment = await db.courseEnrollment.create({ data: {
      studentId: learner.id, customerId: customer.id, applicationId: application.id, coursePlanId: plan.id,
      cohortId: cohort?.id, status: "PENDING_PAYMENT", levelSnapshot: plan.level, formatSnapshot: plan.format, planCodeSnapshot: plan.code,
      ...(acceptance ? { startsAt: cohort!.courseStartDate, billingTimeZone: "America/Chicago" } : {}),
    } });
    const expiresAt = deadline ?? new Date(Date.now() + (expired ? -day : day));
    const createdAt = new Date(expiresAt.getTime() - 7 * day);
    const payment = await db.coursePayment.create({ data: {
      enrollmentId: enrollment.id, kind: "INITIAL_ENROLLMENT", status: pending ? "PENDING" : "PROOF_SUBMITTED",
      periodStart: new Date(acceptance ? "2026-10-03T00:00:00Z" : "2026-10-10T00:00:00Z"),
      periodEnd: new Date(acceptance ? "2026-11-03T00:00:00Z" : "2026-11-10T00:00:00Z"),
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
  }

  it("isolated SELF $50 acceptance verifies atomically, authorizes real page/API guards, and replays without duplicates", async () => {
    const f = await fixture({ self: true, acceptance: true });
    state.studentAuth = { supabaseUserId: f.customer.supabaseUserId, email: f.customer.email };
    const snapshot = async () => ({
      customer: await db.customer.findUniqueOrThrow({ where: { id: f.customer.id } }),
      learner: await db.studentProfile.findUniqueOrThrow({ where: { id: f.learner.id } }),
      application: await db.courseApplication.findUniqueOrThrow({ where: { id: f.application.id } }),
      relations: await db.customerStudentRelation.findMany({ where: { studentId: f.learner.id }, orderBy: { id: "asc" } }),
      enrollments: await db.courseEnrollment.findMany({ where: { studentId: f.learner.id }, include: { portalAccess: true }, orderBy: { id: "asc" } }),
      payments: await db.coursePayment.findMany({ where: { enrollment: { studentId: f.learner.id } }, orderBy: { id: "asc" } }),
      proofs: await db.coursePaymentSubmission.findMany({ where: { paymentId: f.payment.id }, orderBy: { attemptNumber: "asc" } }),
      seats: await db.courseCohortSeat.findMany({ where: { cohortId: f.cohort!.id }, orderBy: { position: "asc" } }),
      assignedSeats: await db.courseCohortSeat.count({ where: { currentEnrollmentId: f.enrollment.id } }),
      access: await db.coursePortalAccess.findMany({ where: { enrollmentId: f.enrollment.id } }),
      events: await db.courseApplicationEvent.findMany({ where: { applicationId: f.application.id }, orderBy: { id: "asc" } }),
      outbox: await db.coursePaymentNotification.findMany({ where: { paymentId: f.payment.id }, orderBy: { id: "asc" } }),
    });
    const before = await snapshot();
    expect(before.customer).toMatchObject({ status: "ACTIVE", emailVerifiedAt: expect.any(Date) });
    expect(before.learner).toMatchObject({ supabaseUserId: f.customer.supabaseUserId, portalAccess: false });
    expect(before.application).toMatchObject({ status: "APPROVED", customerId: f.customer.id, studentProfileId: f.learner.id });
    expect(before.relations).toHaveLength(1);
    expect(before.relations[0]).toMatchObject({ type: "SELF", customerId: f.customer.id, endedAt: null, archivedAt: null });
    expect(before.enrollments).toHaveLength(1);
    expect(before.enrollments[0]).toMatchObject({ id: f.enrollment.id, applicationId: f.application.id, cohortId: f.cohort!.id,
      status: "PENDING_PAYMENT", billingTimeZone: "America/Chicago", planCodeSnapshot: "BEGINNER_GROUP", portalAccess: null });
    expect(before.payments).toHaveLength(1);
    expect(before.payments[0]).toMatchObject({ id: f.payment.id, kind: "INITIAL_ENROLLMENT", status: "PROOF_SUBMITTED",
      baseAmountCents: 5000, discountAmountCents: 0, finalAmountCents: 5000, currency: "USD",
      periodStart: new Date("2026-10-03T00:00:00Z"), periodEnd: new Date("2026-11-03T00:00:00Z"),
      verifiedAt: null, verifiedByAdminId: null });
    expect(before.proofs).toHaveLength(1);
    expect(before.proofs[0]).toMatchObject({ status: "SUBMITTED", reviewedAt: null, reviewedByAdminId: null });
    expect(before.seats).toHaveLength(4);
    expect(before.assignedSeats).toBe(1);
    expect(before.seats[0]).toMatchObject({ currentEnrollmentId: f.enrollment.id, assignedAt: f.payment.createdAt, reservedUntil: f.payment.expiresAt });
    expect(before.seats.filter(s => !s.currentEnrollmentId)).toHaveLength(3);
    expect(before.access).toEqual([]); expect(before.events).toEqual([]); expect(before.outbox).toEqual([]);
    expect(portalGuard(before.learner.portalAccess, before.enrollments)).toBe(false);
    const denied = await requireStudentApi();
    expect("response" in denied).toBe(true);
    if (!("response" in denied)) throw new Error("Pending learner incorrectly authorized");
    expect(denied.response.status).toBe(403);
    expect(await denied.response.json()).toEqual({ error: "Portal access denied" });
    await expect(requireStudentPage()).rejects.toThrow("REDIRECT:/student/login?error=account-inactive");
    expect(state.signOut).toHaveBeenCalledTimes(1);
    state.signOut.mockClear(); // Subsequent checks model a fresh authenticated request.

    const started = Date.now();
    expect(await review(f.payment.id, verifyInput(f))).toMatchObject({ idempotent: false, status: "VERIFIED" });
    const finished = Date.now();
    const after = await snapshot();
    expect(after.customer).toEqual(before.customer); expect(after.learner).toEqual(before.learner);
    expect(after.application).toEqual(before.application); expect(after.relations).toEqual(before.relations);
    expect(after.enrollments).toHaveLength(1); expect(after.payments).toHaveLength(1); expect(after.proofs).toHaveLength(1);
    const reviewedAt = after.payments[0].verifiedAt!;
    expect(reviewedAt).toBeInstanceOf(Date);
    expect(reviewedAt.getTime()).toBeGreaterThanOrEqual(started);
    expect(reviewedAt.getTime()).toBeLessThanOrEqual(finished);
    expect(after.payments[0]).toEqual({ ...before.payments[0], status: "VERIFIED", verifiedAt: reviewedAt,
      verifiedByAdminId: state.adminId, updatedAt: expect.any(Date) });
    expect(after.proofs[0]).toEqual({ ...before.proofs[0], status: "ACCEPTED", reviewedAt,
      reviewedByAdminId: state.adminId, updatedAt: expect.any(Date) });
    expect(after.access).toHaveLength(1);
    expect(after.access[0]).toMatchObject({ enrollmentId: f.enrollment.id, status: "ENABLED", archivedAt: null,
      reason: "INITIAL_PAYMENT_VERIFIED", changedByAdminId: state.adminId, changedAt: reviewedAt });
    expect(after.enrollments[0]).toEqual({ ...before.enrollments[0], status: "ACTIVE", updatedAt: expect.any(Date), portalAccess: after.access[0] });
    expect(after.seats).toHaveLength(4); expect(after.assignedSeats).toBe(1);
    expect(after.seats[0]).toEqual({ ...before.seats[0], reservedUntil: null, updatedAt: expect.any(Date) });
    expect(after.seats.slice(1)).toEqual(before.seats.slice(1));
    expect(after.events).toHaveLength(1);
    expect(after.events[0]).toMatchObject({ actorAdminId: state.adminId, fromStatus: "APPROVED", toStatus: "APPROVED",
      note: `Payment ${f.payment.id}; submission ${f.proof!.id}; review VERIFY; PROOF_SUBMITTED -> VERIFIED. Original deadline preserved.` });
    expect(after.outbox).toHaveLength(1);
    expect(after.outbox[0]).toMatchObject({ kind: "PAYMENT_VERIFIED", status: "PENDING", paymentId: f.payment.id,
      attemptCount: 0, sentAt: null, providerMessageId: null });
    expect(portalGuard(after.learner.portalAccess, after.enrollments)).toBe(true);
    expect(await requireStudentPage()).toMatchObject({ studentId: f.learner.id, supabaseUserId: f.customer.supabaseUserId });
    expect(await requireStudentApi()).toMatchObject({ session: { studentId: f.learner.id, supabaseUserId: f.customer.supabaseUserId } });
    expect(state.signOut).not.toHaveBeenCalled();
    expect(await review(f.payment.id, verifyInput(f))).toMatchObject({ idempotent: true, status: "VERIFIED" });
    expect(await snapshot()).toEqual(after);
    expect(state.sendEmail).not.toHaveBeenCalled();
  });

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
    expect(await db.coursePaymentNotification.count({ where: { paymentId: f.payment.id, kind: "PAYMENT_VERIFIED" } })).toBe(1);
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
    expect(await db.coursePaymentNotification.count({ where: { paymentId: f.payment.id, kind: "PROOF_REJECTED" } })).toBe(1);
    expect(await db.coursePaymentNotification.count({ where: { paymentId: f.payment.id, kind: "PROOF_RECEIVED" } })).toBe(1);
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
    expect(await db.courseApplicationEvent.count({ where: { applicationId: f.application.id } })).toBe(0);
    expect(await db.coursePaymentNotification.count({ where: { paymentId: f.payment.id } })).toBe(0);
    expect(await db.coursePayment.findUnique({ where: { id: f.payment.id } })).toMatchObject({ verifiedByAdminId: null });
    expect(await db.coursePaymentSubmission.findUnique({ where: { id: f.proof!.id } })).toMatchObject({ reviewedByAdminId: null });
  });

  it("scheduler vs scheduler and restart produce one transition, audit and durable notification", async () => {
    const f = await fixture({ expired: true, pending: true }); isolateJob(f.payment.id);
    await db.courseCohort.update({ where: { id: f.cohort!.id }, data: { status: "FULL" } });
    const jobs = await Promise.all([runJob(), runJob()]);
    expect(jobs.reduce((n, j) => n + j.expired, 0)).toBe(1);
    expect(await db.coursePaymentNotification.count({ where: { paymentId: f.payment.id, kind: "INITIAL_PAYMENT_EXPIRED" } })).toBe(1);
    expect(await db.courseApplicationEvent.count({ where: { applicationId: f.application.id } })).toBe(1);
    expect(await db.courseCohortSeat.findUnique({ where: { id: f.cohort!.seats[0].id } })).toMatchObject({ currentEnrollmentId: null, reservedUntil: null });
    expect(await db.courseCohort.findUnique({ where: { id: f.cohort!.id } })).toMatchObject({ status: "OPEN" });
    expect((await runJob()).expired).toBe(0);
    expect(await db.coursePaymentNotification.count({ where: { paymentId: f.payment.id, kind: "INITIAL_PAYMENT_EXPIRED" } })).toBe(1);
    expect((await db.coursePayment.findUniqueOrThrow({ where: { id: f.payment.id } })).expiresAt).toEqual(f.payment.expiresAt);
  });

  it("scheduler vs VERIFY protects timely proof and active access", async () => {
    const f = await fixture({ expired: true }); isolateJob(f.payment.id);
    await Promise.all([runJob(), review(f.payment.id, verifyInput(f))]);
    expect(await db.coursePayment.findUnique({ where: { id: f.payment.id } })).toMatchObject({ status: "VERIFIED" });
    expect(await db.coursePortalAccess.count({ where: { enrollmentId: f.enrollment.id, status: "ENABLED" } })).toBe(1);
    expect((await runJob()).expired).toBe(0);
    expect(await db.coursePaymentNotification.count({ where: { paymentId: f.payment.id, kind: "INITIAL_PAYMENT_EXPIRED" } })).toBe(0);
  });

  it("scheduler vs REJECT expires once without sending a second rejection email", async () => {
    const f = await fixture({ expired: true }); isolateJob(f.payment.id);
    await Promise.all([runJob(), review(f.payment.id, rejectInput(f))]);
    expect(await db.coursePayment.findUnique({ where: { id: f.payment.id } })).toMatchObject({ status: "EXPIRED" });
    expect((await runJob()).expired).toBe(0);
    expect(await db.coursePaymentNotification.count({ where: { paymentId: f.payment.id, kind: "INITIAL_PAYMENT_EXPIRED" } })).toBe(0);
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

  it("delivery unavailability never rolls back expiration or duplicates its durable notification", async () => {
    const f = await fixture({ pending: true, expired: true }); isolateJob(f.payment.id);
    expect(await runJob()).toMatchObject({ expired: 1, notificationsCreated: 1, failed: 0 });
    expect(await db.coursePayment.findUnique({ where: { id: f.payment.id } })).toMatchObject({ status: "EXPIRED" });
    expect((await runJob()).expired).toBe(0);
    expect(await db.coursePaymentNotification.count({ where: { paymentId: f.payment.id, kind: "INITIAL_PAYMENT_EXPIRED" } })).toBe(1);
  });
});
