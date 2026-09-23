# Monthly billing local checkpoint

Production was not contacted or changed. No emails, deployment or cron activation.

## Migration

`20260924120000_monthly_billing_foundation` is pending production review.
SHA-256: `f546c853498ac81c751e0d7f33a00101a7052e0460208b2f2ff0fc3902202e64`.

The transaction adds a nullable, immutable-once-set enrollment billing timezone,
three notification types, an active-enrollment index, and financial snapshot
protection. There is no historical timezone backfill or generated payment.
The existing expiration CHECK is replaced in this new migration: initial
obligations retain their creation-time rule; monthly obligations require an
expiration after their due date. This permits approved late ledger creation
after a missed scheduler run without altering historical rows or migrations.

## Evidence

- Disposable PostgreSQL 17, loopback only, restored from the verified pre-Phase-1 backup.
- Restored historical chain through migration 28 succeeded; no failed migration.
- Legacy counts preserved: Order 34, PaymentConfirmation 9, StudentProfile 1,
  CourseApplication 2, CoursePrice 3. New financial/business tables remained empty.
- Forced late SQL failure rolled back all migration-28 changes.
- Fresh Prisma schema creation and schema-to-database drift checks passed.
- The pre-existing incomplete historical baseline still prevents replaying the
  entire historical migration chain into an empty database. It was not rewritten.
- Full Vitest including five isolated PostgreSQL databases: 102 files, 886 tests passed.
- Prisma validate, TypeScript, changed-file ESLint and git diff check passed.
- DST, original-anchor month arithmetic, immutable snapshots, scheduler/proof/
  review races, outbox leases/deduplication and legacy flows are covered.

Database test suites use separate databases. Worker concurrency within tests
remains enabled. Vitest file workers are bounded at four. Generation candidates
validate only timezones actually used by active enrollments, avoiding a repeated
full PostgreSQL timezone-catalog evaluation.

Before deployment, separately verify credentials/TLS in the deployment
environment, Auth redirects, private receipt storage, email provider and cron
configuration. A developer-machine certificate path is not a deployment strategy.
