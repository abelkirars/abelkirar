# Phase 2C.1A — learner identity compatibility

Local implementation and restored-database rehearsal completed. No production
connection, production migration, deployment, or environment edit was performed.
The final review authorizes one local checkpoint containing this report, migration,
compatible code, and tests; it does not authorize production application.

## A. Inspection findings

| Category | Paths/behavior | Result |
| --- | --- | --- |
| A — authenticated learner only | Student DAL, login, password setup, protected student APIs, locale sync | Supabase user ID remains authoritative. No email authentication fallback. |
| A/D — account operations | Invitations, resend, recovery, email correction, Auth deletion | Added null-identity guards; loginless learners receive no account links. |
| B — optional learner contact | StudentProfile.email and session payload | Nullable; never filled from Customer, guardian, application, or Auth email. |
| C/D — admin display/edit | Student list/detail and StudentForm | Explicit login status, nullable email display, safe edits/deactivation without email/date. |
| D — application history | CourseApplication.studentProfileId | Confirmed lifetime unique index; replaced with an ordinary index. |

Notification functions continue requiring explicit string recipients; guarded
callers prevent loginless learners entering invitation/recovery delivery.
Existing student creation remains the separate email-required invitation flow.
It does not provision guardian-managed learners or substitute guardian data.

## B–G. Identity, authorization, workflows, and Prisma

- StudentProfile.supabaseUserId and email are now `String? @unique`.
- Both-null and either-null profiles are supported; non-null uniqueness remains.
- DAL requires the profile's non-null ID to equal the authenticated Supabase ID.
- Contact email may be null even for an ID-linked authenticated learner.
- Legacy portalAccess fallback and enrollment-based portal authorization remain unchanged.
- Password setup rejects null/mismatched IDs; setup/recovery reject archived profiles.
- Resend requires learner ID and email; email correction requires an existing learner login.
- Account deletion skips Supabase when no login exists. Customer/application/enrollment
  history blocks the existing hard-delete route before external deletion begins.
- Admin lists/details distinguish LOGIN ENABLED from NO LEARNER LOGIN. Activation,
  invitations, and account-email correction are not shown for loginless learners.
- The UI review skill guided explicit text states and wrapping badges, not color-only states.
- `StudentProfile.courseApplications` is now a collection. The old unique index was
  introduced in `20260826120000_add_course_applications/migration.sql`.
- CourseEnrollment.applicationId uniqueness and all FK/referential actions are unchanged.

## H–I. Migration and safety

New migration: `20260922150000_learner_identity_compatibility`.

One transaction drops NOT NULL on two identity columns, drops only
`CourseApplication_studentProfileId_key`, and creates
`CourseApplication_studentProfileId_idx`. A five-second lock timeout bounds lock
acquisition. No row updates/deletes, backfill, identity linking, or business inserts.
No old migrations were edited.

Rehearsal used PostgreSQL 17 on 127.0.0.1 with an ephemeral port and unique temporary
cluster, restoring the verified pre-Phase-1 public backup using --no-owner --no-acl.
The unchanged Phase 1 SQL and its LOCAL history fixture established the 25-migration
checkpoint; Prisma 7.8.0 then applied only the new migration. Local status confirmed
26 applied and no unfinished entries. The cluster was stopped afterward.

Harness-only setup failures were corrected before the successful run: the dump
creates public, inet address formatting included /32, and CoursePrice has no id
column. None was a migration failure; each prior disposable cluster was stopped.

## J. Exact files changed

Modified:

- prisma/schema.prisma
- src/lib/student/dal.ts
- src/lib/student/dal.test.ts
- src/app/api/student/forgot-password/route.ts
- src/app/api/student/forgot-password/route.test.ts
- src/app/api/student/set-password/route.ts
- src/app/api/student/set-password/route.test.ts
- src/app/api/admin/students/[studentId]/route.ts
- src/app/api/admin/students/[studentId]/route.test.ts
- src/app/api/admin/students/[studentId]/email/route.ts
- src/app/api/admin/students/[studentId]/email/route.test.ts
- src/app/api/admin/students/[studentId]/resend-invite/route.ts
- src/app/admin/(authenticated)/students/page.tsx
- src/app/admin/(authenticated)/students/[studentId]/page.tsx
- src/components/admin/student-form.tsx

Added:

- prisma/migrations/20260922150000_learner_identity_compatibility/migration.sql
- prisma/tests/learner_identity_rehearsal.mjs
- src/app/api/admin/students/[studentId]/resend-invite/route.test.ts
- src/components/admin/student-form.test.ts
- docs/PHASE_2C_1A_LEARNER_IDENTITY_REPORT.md

## K–L. Tests and existing-student regression

- Prisma validate and client generation: passed (7.8.0).
- Final focused student API/DAL/admin/form compatibility run: 118 tests / 18 files passed.
- Final complete Vitest suite: 649 tests / 72 files passed.
- TypeScript, changed-file ESLint, rehearsal-script lint/syntax, diff whitespace: passed.
- Local PostgreSQL tests: both/either identity null; multiple nulls allowed; duplicate
  non-null email and Auth IDs rejected (23505); two historical applications accepted.
- Final repeated restored-database run also verified nullable application learner links
  and rejection of nonexistent learner links (23503). Application snapshots were unchanged.
- Prisma status on the restored 25-migration checkpoint identified the compatibility
  migration as pending; migration-name comparison confirmed it was the sole pending
  migration and immediately followed the Phase 1 foundation. Production was not queried.
- Ordinary application index and retained identity/enrollment unique indexes verified.
- All foreign-key definitions unchanged across compatibility migration.
- Full-row hashes unchanged for Order, PaymentConfirmation, StudentProfile,
  CourseApplication, CoursePrice. Counts remained 34 / 9 / 1 / 2 / 3.
- Existing identity values and CoursePrice discounts preserved, not merely counts.
- Customer, relation, enrollment, payment, submission, and portal-access tables remained empty.
- Test inserts rolled back. Original authenticated learner and portal guard tests pass.
- No known test regressions. Existing Vite tsconfig-paths advisory is non-fatal.

## M. Risks / open items

- Production migration requires separate approval and a current backup. ALTER TABLE
  needs a brief exclusive lock; normal index creation can block application writes
  while it runs. Timeout failure must be reviewed, not automatically repaired.
- Deploy compatible code before enabling creation of null-identity learners; old
  deployed code still assumes learner-owned accounts. No such creation UI was added.
- The existing one-open-application-per-normalized-email rule is unchanged and must
  be reviewed separately if future guardian workflows allow simultaneous sibling applications.
- Existing hard deletion remains only for learners without linked course/customer
  history. It is not a new archival workflow or a redesign of cross-system deletion.
- UI rendering was tested server-side; no live browser or production login was exercised.
- Private stopped clusters/logs containing restored data remain under the OS temporary
  directory, outside the repository; treat them as confidential backup material.
- No build was run because the project build script includes migrate deploy.

## N–O. Checkpoint and readiness

20 scoped files (15 modified, 5 new) reviewed for one checkpoint. Every file belongs
to learner identity, authentication/account compatibility, null-safe admin handling,
application history, or migration/tests/documentation. No unrelated changes found.
No secrets, environment files, certificates, backups, temporary PostgreSQL files,
or diagnostic logs are included in the checkpoint.

Exact migration operations reviewed: BEGIN; SET LOCAL lock_timeout = '5s';
ALTER TABLE StudentProfile DROP NOT NULL on supabaseUserId and email; DROP INDEX
CourseApplication_studentProfileId_key; CREATE non-unique INDEX
CourseApplication_studentProfileId_idx; COMMIT. Both identity UNIQUE indexes stay
intact. No DROP TABLE, DELETE, TRUNCATE, UPDATE, business INSERT, or unrelated DDL.

Security review confirmed all protected student endpoints originate from Supabase
authentication and the authoritative ID lookup. No guardian/customer/application
email, URL parameter, or submitted student ID is an authentication fallback.
Null-ID profiles cannot receive invitation/recovery links or trigger Auth account
correction/deletion. Existing learner fixture values are hash-identical; original
login/portal behavior is covered by passing tests, not a live production login.

READY FOR PRODUCTION MIGRATION REVIEW: YES.

This is readiness for review, not authorization to migrate or deploy. Stop here.
