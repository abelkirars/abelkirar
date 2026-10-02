# Scheduling foundation — local implementation, not deployed

Baseline: `df2e491a4a1ff893f5f05c08a6d086f48980e9bd`.
Migration: `20261001120000_course_lesson_schedule_slots` (29).
Production application, database, SiteCopy, scheduler and credentials are out of scope.

## Representation and publication

`CourseLessonScheduleSlot` has exactly one cohort or private enrollment owner.
Current ordinals are 1 and 2. A single LEGACY slot is an unpublished snapshot;
zero, one or two drafts are not teacher commitments. Publication requires exactly
two different weekdays, one explicit active Admin teacher, America/Chicago, and
identical inclusive effective-date windows. No teacher or second slot is inferred.
All six foreign keys use RESTRICT for deletion and key updates. Slot deletion is
rejected; historical rows are archived. Published coordinates cannot be edited.
No rescheduling/archival UI or automatic reservation release is introduced here.
`archiveLessonSchedule` is an explicit admin-only server operation that archives
all current LEGACY, DRAFT or PUBLISHED slots for a valid owner, including cancelled,
completed and archived owners. Published pairs archive together in one Serializable
transaction. Historical coordinates/publication metadata remain intact; the actor
and archive timestamp are recorded. Repeating it returns archivedCount 0 and no
new timestamp. It changes no payments, access, seats or owner lifecycle fields.

The admin DAL authenticates every read/write. Customer/student readers derive
identity from existing authenticated DALs, filter the enrollment owner, and return
only schedule information. The student reader additionally requires ACTIVE plus
ENABLED access. Schedule publication does not grant access. No route/UI exposes
these new write services yet.

## Concurrency and conflict integrity

Service transactions use the existing bounded Serializable retry helper (three
attempts). Owner rows are locked before the explicit teacher; competing published
commitments are read inside the transaction. Database writes to slots also require
Serializable, so direct privileged writes cannot silently use weaker isolation.
Row-level guards lock/validate parents and teacher. A deferred constraint trigger
validates the final pair and teacher conflicts. PostgreSQL SSI rejects stale
predicate-read races; callers must retry the entire transaction, never a statement.

Conflicts require the same teacher and weekday, overlapping half-open local time
intervals, and an effective-date intersection containing that weekday. Adjacent
lessons and intersecting date windows without that weekday do not conflict.
Operational conflicts are between Chicago schedules. Unresolved current LEGACY
rows prevent only their own owner's publication until explicitly configured or
archived. They do not block unrelated owners or infer teacher commitments.
Archive uses the same owner-before-teacher lock order as publication and permits
inactive teachers to be released. Terminal-state changes never automatically
archive schedules; cancellation/completion workflows may call it deliberately later.
Unrecorded/off-platform private commitments still require teacher confirmation.

Parent guards prevent changes that invalidate existing slot owner formats,
deactivation of an actively scheduled teacher, and legacy schedule edits while a
new published timetable exists. They do not rewrite parent business rows.

## Civil time and DST

Recurrences remain weekday plus local minutes, never fixed UTC offsets or billing
timezones. `lessonOccurrence` resolves an actual date using Temporal with
`disambiguation: reject` at both endpoints. Ambiguous/nonexistent occurrences fail
closed; there is no blanket Sunday restriction and no scheduler generating them.
Duration is the local timetable interval. Any future occurrence/calendar consumer
must handle a rejected occurrence explicitly, not silently shift it.

## Backfill and compatibility

Migration 29 runs in one Serializable transaction. Complete, representable GROUP
cohorts get deterministic `legacy-cohort:<id>:slot-1` rows only. Missing/invalid
schedules are not guessed. Terminal/archived cohorts retain archived snapshots.
An exact backfill replay is a no-op; mismatched values or an administrator's
current ordinal cause failure, not overwrite. The initial migration is not itself
rerunnable DDL; only the marked backfill block has idempotent semantics.

Published pairs take precedence in the new transition readers. Otherwise the
current legacy cohort fields remain the fallback, explicitly INCOMPLETE for the
new offer. An explicit admin draft save archives a LEGACY snapshot rather than
destroying it. Existing UI/billing readers are not switched in this phase.
No existing timetable, billing timezone, price, seat, payment, access, practice,
outbox or public copy is changed by migration/backfill.

## Local verification

Run `node prisma/tests/lesson_scheduling_rehearsal.mjs <PostgreSQL17-bin>`.
It requires free port 55439, starts a fresh temporary cluster listening only on
127.0.0.1, and verifies the actual server address, database, version, listen address
and data directory before fixture writes. It stops the cluster in `finally`.
It never loads dotenv, reads a production backup or inherits service credentials.
Auth/storage/delivery in the existing integration suites remain mocked.

The historical chain lacks its initial baseline. The harness reconstructs the
committed pre-25 Prisma schema, replays unchanged migrations 25–28, then rehearses
29 both empty and with synthetic legacy/business fixtures. This is **not** a claim
that historical migrations 1–28 can replay into an empty database. No historical
migration is edited or production history repaired. Prisma drift covers managed
objects; SQL-only checks, partial indexes, triggers and RLS have separate tests.

The build harness copies tracked/authorized source into a credential-free temp
directory and uses loopback placeholder services, `prisma generate`, then the
normal `next build`. It never runs migrate deploy. An existing harness-created
build directory may be passed to reuse copied dependencies. System CA trust is
enabled only for that child process; certificate verification is never disabled.

## Required later approvals

- Review implementation and all validation evidence before any commit/deployment.
- Explicit production teacher confirmation; the sole Admin is not auto-selected.
- Explicit second, different weekday and publication decision for each offering.
- Keep the synthetic acceptance cohort unpublished unless separately authorized.
- Separately approved inventory/backup and production migration gate.
- Later UI integration and marketing cutover, including the three production
  SiteCopy duration overrides still saying “3 lessons per week”.
- Guided-practice delivery/week semantics and future loginless/guardian support
  remain separate decisions; WeeklyPractice is unchanged.

## Phase 2 local admin and student integration

Migration 29 is already applied. Phase 2 needs no schema or migration change.
The implementation remains local/uncommitted until separately approved.

- `/admin/lesson-schedules` lists GROUP cohorts and private ONE_TO_ONE enrollments
  (bounded to 50 of each, with search). Cohort and payment detail pages link to
  `/admin/lesson-schedules/{cohort|enrollment}/{id}`. Terminal owners remain
  reachable for explicit archival; private learners never receive fake cohorts.
- Page DAL plus active-admin service authorization protects all operations. The
  JSON POST endpoint uses the existing save/publish/archive services, rejects
  cross-origin browser requests, and never returns raw database error details.
- Active teachers are options, not defaults. A LEGACY row never infers a teacher
  or Lesson 2. Its original schedule remains visible as historical context.
- A draft now accepts one or two complete slots. Saving without a previously
  drafted slot archives that omitted slot. Replacing LEGACY preserves its history.
  Publication still requires the unchanged reviewed two-slot validator and
  transaction, different weekdays, active teacher, Chicago civil time and no
  conflict. Drafts do not reserve teacher time. Published schedules must be
  explicitly archived before replacement. The reviewed archive transaction,
  terminal-owner support, locking and retries are unchanged.
- Native required inputs, labelled controls, immediate same-day feedback,
  responsive sections, a synchronous in-flight guard and explicit archive
  confirmation support keyboard/mobile use. Unsaved edits cannot be published.
  Durations remain configurable per slot; suggestions do not replace saved values.
- `/student/dashboard#my-lessons` derives identity from the existing student DAL,
  then reads only that learner's ACTIVE, unarchived enrollments with ENABLED
  unarchived portal access. Existing schedule readers recheck ownership. Only
  PUBLISHED pairs are displayed; expired/archived/legacy/draft schedules are not
  confirmed lessons. Future windows are explicitly upcoming. No client-selected
  learner/customer identity, email matching, or guardian-to-learner substitution
  exists. Loginless learners still need the separately designed login workflow.
- Recurring times use minutes and Temporal PlainTime/PlainDate for display,
  explicitly Central Time / America/Chicago. No fixed offset, billing timezone,
  inferred student timezone or dated session is introduced. Existing DST-safe
  occurrence utilities remain unchanged. End dates are inclusive.
- Guided practice links to the existing authorized `weekly-practice` section and
  is explicitly asynchronous, not a third live lesson or calendar reservation.

### Legacy reader/writer inventory and content cutover

`cohorts.ts` and `cohort-forms.tsx` retain the original intake schedule writer and
OPEN validation. Cohort detail now labels that form as intake/reference only.
`prepare-enrollment.ts`, `prepare-enrollment-form.tsx`, cohort lists, payment detail,
`customer/account.ts`, and `course-payment-access.ts` retain compatibility reads;
customer account/payment displays explicitly distinguish the old cohort reference
from the published timetable. They do not modify billing anchors or financial
snapshots. New student lesson display uses CourseLessonScheduleSlot exclusively.

Repository `messages/en.json` and `messages/am.json` beginner schedule defaults
previously promised three lessons; both now say two live lessons plus guided
practice. New scheduling copy is translated in both languages. `i18n/request.ts`
merges SiteCopy overrides over defaults, so repository copy cannot correct live
database overrides. The prior authorized inspection identified these English
production keys (not re-queried or changed in this local phase):

- `courseDetails.beginner.duration`: `~3 months · 3 lessons per week · no prior experience needed`
- `courseDetails.intermediate.duration`: `~4 months · 3 lessons per week · Beginner level required`
- `courseDetails.advanced.duration`: `Mastery-based · 3 lessons per week · Intermediate level required`

Their marketing cutover needs a separate read-only refresh and explicit content
authorization. Public promises must not imply LEGACY/draft timetables are live.
No production teacher, second slot, publication, SiteCopy or financial state is
changed by this local implementation.

### Phase 2 verification

Focused tests cover editor submission/duplicate prevention, safe errors, EN/AM
student presentation, civil-time input, admin API authorization and strict command
validation. Disposable PostgreSQL tests exercise one-slot drafts, draft removal,
legacy history, terminal archive, active-teacher options, group/private learner
isolation, suspended/pending/expired visibility and unrelated business fingerprints.
Existing publication/archive races and financial/access/seat regression suites
remain authoritative. Test files sharing the disposable cluster are run with one
file worker; intentional Promise.all transaction races remain concurrent.
