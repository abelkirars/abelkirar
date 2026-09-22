// Explicit, disposable LOCAL PostgreSQL 17 rehearsal. Never loads dotenv.
// Usage: node prisma/tests/learner_identity_rehearsal.mjs <pg-bin> <backup.dump>
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';

const [pgBin, backup] = process.argv.slice(2);
assert(pgBin && backup, 'Explicit PostgreSQL bin directory and backup required');
const root = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), 'abel-learner-compat-'));
const data = path.join(dir, 'data');
const server = net.createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const url = `postgresql://postgres@127.0.0.1:${port}/learner_compat`;
assert.equal(new URL(url).hostname, '127.0.0.1');
const env = { ...process.env, DIRECT_URL: url, DATABASE_URL: url, PGHOST: '127.0.0.1', PGPORT: String(port), PGUSER: 'postgres', PGDATABASE: 'learner_compat', PGSSLMODE: 'disable' };
for (const key of ['PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS']) delete env[key];
let started = false;
let client;
function run(executable, args, label) {
  // Private local output may contain restored data. Never print it to the console.
  // File descriptors avoid Windows child servers keeping captured pipes open.
  const log = openSync(path.join(dir, `${label}.log`), 'w');
  let result;
  try {
    result = spawnSync(executable, args, { cwd: root, env, stdio: ['ignore', log, log], windowsHide: true, timeout: 120000 });
  } finally {
    closeSync(log);
  }
  assert(!result.error, `${label} could not complete; inspect private rehearsal log`);
  assert.equal(result.status, 0, `${label} failed; inspect private rehearsal log (no retry)`);
  console.log(`${label}: PASS`);
}
const bin = name => path.join(pgBin, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
const migration = '20260922150000_learner_identity_compatibility';
const tables = ['Order', 'PaymentConfirmation', 'StudentProfile', 'CourseApplication', 'CoursePrice'];
async function snapshot() {
  const result = {};
  for (const table of tables) {
    const { rows } = await client.query(`SELECT to_jsonb(t) AS value FROM "${table}" t ORDER BY to_jsonb(t)::text`);
    result[table] = { count: rows.length, hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex') };
  }
  return result;
}
try {
  run(bin('initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C', '--no-sync'], 'init');
  run(bin('pg_ctl'), ['-D', data, '-l', path.join(dir, 'server.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], 'start');
  started = true;
  run(bin('createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'learner_compat'], 'create');
  client = new pg.Client({ connectionString: url });
  await client.connect();
  assert.equal((await client.query('SELECT host(inet_server_addr()) AS host')).rows[0].host, '127.0.0.1');
  // The dump itself creates public. Remove only the empty default schema in
  // this newly created disposable database; never use CASCADE or restore --clean.
  await client.query('DROP SCHEMA public');
  // Public-schema backup can reference Supabase roles. These exist only here.
  await client.query('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  run(bin('pg_restore'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'learner_compat', '--no-owner', '--no-acl', '--exit-on-error', backup], 'restore');
  const initial = await snapshot();
  assert.deepEqual(tables.map(t => initial[t].count), [34, 9, 1, 2, 3]);
  const history = await client.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
  assert.equal(history.rowCount, 24);
  assert(!history.rows.some(r => r.migration_name === migration));
  // Bring the backup to the actual Phase 1 checkpoint before testing compatibility.
  const phase1 = '20260921150000_course_schema_foundation';
  const phase1sql = readFileSync(path.join(root, 'prisma/migrations', phase1, 'migration.sql'), 'utf8');
  await client.query(phase1sql);
  const phase1state = await snapshot();
  const foreignKeysBefore = (await client.query(`SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' ORDER BY conname`)).rows;
  for (const table of tables.filter(t => t !== 'StudentProfile' && t !== 'CourseApplication' && t !== 'Order')) {
    assert.deepEqual(phase1state[table], initial[table]);
  }
  // The exact Phase 1 SQL added nullable fields, so compare compatibility from here.
  await client.query('INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count) VALUES ($1,$2,$3,now(),now(),1)', [randomUUID(), createHash('sha256').update(phase1sql).digest('hex'), phase1]);
  const migrationNames = readdirSync(path.join(root, 'prisma/migrations')).filter(n => /^\d/.test(n)).sort();
  assert.equal(migrationNames.length, 26);
  assert.deepEqual(migrationNames.slice(-2), [phase1, migration]);
  const appliedNames = new Set([...history.rows.map(r => r.migration_name), phase1]);
  assert.deepEqual(migrationNames.filter(n => !appliedNames.has(n)), [migration]);
  // migrate status exits 1 for a pending migration. Verify that exact result,
  // on the restored production-shaped checkpoint, without contacting production.
  const pending = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'status'], { cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  assert.equal(pending.status, 1);
  assert(`${pending.stdout}${pending.stderr}`.includes(migration));
  console.log('Pre-migration: 25 completed migrations; counts 34/9/1/2/3');
  assert.equal(new URL(env.DIRECT_URL).hostname, '127.0.0.1');
  console.log('Prisma target explicitly verified: 127.0.0.1 (disposable only)');
  run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], 'compatibility-deploy');
  assert.deepEqual(await snapshot(), phase1state, 'Every legacy field must remain identical');
  assert.deepEqual((await client.query(`SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' ORDER BY conname`)).rows, foreignKeysBefore);
  const indexRows = (await client.query(`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public'`)).rows;
  for (const name of ['StudentProfile_email_key', 'StudentProfile_supabaseUserId_key', 'CourseEnrollment_applicationId_key']) {
    assert(indexRows.some(r => r.indexname === name && r.indexdef.includes('UNIQUE')));
  }
  assert(!indexRows.some(r => r.indexname === 'CourseApplication_studentProfileId_key'));
  assert(indexRows.some(r => r.indexname === 'CourseApplication_studentProfileId_idx' && !r.indexdef.includes('UNIQUE')));
  for (const table of ['Customer','CustomerStudentRelation','CourseEnrollment','CoursePayment','CoursePaymentSubmission','CoursePortalAccess']) {
    assert.equal((await client.query(`SELECT count(*)::int AS n FROM "${table}"`)).rows[0].n, 0);
  }
  const after = await client.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
  assert.equal(after.rowCount, 26);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL')).rows[0].n, 0);
  const columns = await client.query(`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='StudentProfile' AND column_name IN ('email','supabaseUserId')`);
  assert.equal(columns.rowCount, 2);
  assert(columns.rows.every(r => r.is_nullable === 'YES'));
  await client.query('BEGIN');
  async function insert(id, auth, email) {
    await client.query('INSERT INTO "StudentProfile" (id,"fullName","supabaseUserId",email,"updatedAt") VALUES ($1,$1,$2,$3,now())', [id, auth, email]);
  }
  await insert('compat-null-a', null, null);
  await insert('compat-null-b', null, null);
  await insert('compat-contact', null, 'learner@example.invalid');
  await insert('compat-login', 'compat-auth', null);
  async function duplicate(id, auth, email) {
    await client.query('SAVEPOINT duplicate_test');
    let code;
    try { await insert(id, auth, email); } catch (error) { code = error.code; }
    await client.query('ROLLBACK TO SAVEPOINT duplicate_test');
    assert.equal(code, '23505');
  }
  await duplicate('compat-dup-auth', 'compat-auth', null);
  await duplicate('compat-dup-email', null, 'learner@example.invalid');
  await client.query(`INSERT INTO "CourseApplication" (id,"fullName",email,status,"studentProfileId","updatedAt") VALUES
    ('compat-app-a','Test','test@example.invalid','APPROVED','compat-null-a',now()),
    ('compat-app-b','Test','test@example.invalid','DECLINED','compat-null-a',now())`);
  assert.equal((await client.query(`SELECT count(*)::int AS n FROM "CourseApplication" WHERE "studentProfileId"='compat-null-a'`)).rows[0].n, 2);
  await client.query(`INSERT INTO "CourseApplication" (id,"fullName",email,status,"studentProfileId","updatedAt") VALUES ('compat-app-null','Test','null@example.invalid','DECLINED',NULL,now())`);
  assert.equal((await client.query(`SELECT "studentProfileId" FROM "CourseApplication" WHERE id='compat-app-null'`)).rows[0].studentProfileId, null);
  await client.query('SAVEPOINT invalid_learner');
  let fkCode;
  try {
    await client.query(`INSERT INTO "CourseApplication" (id,"fullName",email,status,"studentProfileId","updatedAt") VALUES ('compat-app-invalid','Test','invalid@example.invalid','DECLINED','missing-learner',now())`);
  } catch (error) { fkCode = error.code; }
  await client.query('ROLLBACK TO SAVEPOINT invalid_learner');
  assert.equal(fkCode, '23503', 'Application FK must reject a nonexistent learner');
  await client.query('ROLLBACK');
  assert.deepEqual(await snapshot(), phase1state);
  run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'status'], 'status');
  console.log('PASS: nullable identities, non-null uniqueness (23505), multiple applications, null application FK, invalid application FK rejected (23503), all legacy rows/values preserved; fixture writes rolled back');
  console.log(`Private rehearsal directory (contains restored data; not in Git): ${dir}`);
} finally {
  if (client) await client.end();
  if (started) run(bin('pg_ctl'), ['-D', data, '-m', 'fast', '-w', 'stop'], 'stop');
}
