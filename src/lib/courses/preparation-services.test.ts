import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseCohort, CourseCohortSeat, CoursePlan } from "@prisma/client";
import { Prisma } from "@prisma/client";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => {
  const model = () => ({ findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn() });
  const tx = { courseApplication:model(), courseApplicationEvent:model(), coursePlan:model(), courseCohort:model(), studentProfile:model(), customer:model(), customerStudentRelation:model(), courseCohortSeat:model(), courseEnrollment:model(), coursePayment:model(), coursePaymentSubmission:model(), coursePortalAccess:model(), $queryRaw:vi.fn() };
  return {tx, auth:vi.fn(), getUser:vi.fn(), transaction:vi.fn()};
});
vi.mock("@/lib/db",()=>({prisma:{...m.tx,$transaction:m.transaction}}));
vi.mock("@/lib/admin/dal",()=>({verifyAdminSession:m.auth}));
vi.mock("@/lib/supabase-admin",()=>({supabaseAdmin:{auth:{admin:{getUserById:m.getUser}}}}));
vi.mock("@/lib/supabase-server",()=>({createSupabaseServerClient:vi.fn()}));
import { prepareEnrollment } from "./prepare-enrollment";
import { serializable } from "./admin-service";
import { assertCohortSelectable, createCohort, openCohort, configureCohort } from "./cohorts";
const authId="11111111-1111-4111-8111-111111111111";
const plan={id:"plan",code:"BEGINNER_GROUP",format:"GROUP",level:"BEGINNER",monthlyPriceCents:5000,currency:"USD",billingInterval:"MONTHLY",active:true,archivedAt:null,groupMinimumStudents:3,groupMaximumStudents:4} as CoursePlan;
const seats=[1,2,3,4].map(position=>({id:`seat-${position}`,position,currentEnrollmentId:null,assignedAt:null,reservedUntil:null})) as CourseCohortSeat[];
const cohort={id:"cohort",code:"A",name:"Group A",coursePlanId:"plan",coursePlan:plan,status:"OPEN",archivedAt:null,minimumStudents:3,maximumStudents:4,weeklyDay:"SATURDAY",localStartTime:new Date("1970-01-01T18:00:00Z"),durationMinutes:60,timeZone:"America/New_York",courseStartDate:new Date("2026-01-31T00:00:00Z"),courseEndDate:null,seats} as CourseCohort & {coursePlan:CoursePlan;seats:CourseCohortSeat[]};
const customer={id:"customer",supabaseUserId:authId,email:"verified@example.invalid",status:"ACTIVE",archivedAt:null,deactivatedAt:null};
const application={id:"app",status:"APPROVED",requestedPlanId:"plan",customerId:null,studentProfileId:null,locale:"en",courseEnrollment:null,email:"not-the-payer@example.invalid"};
const learner={id:"learner",fullName:"Child",supabaseUserId:null,email:null,status:"ACTIVE",archivedAt:null,portalAccess:false};
const input={relationship:"GUARDIAN",supabaseUserId:authId,learner:{mode:"EXISTING",studentId:"learner"},coursePlanId:"plan",cohortId:"cohort",agreedStartDate:null};
beforeEach(()=>{
  vi.resetAllMocks();
  m.auth.mockResolvedValue({adminId:"admin"});
  m.getUser.mockResolvedValue({data:{user:{id:authId,email:customer.email,email_confirmed_at:"2026-01-01T00:00:00Z"}},error:null});
  m.transaction.mockImplementation(async fn=>fn(m.tx));
  m.tx.courseApplication.findUnique.mockResolvedValue(application);
  m.tx.coursePlan.findUnique.mockResolvedValue(plan);
  m.tx.courseCohort.findUnique.mockResolvedValue(cohort);
  m.tx.studentProfile.findUnique.mockResolvedValue(learner);
  m.tx.studentProfile.create.mockResolvedValue(learner);
  m.tx.customer.upsert.mockResolvedValue(customer);
  m.tx.customerStudentRelation.findMany.mockResolvedValue([]);
});
describe("preparation identity and write boundary",()=>{
  it("prepares a guardian-owned account without email linking or financial writes",async()=>{
    const summary=await prepareEnrollment("app",input);
    expect(summary.customer.email).toBe(customer.email);
    expect(summary.learner.hasLogin).toBe(false);
    expect(summary.relationshipState).toBe("DEFERRED_TO_FINAL_TRANSACTION");
    expect(summary.periodStart).toBe("2026-01-31");expect(summary.periodEnd).toBe("2026-02-28");
    expect(summary.plan.monthlyPriceCents).toBe(5000);
    expect(m.tx.customer.upsert.mock.calls[0][0].where).toEqual({supabaseUserId:authId});
    expect(m.tx.studentProfile.findUnique).toHaveBeenCalledWith({where:{id:"learner"}});
    for(const name of ["courseEnrollment","coursePayment","coursePaymentSubmission","coursePortalAccess","courseCohortSeat","customerStudentRelation"] as const) {
      expect(m.tx[name].create).not.toHaveBeenCalled();expect(m.tx[name].update).not.toHaveBeenCalled();expect(m.tx[name].upsert).not.toHaveBeenCalled();
    }
  });
  it("creates a guardian learner with both identity fields null and portal access false",async()=>{
    await prepareEnrollment("app",{...input,learner:{mode:"NEW",fullName:"Child"}});
    expect(m.tx.studentProfile.create).toHaveBeenCalledWith({data:expect.objectContaining({fullName:"Child",supabaseUserId:null,email:null,portalAccess:false})});
  });
  it("creates SELF only from the verified learner-owned account",async()=>{
    m.tx.studentProfile.findUnique.mockResolvedValue(null);
    m.tx.studentProfile.create.mockResolvedValue({...learner,supabaseUserId:authId,email:customer.email});
    await prepareEnrollment("app",{...input,relationship:"SELF",learner:{mode:"NEW",fullName:"Learner"}});
    expect(m.tx.studentProfile.create.mock.calls[0][0].data).toMatchObject({supabaseUserId:authId,email:customer.email,portalAccess:false});
  });
  it("reuses resolved application identities on retries without duplicate learners or audit events",async()=>{
    m.tx.courseApplication.findUnique.mockResolvedValue({...application,studentProfileId:"learner",customerId:"customer"});
    await prepareEnrollment("app",{...input,learner:{mode:"NEW",fullName:"Child"}});
    expect(m.tx.studentProfile.create).not.toHaveBeenCalled();expect(m.tx.courseApplicationEvent.create).not.toHaveBeenCalled();
  });
  it("requires server-side admin authorization before Supabase lookup",async()=>{
    m.auth.mockResolvedValue(null);await expect(prepareEnrollment("app",input)).rejects.toThrow("Admin");expect(m.getUser).not.toHaveBeenCalled();
  });
  it("rejects unverified identities before database writes",async()=>{
    m.getUser.mockResolvedValue({data:{user:{id:authId,email:"unverified@example.invalid",email_confirmed_at:null}},error:null});
    await expect(prepareEnrollment("app",input)).rejects.toThrow("verified");expect(m.transaction).not.toHaveBeenCalled();
  });
  it.each(["SELF","GUARDIAN"])("rejects contradictory existing %s relation",async(type)=>{
    m.tx.customerStudentRelation.findMany.mockResolvedValue([{customerId:"customer",type,endedAt:type==="GUARDIAN"?new Date():null,archivedAt:null}]);
    await expect(prepareEnrollment("app",input)).rejects.toThrow("relationship");
  });
  it("recognizes an active existing guardian relation without rewriting it",async()=>{
    m.tx.customerStudentRelation.findMany.mockResolvedValue([{customerId:"customer",type:"GUARDIAN",endedAt:null,archivedAt:null}]);
    expect((await prepareEnrollment("app",input)).relationshipState).toBe("ACTIVE_EXISTING");
  });
  it.each(["PENDING","WAITLISTED","DECLINED"])("rejects application status %s",async(status)=>{m.tx.courseApplication.findUnique.mockResolvedValue({...application,status});await expect(prepareEnrollment("app",input)).rejects.toThrow("APPROVED");expect(m.tx.customer.upsert).not.toHaveBeenCalled();});
  it("rejects client pricing and email-only payer resolution",async()=>{
    await expect(prepareEnrollment("app",{...input,price:1})).rejects.toThrow();
    await expect(prepareEnrollment("app",{...input,supabaseUserId:"verified@example.invalid"})).rejects.toThrow();expect(m.getUser).not.toHaveBeenCalled();
  });
  it("requires matching cohort and authoritative group start",async()=>{
    await expect(prepareEnrollment("app",{...input,agreedStartDate:"2026-02-01"})).rejects.toThrow("Group start");
    m.tx.courseCohort.findUnique.mockResolvedValue({...cohort,coursePlanId:"wrong"});await expect(prepareEnrollment("app",input)).rejects.toThrow("matching");
  });
  it("1-to-1 requires an agreed date and forbids a cohort",async()=>{
    m.tx.coursePlan.findUnique.mockResolvedValue({...plan,format:"ONE_TO_ONE",monthlyPriceCents:8500});
    await expect(prepareEnrollment("app",input)).rejects.toThrow("1-to-1");
    await expect(prepareEnrollment("app",{...input,cohortId:null})).rejects.toThrow("1-to-1");
    const result=await prepareEnrollment("app",{...input,cohortId:null,agreedStartDate:"2028-01-31",billingTimeZone:"America/New_York"});
    expect(result.periodEnd).toBe("2028-02-29");expect(result.plan.monthlyPriceCents).toBe(8500);expect(result).not.toHaveProperty("expiresAt");
  });
});
describe("cohort service",()=>{
  it.each(["DRAFT","FULL","ACTIVE","COMPLETED","CANCELLED"] as const)("%s cannot be selected",status=>expect(()=>assertCohortSelectable({...cohort,status},"plan")).toThrow());
  it("OPEN with complete schedule and free capacity is selectable",()=>expect(()=>assertCohortSelectable(cohort,"plan")).not.toThrow());
  it("creates exactly four seats atomically and reuses the code on retry",async()=>{
    m.tx.courseCohort.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({...cohort,name:"Group A"});
    const value={code:"A",name:"Group A",coursePlanId:"plan"};
    await createCohort(value);await createCohort(value);
    expect(m.tx.courseCohort.create).toHaveBeenCalledTimes(1);
    expect(m.tx.courseCohort.create.mock.calls[0][0].data.seats.create).toEqual([1,2,3,4].map(position=>({position})));
    expect(m.transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:"Serializable"});
  });
  it("never creates a 1-to-1 cohort",async()=>{m.tx.coursePlan.findUnique.mockResolvedValue({...plan,format:"ONE_TO_ONE"});await expect(createCohort({code:"A",name:"A",coursePlanId:"plan"})).rejects.toThrow("GROUP");expect(m.tx.courseCohort.create).not.toHaveBeenCalled();});
  it("incomplete DRAFT cannot OPEN",async()=>{m.tx.courseCohort.findUnique.mockResolvedValue({...cohort,status:"DRAFT",courseStartDate:null});await expect(openCohort("cohort")).rejects.toThrow();expect(m.tx.courseCohort.update).not.toHaveBeenCalled();});
  it("complete DRAFT can OPEN without changing seats",async()=>{m.tx.courseCohort.findUnique.mockResolvedValue({...cohort,status:"DRAFT"});await openCohort("cohort");expect(m.tx.courseCohort.update).toHaveBeenCalledWith({where:{id:"cohort"},data:{status:"OPEN"}});expect(m.tx.courseCohortSeat.update).not.toHaveBeenCalled();});
  it("invalid timezone cannot be saved",async()=>{await expect(configureCohort("cohort",{weeklyDay:"MONDAY",localStartTime:"18:00",durationMinutes:60,timeZone:"Mars/City",courseStartDate:"2026-10-10",courseEndDate:null})).rejects.toThrow();expect(m.transaction).not.toHaveBeenCalled();});
});

describe("bounded transaction retry", () => {
  const rawConflict = () => new Prisma.PrismaClientKnownRequestError("local serialization conflict", { code: "P2010", clientVersion: "7.8.0", meta: { driverAdapterError: { cause: { originalCode: "40001" } } } });
  it("handles Prisma 7 adapter SQLSTATE metadata from a raw row lock", async () => {
    m.transaction.mockRejectedValueOnce(rawConflict());
    await expect(serializable(async () => "success")).resolves.toBe("success");
    expect(m.transaction).toHaveBeenCalledTimes(2);
  });
  it("stops after three failed attempts", async () => {
    m.transaction.mockRejectedValue(rawConflict());
    await expect(serializable(async () => "unused")).rejects.toThrow();
    expect(m.transaction).toHaveBeenCalledTimes(3);
  });
  it("does not retry unrelated failures", async () => {
    m.transaction.mockRejectedValue(new Error("unrelated"));
    await expect(serializable(async () => "unused")).rejects.toThrow("unrelated");
    expect(m.transaction).toHaveBeenCalledTimes(1);
  });
});
