# Phase 2C.1 preparation completion report

Date: 2026-09-22. Local implementation only; not committed or deployed.

## A. Inspection

Started at `f9def692dc5e76b5876f73ec7b91d69130a7559e` with a clean worktree. The committed learner-identity compatibility migration and schema were present. Phase 2A Customer resolution and Phase 2B application review were preserved. Production migration state was supplied by the user, not re-queried during this phase.

## B. Files changed

Modified:

- `src/lib/customer/dal.ts`
- `src/app/admin/(authenticated)/layout.tsx`
- `src/app/admin/(authenticated)/course-applications/[id]/page.tsx`

Added:

- `src/app/admin/(authenticated)/course-applications/[id]/prepare/page.tsx`
- `src/app/admin/(authenticated)/course-cohorts/page.tsx`
- `src/app/admin/(authenticated)/course-cohorts/[id]/page.tsx`
- `src/app/api/admin/course-applications/[id]/prepare/route.ts`
- `src/app/api/admin/course-cohorts/route.ts`
- `src/app/api/admin/course-cohorts/route.test.ts`
- `src/app/api/admin/course-cohorts/[id]/route.ts`
- `src/components/admin/cohort-forms.tsx`
- `src/components/admin/prepare-enrollment-form.tsx`
- `src/components/admin/prepare-enrollment-form.test.ts`
- `src/lib/courses/admin-response.ts`
- `src/lib/courses/admin-service.ts`
- `src/lib/courses/cohorts.ts`
- `src/lib/courses/preparation-rules.ts`
- `src/lib/courses/preparation-rules.test.ts`
- `src/lib/courses/prepare-enrollment.ts`
- `src/lib/courses/preparation-services.test.ts`
- `src/lib/courses/preparation-database.test.ts`
- `docs/PHASE_2C_1_PREPARATION_REPORT.md`

## C. Identity preparation

An admin supplies the authoritative Supabase account ID. The server obtains that user through the server-only Supabase admin client and requires verified email. Customer upsert reuses the Phase 2A identity rules, now extracted into a transaction-compatible helper. No email-based identity matching is performed. Application identity links are audited through an application event when changed.

## D. SELF/GUARDIAN handling

Relationship and existing/new learner selection are explicit. Existing learners resolve by StudentProfile ID. SELF requires the learner's verified account identity. New GUARDIAN learners have null Supabase identity and email, with portal access false. Existing relationships are checked for contradictions and active state. New relationship persistence is deliberately deferred to the final enrollment transaction; preparation returns that boundary explicitly.

## E. Cohort management

Added admin list, create and detail screens, DRAFT schedule configuration, and validated DRAFT-to-OPEN transition. Only active GROUP plans are accepted. Schedule requires explicit IANA timezone, weekly day, local time, duration and start date, with optional end date. OPEN schedules are not editable through this phase's endpoint.

## F. Four-seat enforcement

Cohort creation transactionally creates positions 1 through 4. Idempotent repeated creation validates the existing cohort and seats. Existing database constraints reject duplicate positions and a fifth seat. Serializable retries cover tested Prisma adapter conflict codes. Preparation never assigns or reserves seats.

## G. Cohort status/eligibility

Only OPEN, matching-plan, nonarchived cohorts with a complete schedule, valid four-seat structure and available capacity are selectable. DRAFT, FULL, ACTIVE, COMPLETED and CANCELLED are rejected. Opening an incomplete cohort fails server-side.

## H. Prepare Enrollment workflow

Approved application details expose Prepare Enrollment. Preparation resolves identity, learner, plan and schedule and returns a summary. It may persist the verified Customer, a deliberately selected new learner, audited application identity links, and nothing financial. Repeated preparation safely reuses those links. The summary explicitly states NOT ENROLLED YET, NO PAYMENT CREATED YET and NO PORTAL ACCESS YET. Create Enrollment & Payment is disabled and has no implemented action.

The UI skill informed explicit labels, readable status messages and a visibly disabled final-action boundary while retaining the existing admin design.

## I. Date/billing calculation

GROUP start derives from cohort.courseStartDate. ONE_TO_ONE requires an explicit agreed date and prohibits a cohort. One shared tested calendar-date helper calculates an exclusive monthly end with end-of-month clamping, including leap years. The payment deadline is explanatory only: seven days after obligation creation, without inventing an expiration timestamp.

## J. Price preview

The server reads the active monthly USD CoursePlan base price. Client price fields are rejected. No legacy CoursePrice discounts, promotion evaluation or financial snapshots are created.

## K. Security

Admin authorization is enforced on pages, API routes and service boundaries. Strict request validation and authoritative server lookups enforce approved application, verified payer, learner identity, relationship, plan and cohort rules. Errors avoid disclosing raw database diagnostics. Supabase service-role use remains server-only. Store, guest checkout, RLS, public signup and existing authentication behavior are unchanged.

## L. Test results

- Focused tests: 65 passed; two opt-in database tests skipped in that invocation.
- Full Vitest suite: 700 passed, two opt-in database tests skipped; 76 test files passed, one skipped.
- Opt-in PostgreSQL 17 integration tests: both passed separately against the disposable localhost-only database; cluster stopped afterward.
- Integration coverage includes concurrent cohort creation, exact seat constraints, schedule opening, concurrent preparation idempotency, null guardian-learner identity and absence of financial/access/relationship writes or seat reservations.
- TypeScript: passed.
- Changed-file ESLint: passed.
- Git diff whitespace check: passed.
- No production build was run because the project's build workflow includes migration deployment.

## M. Schema/migration changes

None. No schema, migration SQL, dependency or environment-file changes were needed.

## N. Production mutation check

No production connections, migration commands, production data writes, extension changes or deployment occurred during this phase. No production learner/account records were created. The existing backup was untouched.

## O. Risks/open items

- Preparation currently requires an already verified Supabase account ID. It does not invite users, auto-confirm email or implement public signup.
- The final Phase 2C transaction must revalidate identity, relationships, application, capacity, dates and pricing; evaluate promotions at creation time; persist any new relationship; and create enrollment/payment atomically. A preparation summary is not a reservation or financial quote.
- No interactive browser smoke test was performed; summary rendering is covered by a server-rendered component test.
- No deployment occurred. Previously committed compatibility code also remains subject to the user's deployment process.

## P. Git status

HEAD remains `f9def692dc5e76b5876f73ec7b91d69130a7559e`. Three tracked files modified and nineteen new files, including this report. Nothing staged or committed. No secrets, certificates, environment files, backups or diagnostic scripts are included in the change set.

## Q. Ready for final Phase 2C

YES, for review and explicit authorization of the final enrollment/payment implementation. That transaction, payment proof upload and portal activation are not implemented here. Stop at Phase 2C.1.
