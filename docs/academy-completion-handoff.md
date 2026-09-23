# Academy local completion handoff

## Scope and safety

Starting checkpoint: `59624efb2fa4e3f0fbcc77a68fdc444ecee68b7b`.
Monthly billing checkpoint: `4ffd581f9d62563a5b190b8fd6f3f7e73c3cd42c`.
No production connection, migration, environment modification, deployment,
cron configuration, or real email was performed in this session.
The production state supplied by the user remains 27 applied migrations;
it was deliberately not re-queried.

## Implemented after monthly billing

- `/account`: verified Supabase identity, payer-scoped course history, active
  guardian relationships, explicitly linked store orders and read-only profile.
  Historical guest orders are not claimed by email. No student impersonation.
- `/account/course-payments`: shared navigation and existing owned proof flow.
- Public account entry, signup, local sign-out, and PKCE confirmation callback
  reuse Supabase. A confirmed server-fetched user is required for account data.
  Signup itself creates no Customer/StudentProfile/enrollment/payment/access rows.
  The account DAL provisions Customer by immutable Supabase user ID only.
- Course cards and detail/application selectors use CoursePlan prices. Chosen
  plans survive navigation and are validated server-side against requested level.
  Server-derived offers are initial-payment-only; countdowns use real end dates
  and never define eligibility. No changes to store checkout or CoursePrice rows.
- `/admin/course-promotions`: authenticated create/cancel, explicit UTC dates,
  integer-money validation, same-origin writes, plan serialization and existing
  PostgreSQL exclusion protection. Cancellation preserves payment snapshots.
- `/admin/customers`: authoritative Customer 360; bounded relationship/history
  views, proof-review links and untruncated totals grouped by currency. Financial
  totals use VERIFIED course payments and confirmed PAID store orders, not proof
  submission or pending obligations. Not a net-revenue accounting report.

## Validation

- Full suite with six separate disposable PostgreSQL databases: 109 files,
  925 tests passed. Intra-test worker/concurrency races remain enabled.
- Follow-up reminder hardening excludes already-enqueued window/kind pairs
  before applying the batch limit. A 101-payment PostgreSQL test proves progress
  across batches for both monthly reminder windows without duplicate creation.
- Prisma validation, TypeScript and changed-file ESLint passed.
- Restored-history migration rehearsal: 28 completed migrations, zero incomplete.
- Fresh Prisma schema and restored database drift checks: no difference.
- Raw constraints, triggers, immutability, overlap and rollback are tested in
  PostgreSQL; Prisma drift alone does not verify these unsupported schema objects.
- Local restored legacy counts: Order 34, PaymentConfirmation 9, StudentProfile 1,
  CourseApplication 2, CoursePrice 3. Customer, enrollment, course payment,
  submission and notification counts in the untouched rehearsal copy remain zero.
- Browser checks used a separate loopback database containing only the five
  public plans. Checked rendered prices, keyboard radio selection, selected plan
  carry-through, mobile overflow, English/Amharic rendering and account sign-in
  redirect. No application, signup or email was submitted in the browser.
- UI Styling guided semantic radio controls, visible selection/checkmarks,
  focus, 250ms transitions and reduced-motion handling. Browser inspection found
  and corrected initial selector mismatch and an unsupported legacy universal
  lesson-frequency promise.
- Existing pg adapter concurrency deprecation warning remains non-failing.
  No production-connected build or repository `npm run build` was run.

## Boundaries / remaining release work

1. Migration 28 (`20260924120000_monthly_billing_foundation`) is LOCAL ONLY.
   Review its transactional CHECK replacement as well as additive fields/enums/
   triggers. The replacement permits approved late MONTHLY obligation insertion
   after grace; INITIAL_ENROLLMENT timing remains unchanged. No historical row
   rewrite or timezone invention. See `monthly-billing-local-validation.md`.
2. Preserve the existing production migration history. The old migration chain
   lacks a complete empty-database baseline; that pre-existing problem was not
   rewritten. Fresh schema creation and restored-history replay are distinct tests.
3. Loginless learner practice access needs a separate explicit security policy.
   Guardian payer access never substitutes for learner authentication.
4. Guest/historical order linking needs an explicit verified ownership workflow;
   this session intentionally provides none. Existing guest checkout still works.
5. Profile editing, refunds, manual post-grace payment exceptions, proration and
   past-due suspension/cancellation workflows are not implemented here.
6. Account/history views show at most 100 recent rows; admin customer list is
   paginated. Per-payment submission history remains available in existing review.
7. The legacy CoursePrice editor remains for compatibility; it is not the
   authoritative price editor for the new CoursePlan-based public selectors.
8. Existing unrelated Amharic placeholders/curriculum English were not broadly
   translated. New keys have parity; native-language copy review is still useful.

## Deployment gate — separate authorization required

- Inspect Vercel DATABASE_URL/DIRECT_URL for the previously reset credentials,
  correct direct/pooler strategy and strict TLS. A local certificate filesystem
  path cannot simply be copied into Vercel. Never commit certificates or secrets.
- Review and authorize migration 28 with a fresh verified backup before any
  production application. Deploy application code only with the required schema.
- Verify Supabase Confirm email is enabled, Secure Email Change remains secure,
  and the production `/account/confirm` callback is allowlisted. The existing
  verified-email DAL relies on correct Auth configuration, not a browser check.
  PKCE confirmation requires the browser that initiated registration. Test the
  real confirmation and sign-in flow only under separately approved conditions.
- Verify private receipt bucket permissions, signed admin proof access, email
  sender/provider configuration and actual notification delivery.
- Configure CRON_SECRET and scheduling only in a separately approved rollout.
  Measure scheduler latency on the actual deployment path; bounded batches and
  idempotent transactions do not eliminate serverless deadline constraints.
- Complete authenticated account/admin visual acceptance with non-production
  test identities. Do not use production identities merely to make tests pass.

Development is checkpointed; production deployment is **NOT READY** until these
release checks and explicit migration/deployment approvals are completed.
