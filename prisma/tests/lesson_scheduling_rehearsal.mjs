// Local synthetic fixtures only. Never loads dotenv, backups, or production credentials.
// node prisma/tests/lesson_scheduling_rehearsal.mjs C:/Tools/PostgreSQL17/pgsql/bin
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, openSync, closeSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createHash } from 'node:crypto';
import pg from 'pg';

const root=process.cwd(), pgBin=process.argv[2];
assert(pgBin,'Explicit PostgreSQL bin path required');
const dir=mkdtempSync(path.join(tmpdir(),'academy-review-acceptance-'));
const data=path.join(dir,'data'), port=55439;
// Allowlist environment: do not inherit any credentials or service configuration.
const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','ComSpec','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA'].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
const url=name=>`postgresql://postgres@127.0.0.1:${port}/${name}`;
const config=path.join(dir,'prisma.config.mjs');
writeFileSync(config,`export default ${JSON.stringify({schema:path.join(root,'prisma/schema.prisma'),datasource:{url:url('scheduling')}})}`);
const bin=name=>path.join(pgBin,`${name}.exe`);
function run(exe,args,label,extra={}) {
  const log=path.join(dir,`${label}.log`),fd=openSync(log,'w');
  let r;try{r=spawnSync(exe,args,{cwd:root,env:{...env,...extra},stdio:['ignore',fd,fd],windowsHide:true,timeout:600000});}finally{closeSync(fd);}
  console.log(`${label}: ${r.status===0?'PASS':'FAIL'} (${log})`);
  if(r.status!==0){console.log(readFileSync(log,'utf8').slice(-18000));throw new Error(`${label} failed`);}
}
function prisma(args){return execFileSync(process.execPath,['node_modules/prisma/build/index.js',...args,'--config',config],{cwd:root,env,encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024});}
let started=false;
const server=net.createServer();
await new Promise((resolve,reject)=>server.once('error',reject).listen(port,'127.0.0.1',resolve));
await new Promise(resolve=>server.close(resolve));
const connect=async(name)=>{const c=new pg.Client({connectionString:url(name)});await c.connect();const r=(await c.query(`SELECT host(inet_server_addr()) host,inet_server_port() port,current_database() db,current_setting('data_directory') dir,current_setting('listen_addresses') listen,current_setting('server_version_num')::int version`)).rows[0];assert.equal(r.host,'127.0.0.1');assert.equal(r.port,port);assert.equal(r.db,name);assert.equal(r.listen,'127.0.0.1');assert.equal(realpathSync(r.dir),realpathSync(data));assert(r.version>=170000&&r.version<180000);return c;};
const migration=readFileSync('prisma/migrations/20261001120000_course_lesson_schedule_slots/migration.sql','utf8');
const snapshot=async c=>{
  const names=(await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'CourseLessonScheduleSlot' ORDER BY tablename`)).rows;
  const result={};for(const {tablename:t} of names){const {rows}=await c.query(`SELECT to_jsonb(t) value FROM "${t}" t ORDER BY to_jsonb(t)::text`);result[t]={count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}return result;
};
try {
  run(bin('initdb'),['-D',data,'-U','postgres','-A','trust','--encoding=UTF8','--locale=C','--no-sync'],'init');
  run(bin('pg_ctl'),['-D',data,'-l',path.join(dir,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start'],'start');started=true;
  let c=await connect('postgres');
  console.log(`ISOLATION VERIFIED: PostgreSQL17; 127.0.0.1:${port}; fresh data=${data}`);
  await c.query('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role');
  await c.query('CREATE DATABASE scheduling');await c.end();
  c=await connect('scheduling');
  // Missing historical baseline is not rewritten. Generate the committed pre-25
  // schema, then replay exact migrations 25-28 to obtain their SQL-only guards.
  const old=execFileSync('git',['show','530bf748916b15b61246d727ebd72633cef4c9bf^:prisma/schema.prisma'],{encoding:'utf8',env});
  const base=path.join(dir,'baseline24.prisma');writeFileSync(base,old);
  await c.query(prisma(['migrate','diff','--from-empty','--to-schema',base,'--script']));
  const migrations=readdirSync('prisma/migrations').filter(n=>/^\d/.test(n)).sort();assert.equal(migrations.length,29);
  for(const name of migrations.slice(24,28))await c.query(readFileSync(path.join('prisma/migrations',name,'migration.sql'),'utf8'));
  const schema28=await snapshot(c);
  await c.end();c=await connect('postgres');
  await c.query('CREATE DATABASE migration_fixture TEMPLATE scheduling');await c.end();c=await connect('scheduling');
  // Empty fresh replay of the new migration and transaction rollback rehearsal.
  await assert.rejects(c.query(migration.replace(/COMMIT;\s*$/,'SELECT 1/0; COMMIT;')),{code:'22012'});
  await c.query('ROLLBACK');assert.equal((await c.query(`SELECT to_regclass('public."CourseLessonScheduleSlot"') name`)).rows[0].name,null);
  assert.equal((await c.query(`SELECT count(*)::int n FROM pg_type WHERE typname='CourseLessonSlotState'`)).rows[0].n,0);
  assert.deepEqual(await snapshot(c),schema28);console.log('Late failure: all earlier scheduling DDL rolled back; business snapshot unchanged');
  await c.query(migration);assert.deepEqual(await snapshot(c),schema28);
  await c.end();
  // Template has no private production data, no business fixture, and migration29.
  c=await connect('postgres');
  for(const name of ['learner_compat','final_enrollment','course_review','course_outbox','monthly_billing','course_promotions'])await c.query(`CREATE DATABASE "${name}" TEMPLATE scheduling`);
  await c.end();
  c=await connect('migration_fixture');
  await c.query(readFileSync('prisma/tests/course_schema_foundation_legacy_fixture.sql','utf8').replace(/^\\set.*$/mg,''));
  await c.query(`INSERT INTO "CourseCohort" (id,"coursePlanId",code,name,status,"weeklyDay","localStartTime","durationMinutes","timeZone","courseStartDate","updatedAt") VALUES
    ('fixture-group','plan_beginner_group','FIXTURE','Synthetic local cohort','OPEN','SATURDAY','10:00',60,'America/Chicago','2026-10-03',now());
    INSERT INTO "CourseCohortSeat" (id,"cohortId",position,"updatedAt") SELECT 'fixture-seat-'||n,'fixture-group',n,now() FROM generate_series(1,4) n;`);
  await c.query(`
    INSERT INTO "Customer" (id,"supabaseUserId",email,"emailNormalized","emailVerifiedAt","emailSyncedAt","updatedAt") VALUES
      ('fixture-customer','11111111-1111-4111-8111-111111111101','local@example.invalid','local@example.invalid',now(),now(),now()),
      ('fixture-other','11111111-1111-4111-8111-111111111102','other@example.invalid','other@example.invalid',now(),now(),now());
    INSERT INTO "StudentProfile" (id,"supabaseUserId","fullName","updatedAt") VALUES ('fixture-student','11111111-1111-4111-8111-111111111101','Synthetic local learner',now());
    INSERT INTO "CustomerStudentRelation" (id,"customerId","studentId",type,"updatedAt") VALUES ('fixture-self','fixture-customer','fixture-student','SELF',now());
    INSERT INTO "CourseApplication" (id,"fullName",email,status,"customerId","studentProfileId","requestedPlanId","updatedAt") VALUES
      ('fixture-application','Synthetic local applicant','local@example.invalid','APPROVED','fixture-customer','fixture-student','plan_beginner_group',now()),
      ('fixture-other-application','Other local applicant','other@example.invalid','PENDING',NULL,NULL,NULL,now());
    INSERT INTO "CourseEnrollment" (id,"studentId","customerId","coursePlanId","applicationId","cohortId","levelSnapshot","formatSnapshot","planCodeSnapshot","billingTimeZone","updatedAt") VALUES
      ('fixture-enrollment','fixture-student','fixture-customer','plan_beginner_group','fixture-application','fixture-group','BEGINNER','GROUP','BEGINNER_GROUP','America/Chicago',now());
    UPDATE "CourseCohortSeat" SET "currentEnrollmentId"='fixture-enrollment',"assignedAt"=now(),"reservedUntil"=now()+interval '7 days' WHERE id='fixture-seat-1';
    INSERT INTO "CoursePayment" (id,"enrollmentId",kind,"periodStart","periodEnd","expiresAt",status,"baseAmountCents","finalAmountCents","updatedAt") VALUES
      ('fixture-payment','fixture-enrollment','INITIAL_ENROLLMENT','2026-10-03','2026-11-03',now()+interval '7 days','PROOF_SUBMITTED',5000,5000,now());
    INSERT INTO "CoursePaymentSubmission" (id,"paymentId","attemptNumber",method,"amountSentCents","proofStoragePath","mimeType","fileSizeBytes","updatedAt") VALUES
      ('fixture-proof','fixture-payment',1,'ZELLE',5000,'local-only/no-storage-object.png','image/png',10,now());
    INSERT INTO "CoursePaymentNotification" (id,"paymentId","submissionId",kind,"deduplicationKey",status,"recipientEmailSnapshot","subjectSnapshot","htmlSnapshot","updatedAt") VALUES
      ('fixture-required','fixture-payment',NULL,'PAYMENT_REQUIRED','PAYMENT','CANCELLED','local@example.invalid','Local only','Local only',now()),
      ('fixture-received','fixture-payment','fixture-proof','PROOF_RECEIVED','SUBMISSION:fixture-proof','CANCELLED','local@example.invalid','Local only','Local only',now());
  `);
  const before=await snapshot(c);
  await c.query(migration);assert.deepEqual(await snapshot(c),before);
  console.log('Migration28 -> 29 synthetic preservation counts: '+JSON.stringify(Object.fromEntries(Object.entries(before).map(([t,v])=>[t,v.count]))));
  const backfill=migration.split('-- BEGIN LEGACY BACKFILL')[1].split('-- END LEGACY BACKFILL')[0];
  for(let i=0;i<2;i++)await c.query(`BEGIN ISOLATION LEVEL SERIALIZABLE;${backfill}COMMIT;`);
  const s=(await c.query(`SELECT ordinal,state,"teacherAdminId","localStartMinute","timeZone" FROM "CourseLessonScheduleSlot"`)).rows;
  assert.deepEqual(s,[{ordinal:1,state:'LEGACY',teacherAdminId:null,localStartMinute:600,timeZone:'America/Chicago'}]);assert.deepEqual(await snapshot(c),before);
  await c.query(`UPDATE "CourseCohort" SET "durationMinutes"=75 WHERE id='fixture-group'`);
  await assert.rejects(c.query(`BEGIN ISOLATION LEVEL SERIALIZABLE;${backfill}COMMIT;`));await c.query('ROLLBACK');
  assert.equal((await c.query(`SELECT "durationMinutes" FROM "CourseLessonScheduleSlot"`)).rows[0].durationMinutes,60);
  console.log('LEGACY backfill exact replay/no inference/preservation/mismatch refusal: PASS');await c.end();
  run(process.execPath,['node_modules/prisma/build/index.js','format','--config',config],'format');
  run(process.execPath,['node_modules/prisma/build/index.js','validate','--config',config],'validate');
  run(process.execPath,['node_modules/prisma/build/index.js','generate','--config',config],'generate');
  const testEnv={COURSE_SCHEDULING_TEST_DATABASE_URL:url('scheduling'),COURSE_SCHEDULING_TEST_DATA_DIRECTORY:data,
    COURSE_PREPARATION_TEST_DATABASE_URL:url('learner_compat'),COURSE_FINAL_ENROLLMENT_TEST_DATABASE_URL:url('final_enrollment'),
    COURSE_REVIEW_TEST_DATABASE_URL:url('course_review'),COURSE_REVIEW_TEST_DATA_DIRECTORY:data,COURSE_OUTBOX_TEST_DATABASE_URL:url('course_outbox'),
    MONTHLY_BILLING_TEST_DATABASE_URL:url('monthly_billing'),COURSE_PROMOTION_TEST_DATABASE_URL:url('course_promotions')};
  run(process.execPath,['node_modules/vitest/vitest.mjs','run','src/lib/courses/lesson-schedule-rules.test.ts','src/lib/courses/lesson-schedules-database.test.ts'],'scheduling-tests',testEnv);
  run(process.execPath,['node_modules/vitest/vitest.mjs','run'],'full-tests',testEnv);
  const drift=prisma(['migrate','diff','--from-config-datasource','--to-schema','prisma/schema.prisma','--script']);
  assert(!/^(ALTER|CREATE|DROP)/m.test(drift),`Unexpected Prisma drift: ${drift}`);console.log('Prisma-managed schema drift: PASS (SQL-only triggers/checks reviewed separately)');
} finally {
  if(started)run(bin('pg_ctl'),['-D',data,'-m','fast','-w','stop'],'stop');
  console.log(`Local rehearsal evidence: ${dir}`);
}
