/** Opt-in: disposable loopback database only. Never loads production dotenv. */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ adminId: "", authId: "11111111-1111-4111-8111-111111111199" }));
vi.mock("@/lib/admin/dal", () => ({ verifyAdminSession: async () => ({ adminId: state.adminId }) }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { auth: { admin: { getUserById: async (id: string) => ({ data: { user: { id, email: "local-payer@example.invalid", email_confirmed_at: "2026-01-01T00:00:00Z" } }, error: null }) } } } }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const url = new URL(process.env.COURSE_PREPARATION_TEST_DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/learner_compat") throw new Error("Refusing non-disposable DB");
  return { prisma: new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 5 }) }) };
});

describe.runIf(Boolean(process.env.COURSE_PREPARATION_TEST_DATABASE_URL))("real PostgreSQL preparation safety", () => {
  let db: PrismaClient;
  let service: typeof import("./cohorts");
  let prepare: typeof import("./prepare-enrollment");
  let planId: string;
  let cohortId: string;
  let applicationId: string;
  const prefix = `prep-${Date.now()}`;
  beforeAll(async () => {
    db = (await import("@/lib/db")).prisma;
    const target = await db.$queryRaw<{ host: string }[]>`SELECT host(inet_server_addr()) AS host`;
    expect(target[0].host).toBe("127.0.0.1");
    service = await import("./cohorts"); prepare = await import("./prepare-enrollment");
    const admin = await db.admin.create({ data: { username: prefix, displayName: "Local test admin", passwordHash: "disposable-test-only" } });
    state.adminId = admin.id;
    planId = (await db.coursePlan.findUniqueOrThrow({ where: { code: "BEGINNER_GROUP" } })).id;
    applicationId = (await db.courseApplication.create({ data: { fullName: "Local application", email: `${prefix}@example.invalid`, status: "APPROVED", requestedPlanId: planId } })).id;
  });
  afterAll(async () => { await db?.$disconnect(); });
  it("concurrent cohort creation produces one cohort and exactly four seats", async () => {
    const input = { code: prefix, name: "Local test cohort", coursePlanId: planId };
    const [a,b] = await Promise.all([service.createCohort(input),service.createCohort(input)]);
    expect(a.id).toBe(b.id); cohortId=a.id;
    expect(await db.courseCohortSeat.count({where:{cohortId}})).toBe(4);
    await expect(db.courseCohortSeat.create({data:{cohortId,position:1}})).rejects.toMatchObject({code:"P2002"});
    await expect(db.courseCohortSeat.create({data:{cohortId,position:5}})).rejects.toThrow();
    await expect(service.openCohort(cohortId)).rejects.toThrow();
    await service.configureCohort(cohortId,{weeklyDay:"SATURDAY",localStartTime:"18:00",durationMinutes:60,timeZone:"America/New_York",courseStartDate:"2026-10-10",courseEndDate:"2027-01-10"});
    await service.openCohort(cohortId);
  });
  it("concurrent preparation creates one learner/link/audit event and no financial/access/seat mutations", async () => {
    const before = await Promise.all([db.courseEnrollment.count(),db.coursePayment.count(),db.coursePaymentSubmission.count(),db.coursePortalAccess.count(),db.customerStudentRelation.count()]);
    const input={relationship:"GUARDIAN",supabaseUserId:state.authId,learner:{mode:"NEW",fullName:"Local Child"},coursePlanId:planId,cohortId,agreedStartDate:null};
    const [a,b]=await Promise.all([prepare.prepareEnrollment(applicationId,input),prepare.prepareEnrollment(applicationId,input)]);
    expect(a.learner.id).toBe(b.learner.id);expect(a.customer.id).toBe(b.customer.id);
    expect(await db.courseApplicationEvent.count({where:{applicationId}})).toBe(1);
    const learner=await db.studentProfile.findUniqueOrThrow({where:{id:a.learner.id}});
    expect(learner).toMatchObject({supabaseUserId:null,email:null,portalAccess:false});
    expect(await db.courseCohortSeat.count({where:{cohortId,currentEnrollmentId:null}})).toBe(4);
    expect(await Promise.all([db.courseEnrollment.count(),db.coursePayment.count(),db.coursePaymentSubmission.count(),db.coursePortalAccess.count(),db.customerStudentRelation.count()])).toEqual(before);
  });
});
