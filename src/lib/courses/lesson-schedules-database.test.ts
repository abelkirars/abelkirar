import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
vi.mock("server-only",()=>({}));
const auth=vi.hoisted(()=>({adminId:"",allowed:true,customerId:"",studentId:"",studentAllowed:false}));
vi.mock("@/lib/admin/dal",()=>({verifyAdminSession:async()=>auth.allowed?{adminId:auth.adminId}:null}));
vi.mock("@/lib/customer/dal",()=>({getCurrentAuthenticatedCustomer:async()=>auth.customerId?{id:auth.customerId,status:"ACTIVE",archivedAt:null}:null}));
vi.mock("@/lib/student/dal",()=>({resolveStudentSession:async()=>auth.studentAllowed?{kind:"active",session:{studentId:auth.studentId}}:{kind:"portal-denied"}}));
vi.mock("@/lib/db",()=>{
  const u=new URL(process.env.COURSE_SCHEDULING_TEST_DATABASE_URL!);
  if(u.hostname!=="127.0.0.1"||u.port!=="55439"||u.pathname!=="/scheduling"||u.search||u.hash)throw new Error("Disposable target required");
  return {prisma:new PrismaClient({adapter:new PrismaPg({connectionString:u.toString(),max:10})})};
});
describe.runIf(Boolean(process.env.COURSE_SCHEDULING_TEST_DATABASE_URL))("PostgreSQL scheduling foundation",()=>{
  let db:PrismaClient;
  let service:typeof import("./lesson-schedules");
  beforeAll(async()=>{
    db=(await import("@/lib/db")).prisma;
    const [r]=await db.$queryRaw<{host:string;port:number;database:string;directory:string;listen:string}[]>`SELECT host(inet_server_addr()) host,inet_server_port() port,current_database() database,current_setting('data_directory') directory,current_setting('listen_addresses') listen`;
    expect(r).toMatchObject({host:"127.0.0.1",port:55439,database:"scheduling",listen:"127.0.0.1"});
    expect(realpathSync(r.directory)).toBe(realpathSync(process.env.COURSE_SCHEDULING_TEST_DATA_DIRECTORY!));
    service=await import("./lesson-schedules");
    auth.adminId=(await db.admin.create({data:{username:randomUUID(),displayName:"Local admin",passwordHash:"local-only"}})).id;
  });
  afterAll(async()=>{await db?.$disconnect();});
  afterEach(()=>{auth.allowed=true;auth.customerId="";auth.studentId="";auth.studentAllowed=false;});
  async function owner(kind:"cohort"|"enrollment"="cohort"){
    if(kind==="cohort")return {kind,id:(await db.courseCohort.create({data:{coursePlanId:"plan_beginner_group",code:randomUUID(),name:"Local synthetic group",seats:{create:[1,2,3,4].map(position=>({position}))}}})).id};
    const id=randomUUID();const c=await db.customer.create({data:{supabaseUserId:id,email:`${id}@example.invalid`,emailNormalized:`${id}@example.invalid`,emailVerifiedAt:new Date(),emailSyncedAt:new Date()}});
    const s=await db.studentProfile.create({data:{fullName:"Local private learner"}});
    return {kind,id:(await db.courseEnrollment.create({data:{customerId:c.id,studentId:s.id,coursePlanId:"plan_beginner_one_to_one",formatSnapshot:"ONE_TO_ONE",levelSnapshot:"BEGINNER",planCodeSnapshot:"BEGINNER_ONE_TO_ONE"}})).id};
  }
  async function teacher(){return (await db.admin.create({data:{username:randomUUID(),displayName:"Explicit local teacher",passwordHash:"local-only"}})).id;}
  const pair=(t:string,start=600)=>({teacherAdminId:t,slots:[
    {ordinal:1,weekday:"TUESDAY",localStartMinute:start,durationMinutes:60,timeZone:"America/Chicago",effectiveStartDate:"2026-10-01",effectiveEndDate:null},
    {ordinal:2,weekday:"THURSDAY",localStartMinute:start,durationMinutes:60,timeZone:"America/Chicago",effectiveStartDate:"2026-10-01",effectiveEndDate:null},
  ]});
  const tx=<T>(fn:(t:Prisma.TransactionClient)=>Promise<T>)=>db.$transaction(fn,{isolationLevel:"Serializable"});
  const raw=(cohortId:string,extra:Record<string,unknown>={})=>({id:randomUUID(),cohortId,ordinal:1,weekday:"TUESDAY" as const,localStartMinute:600,durationMinutes:60,timeZone:"America/Chicago",effectiveStartDate:new Date("2026-10-01T00:00:00Z"),...extra});
  async function fingerprint(){
    const result:unknown[]=[];
    for(const name of ["CoursePlan","CoursePrice","CourseApplication","CourseEnrollment","CourseCohort","CourseCohortSeat","CoursePayment","CoursePaymentSubmission","CoursePortalAccess","Customer","StudentProfile","CustomerStudentRelation","CoursePaymentNotification","Order","WeeklyPractice"]){
      result.push(await db.$queryRawUnsafe(`SELECT to_jsonb(t) value FROM "${name}" t ORDER BY to_jsonb(t)::text`));
    }return result;
  }
  it.each(["cohort","enrollment"] as const)("creates two explicit %s drafts, publishes once and safely replays without business changes",async kind=>{
    const o=await owner(kind),t=await teacher(),before=await fingerprint();
    const a=await service.saveLessonScheduleDraft(o,pair(t));expect(a).toHaveLength(2);expect(a.every(s=>s.state==="DRAFT")).toBe(true);
    expect((await service.readAdminLessonSchedule(o)).state).toBe("INCOMPLETE");
    expect((await service.saveLessonScheduleDraft(o,pair(t))).map(s=>s.id)).toEqual(a.map(s=>s.id));
    const p=await service.publishLessonSchedule(o);expect(p.every(s=>s.state==="PUBLISHED"&&s.publishedAt&&s.publishedByAdminId===auth.adminId)).toBe(true);
    expect(await service.publishLessonSchedule(o)).toEqual(p);expect((await service.readAdminLessonSchedule(o)).state).toBe("PUBLISHED");
    expect(await fingerprint()).toEqual(before);
  });
  it("rejects unauthorized writes and reads before touching schedule state",async()=>{
    const o=await owner(),t=await teacher();auth.allowed=false;
    await expect(service.saveLessonScheduleDraft(o,pair(t))).rejects.toThrow("Admin authentication");
    await expect(service.publishLessonSchedule(o)).rejects.toThrow("Admin authentication");
    await expect(service.archiveLessonSchedule(o)).rejects.toThrow("Admin authentication required");
    await expect(service.readAdminLessonSchedule(o)).rejects.toThrow("Admin authentication");
  });
  it("saves an incomplete draft without publishing or reserving teacher time, then completes the pair",async()=>{
    const o=await owner(),competitor=await owner(),t=await teacher(),before=await fingerprint();
    const input=pair(t),one={...input,slots:input.slots.slice(0,1)};
    const saved=await service.saveLessonScheduleDraft(o,one);
    expect(saved).toHaveLength(1);expect(saved[0]).toMatchObject({state:"DRAFT",publishedAt:null,teacherAdminId:t});
    await expect(service.publishLessonSchedule(o)).rejects.toThrow();
    await service.saveLessonScheduleDraft(competitor,input);await service.publishLessonSchedule(competitor);
    await service.archiveLessonSchedule(competitor);
    input.slots[1].durationMinutes=45;
    await service.saveLessonScheduleDraft(o,input);
    const published=await service.publishLessonSchedule(o);
    expect(published.map(s=>s.durationMinutes)).toEqual([60,45]);expect(published.every(s=>s.state==="PUBLISHED")).toBe(true);
    expect(await fingerprint()).toEqual(before);
  });
  it("removing a draft lesson archives it rather than silently retaining or deleting it",async()=>{
    const o=await owner(),input=pair(await teacher());const original=await service.saveLessonScheduleDraft(o,input);
    const before=await fingerprint();
    const remaining=await service.saveLessonScheduleDraft(o,{...input,slots:input.slots.slice(0,1)});
    expect(remaining).toHaveLength(1);expect(remaining[0].ordinal).toBe(1);
    const historical=await db.courseLessonScheduleSlot.findUniqueOrThrow({where:{id:original[1].id}});
    expect(historical.archivedAt).not.toBeNull();expect(historical.state).toBe("DRAFT");
    await expect(service.publishLessonSchedule(o)).rejects.toThrow();
    expect(await fingerprint()).toEqual(before);
  });
  it("admin editor preserves a legacy lesson without inferring a teacher or second lesson",async()=>{
    const views=await import("./lesson-schedule-views"),o=await owner();
    const original=await tx(t=>t.courseLessonScheduleSlot.create({data:raw(o.id,{state:"LEGACY",weekday:"SATURDAY",teacherAdminId:null})}));
    const view=await views.getAdminLessonScheduleEditor(o);
    expect(view).toMatchObject({state:"LEGACY",slots:[{ordinal:1,weekday:"SATURDAY",teacherAdminId:null}]});
    expect(view!.slots).toHaveLength(1);expect(view!.teachers.every(t=>t.id&&t.displayName)).toBe(true);
    const input=pair(await teacher());await service.saveLessonScheduleDraft(o,{...input,slots:input.slots.slice(0,1)});
    expect(await db.courseLessonScheduleSlot.findUniqueOrThrow({where:{id:original.id}})).toMatchObject({...original,archivedAt:expect.any(Date),updatedAt:expect.any(Date),updatedByAdminId:auth.adminId});
    await expect(service.publishLessonSchedule(o)).rejects.toThrow();
    auth.allowed=false;await expect(views.getAdminLessonScheduleEditor(o)).rejects.toThrow("Admin authentication");
    await expect(views.listAdminLessonScheduleOwners()).rejects.toThrow("Admin authentication");
  });
  it.each(["cohort","enrollment"] as const)("My Lessons reads only the authorized published %s schedule and removes it after archive",async kind=>{
    const views=await import("./lesson-schedule-views"),privateOwner=await owner("enrollment");
    const o=kind==="cohort"?await owner():privateOwner;
    const e=await db.courseEnrollment.update({where:{id:privateOwner.id},data:kind==="cohort"?{cohortId:o.id,coursePlanId:"plan_beginner_group",formatSnapshot:"GROUP",planCodeSnapshot:"BEGINNER_GROUP"}:{}});
    auth.studentAllowed=true;auth.studentId=e.studentId;
    const input=pair(await teacher());
    await service.saveLessonScheduleDraft(o,input);
    expect(await views.readMyLessonSchedules()).toEqual([]); // Pending payment.
    await db.courseEnrollment.update({where:{id:e.id},data:{status:"ACTIVE",portalAccess:{create:{status:"ENABLED"}}}});
    expect(await views.readMyLessonSchedules()).toEqual([]); // Draft is not confirmed.
    const before=await fingerprint();
    await service.publishLessonSchedule(o);
    const result=await views.readMyLessonSchedules();expect(result).toHaveLength(1);expect(result[0].enrollmentId).toBe(e.id);expect(result[0].slots).toHaveLength(2);
    expect(result[0].slots.every(s=>s.timeZone==="America/Chicago")).toBe(true);
    auth.studentId="unrelated-learner";expect(await views.readMyLessonSchedules()).toEqual([]);
    await expect(service.readStudentLessonSchedule(e.id)).rejects.toThrow("Enrollment not found");
    auth.studentId=e.studentId;auth.studentAllowed=false;
    await expect(views.readMyLessonSchedules()).rejects.toThrow("Student portal access required");
    auth.studentAllowed=true;await service.archiveLessonSchedule(o);
    expect(await views.readMyLessonSchedules()).toEqual([]);
    expect((await service.archiveLessonSchedule(o)).archivedCount).toBe(0);
    expect(await fingerprint()).toEqual(before);
  });
  it("My Lessons hides legacy, expired, paused and suspended schedules and labels a future window",async()=>{
    const views=await import("./lesson-schedule-views"),o=await owner("enrollment");
    const e=await db.courseEnrollment.update({where:{id:o.id},data:{status:"ACTIVE",portalAccess:{create:{status:"ENABLED"}}}});
    auth.studentAllowed=true;auth.studentId=e.studentId;
    await tx(t=>t.courseLessonScheduleSlot.create({data:{...raw("unused",{state:"LEGACY"}),cohortId:null,enrollmentId:o.id}}));
    expect(await views.readMyLessonSchedules()).toEqual([]);
    const input=pair(await teacher());input.slots.forEach(s=>s.effectiveStartDate="2099-01-01");
    await service.saveLessonScheduleDraft(o,input);await service.publishLessonSchedule(o);
    expect(await views.readMyLessonSchedules()).toMatchObject([{startsLater:true}]);
    await db.coursePortalAccess.update({where:{enrollmentId:e.id},data:{status:"SUSPENDED",changedByAdminId:input.teacherAdminId,reason:"Isolated schedule visibility test",changedAt:new Date()}});
    expect(await views.readMyLessonSchedules()).toEqual([]);
    await db.coursePortalAccess.update({where:{enrollmentId:e.id},data:{status:"ENABLED"}});
    await db.courseEnrollment.update({where:{id:e.id},data:{status:"PAUSED"}});
    expect(await views.readMyLessonSchedules()).toEqual([]);
    await db.courseEnrollment.update({where:{id:e.id},data:{status:"ACTIVE"}});
    await service.archiveLessonSchedule(o);
    const past={...input,slots:input.slots.map(s=>({...s,effectiveStartDate:"2020-01-01",effectiveEndDate:"2020-12-31"}))};
    await service.saveLessonScheduleDraft(o,past);await service.publishLessonSchedule(o);
    expect(await views.readMyLessonSchedules()).toEqual([]);
  });
  it("admin editor rejects mixed group/private owners and returns only active teacher options",async()=>{
    const views=await import("./lesson-schedule-views"),o=await owner("enrollment"),group=await owner();
    const inactive=await teacher();await db.admin.update({where:{id:inactive},data:{isActive:false}});
    expect((await views.getAdminLessonScheduleEditor(o))!.teachers.some(t=>t.id===inactive)).toBe(false);
    expect(await views.getAdminLessonScheduleEditor({kind:"enrollment",id:group.id})).toBeNull();
    await db.courseEnrollment.update({where:{id:o.id},data:{cohortId:group.id,coursePlanId:"plan_beginner_group",formatSnapshot:"GROUP",planCodeSnapshot:"BEGINNER_GROUP"}});
    expect(await views.getAdminLessonScheduleEditor(o)).toBeNull();
  });
  it("customer/student readers isolate enrollment ownership and preserve portal gates",async()=>{
    const o=await owner("enrollment"),e=await db.courseEnrollment.findUniqueOrThrow({where:{id:o.id}});
    await service.saveLessonScheduleDraft(o,pair(await teacher()));await service.publishLessonSchedule(o);
    await expect(service.readCustomerLessonSchedule(o.id)).rejects.toThrow();auth.customerId="not-owner";
    await expect(service.readCustomerLessonSchedule(o.id)).rejects.toThrow();auth.customerId=e.customerId;
    expect((await service.readCustomerLessonSchedule(o.id)).state).toBe("PUBLISHED");
    await expect(service.readStudentLessonSchedule(o.id)).rejects.toThrow();auth.studentAllowed=true;auth.studentId=e.studentId;
    await expect(service.readStudentLessonSchedule(o.id)).rejects.toThrow(); // Pending/unpaid does not acquire access.
    await db.courseEnrollment.update({where:{id:e.id},data:{status:"ACTIVE",portalAccess:{create:{status:"ENABLED"}}}});
    expect((await service.readStudentLessonSchedule(o.id)).state).toBe("PUBLISHED");auth.studentId="other-learner";
    await expect(service.readStudentLessonSchedule(o.id)).rejects.toThrow();
  });
  it("requires active explicit teacher and a complete different-weekday pair",async()=>{
    const o=await owner(),t=await teacher();await db.admin.update({where:{id:t},data:{isActive:false}});
    await expect(service.saveLessonScheduleDraft(o,pair(t))).rejects.toThrow("active teacher");
    const input=pair(auth.adminId);input.slots[1].weekday="TUESDAY";
    await expect(service.saveLessonScheduleDraft(o,input)).rejects.toThrow("different weekdays");
    await expect(service.publishLessonSchedule(o)).rejects.toThrow();
  });
  it.each([["cohort","cohort"],["cohort","enrollment"],["enrollment","enrollment"]] as const)("rejects %s/%s conflicts and allows adjacency",async(aKind,bKind)=>{
    const a=await owner(aKind),b=await owner(bKind),t=await teacher();
    await service.saveLessonScheduleDraft(a,pair(t));await service.publishLessonSchedule(a);
    await service.saveLessonScheduleDraft(b,pair(t,630));await expect(service.publishLessonSchedule(b)).rejects.toThrow("conflict");
    await service.saveLessonScheduleDraft(b,pair(t,660));await service.publishLessonSchedule(b);
  });
  it("two concurrent conflicting publications cannot both succeed",async()=>{
    const a=await owner(),b=await owner("enrollment"),t=await teacher();
    await service.saveLessonScheduleDraft(a,pair(t));await service.saveLessonScheduleDraft(b,pair(t));
    const result=await Promise.allSettled([service.publishLessonSchedule(a),service.publishLessonSchedule(b)]);
    expect(result.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(await db.courseLessonScheduleSlot.count({where:{teacherAdminId:t,state:"PUBLISHED"}})).toBe(2);
  });
  it.each([
    ["XOR",{cohortId:null}], ["ordinal zero",{ordinal:0}], ["third",{ordinal:3}],
    ["start low",{localStartMinute:-1}],["start high",{localStartMinute:1440}],
    ["duration low",{durationMinutes:14}],["duration high",{durationMinutes:481}],
    ["cross-midnight",{localStartMinute:1400}], ["dates",{effectiveEndDate:new Date("2026-09-30T00:00:00Z")}],
    ["timezone",{timeZone:"Invalid/Zone"}], ["publication metadata",{state:"PUBLISHED"}],
  ])("database rejects %s",async(_label,extra)=>{
    const o=await owner();await expect(tx(t=>t.courseLessonScheduleSlot.create({data:raw(o.id,extra as Record<string,unknown>)}))).rejects.toThrow();
  });
  it("rejects non-serializable direct writes, duplicate current ordinal and unsafe deletions",async()=>{
    const o=await owner();await expect(db.courseLessonScheduleSlot.create({data:raw(o.id)})).rejects.toThrow();
    const s=await tx(t=>t.courseLessonScheduleSlot.create({data:raw(o.id)}));
    await expect(tx(t=>t.courseLessonScheduleSlot.create({data:raw(o.id)}))).rejects.toThrow();
    await expect(db.courseCohort.delete({where:{id:o.id}})).rejects.toThrow();
    await expect(tx(t=>t.courseLessonScheduleSlot.delete({where:{id:s.id}}))).rejects.toThrow();
  });
  it("database rejects a group enrollment as a private schedule owner",async()=>{
    const o=await owner("enrollment"),c=await owner();const e=await db.courseEnrollment.findUniqueOrThrow({where:{id:o.id}});
    await db.courseEnrollment.update({where:{id:e.id},data:{formatSnapshot:"GROUP",cohortId:c.id,coursePlanId:"plan_beginner_group"}});
    await expect(tx(t=>t.courseLessonScheduleSlot.create({data:{...raw(c.id),cohortId:null,enrollmentId:e.id}}))).rejects.toThrow();
  });
  it.each(["one","same weekday","different teacher","different dates","non Chicago"])("deferred database publication rejects %s and rolls back both rows",async mode=>{
    const o=await owner(),t=await teacher(),t2=await teacher();await service.saveLessonScheduleDraft(o,pair(t));
    await expect(tx(async dbtx=>{
      const slots=await dbtx.courseLessonScheduleSlot.findMany({where:{cohortId:o.id},orderBy:{ordinal:"asc"}});
      for(let i=0;i<(mode==="one"?1:2);i++)await dbtx.courseLessonScheduleSlot.update({where:{id:slots[i].id},data:{state:"PUBLISHED",publishedAt:new Date(),publishedByAdminId:auth.adminId,
        ...(i===1&&mode==="same weekday"?{weekday:"TUESDAY"}:{}),...(i===1&&mode==="different teacher"?{teacherAdminId:t2}:{}),
        ...(i===1&&mode==="different dates"?{effectiveEndDate:new Date("2027-01-01T00:00:00Z")}:{}),...(mode==="non Chicago"?{timeZone:"America/New_York"}:{})}});
    })).rejects.toThrow();expect(await db.courseLessonScheduleSlot.count({where:{cohortId:o.id,state:"PUBLISHED"}})).toBe(0);
  });
  it("database conflict trigger prevents bypassing service publication checks",async()=>{
    const a=await owner(),b=await owner(),t=await teacher();await service.saveLessonScheduleDraft(a,pair(t));await service.publishLessonSchedule(a);await service.saveLessonScheduleDraft(b,pair(t));
    await expect(tx(t=>t.courseLessonScheduleSlot.updateMany({where:{cohortId:b.id},data:{state:"PUBLISHED",publishedAt:new Date(),publishedByAdminId:auth.adminId}}))).rejects.toThrow();
    await expect(db.admin.update({where:{id:t},data:{isActive:false}})).rejects.toThrow();
  });
  it("direct concurrent Serializable writes cannot bypass conflict protection",async()=>{
    const a=await owner(),b=await owner(),teacherId=await teacher();
    await service.saveLessonScheduleDraft(a,pair(teacherId));await service.saveLessonScheduleDraft(b,pair(teacherId));
    const publish=(id:string)=>tx(t=>t.courseLessonScheduleSlot.updateMany({where:{cohortId:id},data:{state:"PUBLISHED",publishedAt:new Date(),publishedByAdminId:auth.adminId}}));
    const outcomes=await Promise.allSettled([publish(a.id),publish(b.id)]);
    expect(outcomes.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(await db.courseLessonScheduleSlot.count({where:{teacherAdminId:teacherId,state:"PUBLISHED"}})).toBe(2);
  });
  it("overlapping dates without a shared lesson occurrence are not conflicts",async()=>{
    const a=await owner(),b=await owner(),t=await teacher();
    const short=(start:string,end:string)=>({...pair(t),slots:pair(t).slots.map(s=>({...s,effectiveStartDate:start,effectiveEndDate:end}))});
    // Friday/Saturday intersection contains neither Tuesday nor Thursday.
    await service.saveLessonScheduleDraft(a,short("2026-10-01","2026-10-03"));await service.publishLessonSchedule(a);
    await service.saveLessonScheduleDraft(b,short("2026-10-02","2026-10-07"));await service.publishLessonSchedule(b);
  });
  it("legacy fallback stays incomplete and explicit drafts retain the archived snapshot",async()=>{
    const o=await owner();await db.courseCohort.update({where:{id:o.id},data:{weeklyDay:"SATURDAY",localStartTime:new Date("1970-01-01T10:00:00Z"),durationMinutes:60,timeZone:"America/Chicago",courseStartDate:new Date("2026-10-03T00:00:00Z")}});
    const legacy=await tx(t=>t.courseLessonScheduleSlot.create({data:raw(o.id,{state:"LEGACY",weekday:"SATURDAY"})}));
    expect(await service.readAdminLessonSchedule(o)).toMatchObject({state:"INCOMPLETE",slots:[],legacy:{weekday:"SATURDAY",localStartTime:"10:00:00"}});
    await service.saveLessonScheduleDraft(o,pair(await teacher()));
    const historical=await db.courseLessonScheduleSlot.findUniqueOrThrow({where:{id:legacy.id}});
    expect(historical.state).toBe("LEGACY");expect(historical.archivedAt).not.toBeNull();expect(historical.weekday).toBe("SATURDAY");
    expect(await db.courseLessonScheduleSlot.count({where:{cohortId:o.id,archivedAt:null}})).toBe(2);
    await service.publishLessonSchedule(o);
    await expect(db.courseCohort.update({where:{id:o.id},data:{weeklyDay:"MONDAY"}})).rejects.toThrow();
  });
  it("an unrelated LEGACY owner does not block publication or silently acquire inferred lessons",async()=>{
    const a=await owner(),b=await owner(),t=await teacher();
    const legacy=await tx(t=>t.courseLessonScheduleSlot.create({data:raw(a.id,{state:"LEGACY",weekday:"SATURDAY",teacherAdminId:null})}));
    await service.saveLessonScheduleDraft(b,pair(t));
    expect(await service.publishLessonSchedule(b)).toHaveLength(2);
    expect(await db.courseLessonScheduleSlot.findMany({where:{cohortId:a.id}})).toEqual([legacy]);
    await expect(service.publishLessonSchedule(a)).rejects.toThrow("Configure both drafts explicitly before publication");
    const drafts=await service.saveLessonScheduleDraft(a,pair(t,720));
    expect(drafts).toHaveLength(2);
    expect(drafts.every(s=>s.state==="DRAFT"&&s.teacherAdminId===t&&s.publishedAt===null)).toBe(true);
    expect(drafts.map(s=>s.weekday)).toEqual(["TUESDAY","THURSDAY"]);
    const retained=await db.courseLessonScheduleSlot.findUniqueOrThrow({where:{id:legacy.id}});
    expect(retained).toMatchObject({...legacy,archivedAt:expect.any(Date),updatedByAdminId:auth.adminId,updatedAt:expect.any(Date)});
  });
  it("explicitly archives LEGACY history with no business changes and a repeat is a no-op",async()=>{
    const o=await owner();
    const legacy=await tx(t=>t.courseLessonScheduleSlot.create({data:raw(o.id,{state:"LEGACY"})}));
    const before=await fingerprint();
    const result=await service.archiveLessonSchedule(o);
    expect(result).toEqual({archivedCount:1,archivedAt:expect.any(Date)});
    const archived=await db.courseLessonScheduleSlot.findUniqueOrThrow({where:{id:legacy.id}});
    expect(archived).toMatchObject({...legacy,archivedAt:result.archivedAt,updatedByAdminId:auth.adminId,updatedAt:expect.any(Date)});
    expect(await service.archiveLessonSchedule(o)).toEqual({archivedCount:0,archivedAt:null});
    expect(await db.courseLessonScheduleSlot.findUniqueOrThrow({where:{id:legacy.id}})).toEqual(archived);
    expect(await fingerprint()).toEqual(before);
  });
  it("archives both drafts even with an inactive teacher and retains their state/history",async()=>{
    const o=await owner("enrollment"),t=await teacher();
    const drafts=await service.saveLessonScheduleDraft(o,pair(t));
    await db.admin.update({where:{id:t},data:{isActive:false}});
    const before=await fingerprint(),result=await service.archiveLessonSchedule(o);
    expect(result.archivedCount).toBe(2);
    const rows=await db.courseLessonScheduleSlot.findMany({where:{enrollmentId:o.id},orderBy:{ordinal:"asc"}});
    rows.forEach((s,i)=>expect(s).toMatchObject({...drafts[i],archivedAt:result.archivedAt,updatedByAdminId:auth.adminId,updatedAt:expect.any(Date)}));
    expect(await fingerprint()).toEqual(before);
  });
  it("archives a published pair together, retains publication history and releases teacher time",async()=>{
    const a=await owner(),b=await owner("enrollment"),t=await teacher();
    const learnerOwner=await owner("enrollment");
    const enrollment=await db.courseEnrollment.update({where:{id:learnerOwner.id},data:{
      coursePlanId:"plan_beginner_group",formatSnapshot:"GROUP",planCodeSnapshot:"BEGINNER_GROUP",cohortId:a.id,billingTimeZone:"America/Chicago",
    }});
    const customer=await db.customer.findUniqueOrThrow({where:{id:enrollment.customerId}});
    await db.studentProfile.update({where:{id:enrollment.studentId},data:{supabaseUserId:customer.supabaseUserId,portalAccess:false}});
    await db.customerStudentRelation.create({data:{customerId:enrollment.customerId,studentId:enrollment.studentId,type:"SELF"}});
    await db.courseCohortSeat.update({where:{cohortId_position:{cohortId:a.id,position:1}},data:{currentEnrollmentId:enrollment.id,assignedAt:new Date(),reservedUntil:new Date(Date.now()+604800000)}});
    const paymentCreatedAt=new Date();
    const payment=await db.coursePayment.create({data:{enrollmentId:enrollment.id,kind:"INITIAL_ENROLLMENT",status:"PROOF_SUBMITTED",
      periodStart:new Date("2026-10-03T00:00:00Z"),periodEnd:new Date("2026-11-03T00:00:00Z"),createdAt:paymentCreatedAt,
      expiresAt:new Date(paymentCreatedAt.getTime()+604800000),baseAmountCents:5000,finalAmountCents:5000}});
    await db.coursePaymentSubmission.create({data:{paymentId:payment.id,attemptNumber:1,method:"ZELLE",amountSentCents:5000,
      proofStoragePath:"local-only/no-real-storage-object.png",mimeType:"image/png",fileSizeBytes:10}});
    await service.saveLessonScheduleDraft(a,pair(t));const published=await service.publishLessonSchedule(a);
    await service.saveLessonScheduleDraft(b,pair(t));
    await expect(service.publishLessonSchedule(b)).rejects.toThrow("Teacher recurring lesson conflict");
    const before=await fingerprint(),result=await service.archiveLessonSchedule(a);
    expect(result.archivedCount).toBe(2);
    const history=await db.courseLessonScheduleSlot.findMany({where:{cohortId:a.id},orderBy:{ordinal:"asc"}});
    history.forEach((s,i)=>expect(s).toMatchObject({...published[i],archivedAt:result.archivedAt,updatedByAdminId:auth.adminId,updatedAt:expect.any(Date)}));
    expect(await db.courseLessonScheduleSlot.count({where:{cohortId:a.id,archivedAt:null}})).toBe(0);
    expect(await fingerprint()).toEqual(before);
    expect(await db.coursePayment.findUniqueOrThrow({where:{id:payment.id}})).toMatchObject({status:"PROOF_SUBMITTED",verifiedAt:null,finalAmountCents:5000});
    expect(await db.coursePortalAccess.count({where:{enrollmentId:enrollment.id}})).toBe(0);
    expect(await db.courseCohortSeat.count({where:{cohortId:a.id,currentEnrollmentId:enrollment.id}})).toBe(1);
    expect(await db.courseEnrollment.findUniqueOrThrow({where:{id:enrollment.id}})).toEqual(enrollment);
    expect(await service.publishLessonSchedule(b)).toHaveLength(2);
    expect(await service.archiveLessonSchedule(a)).toEqual({archivedCount:0,archivedAt:null});
    expect(await db.courseLessonScheduleSlot.findMany({where:{cohortId:a.id},orderBy:{ordinal:"asc"}})).toEqual(history);
  });
  it.each([
    ["cohort","COMPLETED"],["cohort","CANCELLED"],["cohort","ARCHIVED"],
    ["enrollment","COMPLETED"],["enrollment","CANCELLED"],["enrollment","ARCHIVED"],
  ] as const)("archives published history for terminal %s owner (%s)",async(kind,state)=>{
    const o=await owner(kind),t=await teacher();
    if(kind==="cohort")await db.courseCohort.update({where:{id:o.id},data:{weeklyDay:"TUESDAY",localStartTime:new Date("1970-01-01T10:00:00Z"),timeZone:"America/Chicago"}});
    await service.saveLessonScheduleDraft(o,pair(t));await service.publishLessonSchedule(o);
    if(kind==="cohort")await db.courseCohort.update({where:{id:o.id},data:state==="ARCHIVED"?{archivedAt:new Date()}:{status:state}});
    else await db.courseEnrollment.update({where:{id:o.id},data:state==="ARCHIVED"?{archivedAt:new Date()}:state==="COMPLETED"?{status:state,completedAt:new Date()}:{status:state,cancelledAt:new Date(),cancellationReason:"Local terminal fixture"}});
    expect(await db.courseLessonScheduleSlot.count({where:{...(kind==="cohort"?{cohortId:o.id}:{enrollmentId:o.id}),archivedAt:null,state:"PUBLISHED"}})).toBe(2);
    await expect(service.publishLessonSchedule(o)).rejects.toThrow(kind==="cohort"?"Invalid group schedule owner":"Invalid private schedule owner");
    const before=await fingerprint();
    expect((await service.archiveLessonSchedule(o)).archivedCount).toBe(2);
    expect(await db.courseLessonScheduleSlot.count({where:{...(kind==="cohort"?{cohortId:o.id}:{enrollmentId:o.id}),archivedAt:null}})).toBe(0);
    expect(await fingerprint()).toEqual(before);
  });
  it("a late archive failure rolls back both slots and all actor/timestamp changes",async()=>{
    const o=await owner();await service.saveLessonScheduleDraft(o,pair(await teacher()));
    const published=await service.publishLessonSchedule(o),before=await fingerprint();
    await db.$executeRawUnsafe(`CREATE FUNCTION local_archive_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF (SELECT count(*) FROM archive_changes WHERE "archivedAt" IS NOT NULL)=2 THEN
        RAISE EXCEPTION 'Injected archive failure after both slot updates' USING ERRCODE='23514';
      END IF; RETURN NULL; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER local_archive_failure AFTER UPDATE ON "CourseLessonScheduleSlot"
      REFERENCING NEW TABLE AS archive_changes FOR EACH STATEMENT EXECUTE FUNCTION local_archive_failure()`);
    try {
      await expect(service.archiveLessonSchedule(o)).rejects.toThrow("Injected archive failure after both slot updates");
      expect(await db.courseLessonScheduleSlot.findMany({where:{cohortId:o.id},orderBy:{ordinal:"asc"}})).toEqual(published);
      expect(await fingerprint()).toEqual(before);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER local_archive_failure ON "CourseLessonScheduleSlot"');
      await db.$executeRawUnsafe('DROP FUNCTION local_archive_failure()');
    }
  });
  it("the unchanged database integrity trigger rejects archiving only one published member",async()=>{
    const o=await owner();await service.saveLessonScheduleDraft(o,pair(await teacher()));
    const rows=await service.publishLessonSchedule(o);
    await expect(tx(t=>t.courseLessonScheduleSlot.update({where:{id:rows[0].id},data:{archivedAt:new Date(),updatedByAdminId:auth.adminId}})))
      .rejects.toThrow("Publish exactly two different weekdays with one teacher, timezone and date window");
    expect(await db.courseLessonScheduleSlot.findMany({where:{cohortId:o.id},orderBy:{ordinal:"asc"}})).toEqual(rows);
  });
  it("concurrent archives produce one archive and one deliberate no-op",async()=>{
    const o=await owner();await service.saveLessonScheduleDraft(o,pair(await teacher()));await service.publishLessonSchedule(o);
    const results=await Promise.all([service.archiveLessonSchedule(o),service.archiveLessonSchedule(o)]);
    expect(results.map(r=>r.archivedCount).sort()).toEqual([0,2]);
    expect(await db.courseLessonScheduleSlot.count({where:{cohortId:o.id,archivedAt:null}})).toBe(0);
  });
  it("concurrent same-owner publication/archive preserves a complete archived pair",async()=>{
    for(let n=0;n<3;n++){
      const o=await owner();await service.saveLessonScheduleDraft(o,pair(await teacher()));await service.publishLessonSchedule(o);
      const [archive,publish]=await Promise.allSettled([service.archiveLessonSchedule(o),service.publishLessonSchedule(o)]);
      expect(archive.status).toBe("fulfilled");
      if(publish.status==="rejected")expect(publish.reason).toMatchObject({name:"ZodError"});
      else expect(publish.value).toHaveLength(2);
      const rows=await db.courseLessonScheduleSlot.findMany({where:{cohortId:o.id}});
      expect(rows).toHaveLength(2);expect(rows.every(s=>s.state==="PUBLISHED"&&s.archivedAt!==null)).toBe(true);
      expect(rows[0].archivedAt).toEqual(rows[1].archivedAt);
    }
  });
  it("conflicting publication racing an archive cannot double-book and can use released time",async()=>{
    for(let n=0;n<3;n++){
      const a=await owner(),b=await owner("enrollment"),t=await teacher();
      await service.saveLessonScheduleDraft(a,pair(t));await service.publishLessonSchedule(a);await service.saveLessonScheduleDraft(b,pair(t));
      const [archive,publish]=await Promise.allSettled([service.archiveLessonSchedule(a),service.publishLessonSchedule(b)]);
      expect(archive.status).toBe("fulfilled");
      if(publish.status==="rejected"){
        expect(publish.reason).toMatchObject({message:"Teacher recurring lesson conflict"});
        expect(await service.publishLessonSchedule(b)).toHaveLength(2);
      }
      expect(await db.courseLessonScheduleSlot.count({where:{teacherAdminId:t,state:"PUBLISHED",archivedAt:null}})).toBe(2);
      expect(await db.courseLessonScheduleSlot.count({where:{cohortId:a.id,archivedAt:null}})).toBe(0);
    }
  });
  it("a terminal-state transition racing archive does not strand teacher time",async()=>{
    const o=await owner();await service.saveLessonScheduleDraft(o,pair(await teacher()));await service.publishLessonSchedule(o);
    await Promise.all([db.courseCohort.update({where:{id:o.id},data:{status:"CANCELLED"}}),service.archiveLessonSchedule(o)]);
    expect((await db.courseCohort.findUniqueOrThrow({where:{id:o.id}})).status).toBe("CANCELLED");
    expect(await db.courseLessonScheduleSlot.count({where:{cohortId:o.id,archivedAt:null}})).toBe(0);
  });
  it("database validates GROUP owner and XOR even with existing parents",async()=>{
    const c=await db.courseCohort.create({data:{coursePlanId:"plan_beginner_one_to_one",code:randomUUID(),name:"Invalid local owner"}});
    await expect(tx(t=>t.courseLessonScheduleSlot.create({data:raw(c.id)}))).rejects.toThrow();
    const e=await owner("enrollment"),g=await owner();
    await expect(tx(t=>t.courseLessonScheduleSlot.create({data:raw(g.id,{enrollmentId:e.id})}))).rejects.toThrow();
  });
  it("published identity cannot change; all six foreign keys restrict deletion",async()=>{
    const o=await owner(),t=await teacher();await service.saveLessonScheduleDraft(o,pair(t));
    const rows=await service.publishLessonSchedule(o);
    await expect(tx(t=>t.courseLessonScheduleSlot.update({where:{id:rows[0].id},data:{localStartMinute:720}}))).rejects.toThrow();
    const keys=await db.$queryRaw<{del:string;upd:string}[]>`SELECT confdeltype::text del,confupdtype::text upd FROM pg_constraint WHERE conrelid='"CourseLessonScheduleSlot"'::regclass AND contype='f'`;
    expect(keys).toHaveLength(6);expect(keys.every(k=>k.del==="r"&&k.upd==="r")).toBe(true);
    await expect(db.admin.delete({where:{id:t}})).rejects.toThrow();
  });
  it("RLS denies direct untrusted reads and writes",async()=>{
    const [r]=await db.$queryRaw<{enabled:boolean;policies:bigint}[]>`SELECT relrowsecurity enabled,(SELECT count(*) FROM pg_policies WHERE tablename='CourseLessonScheduleSlot') policies FROM pg_class WHERE oid='"CourseLessonScheduleSlot"'::regclass`;
    expect(r.enabled).toBe(true);expect(Number(r.policies)).toBe(0);
    await db.$executeRawUnsafe('GRANT SELECT,INSERT ON "CourseLessonScheduleSlot" TO anon');
    await db.$transaction(async t=>{await t.$executeRawUnsafe('SET LOCAL ROLE anon');expect(await t.courseLessonScheduleSlot.count()).toBe(0);});
    const o=await owner();await expect(tx(async t=>{await t.$executeRawUnsafe('SET LOCAL ROLE anon');await t.courseLessonScheduleSlot.create({data:raw(o.id)});})).rejects.toThrow();
  });
});
