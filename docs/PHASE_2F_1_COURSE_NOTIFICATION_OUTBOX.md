# Phase 2F.1 course-payment notification outbox

This phase replaces best-effort course-payment email calls with an additive, server-only PostgreSQL outbox. It does not configure a production schedule, send during migration, backfill historical events, or implement monthly billing.

## Model and lifecycle

`CoursePaymentNotification` belongs to one `CoursePayment`. `PROOF_RECEIVED` and `PROOF_REJECTED` also belong to one `CoursePaymentSubmission`; the composite foreign key `(submissionId, paymentId)` proves that the submission belongs to the same payment. Both relationships use `ON DELETE RESTRICT`, RLS is enabled with no browser policy, and normal lifecycle is status-based rather than deletion.

The row snapshots only the recipient address and rendered subject/body needed to retry the same provider request. The sender address is snapshotted when first claimed. It intentionally stores no proof path, transaction reference, payment credential, token, signed URL, or arbitrary JSON.

Deduplication is enforced by `UNIQUE (paymentId, kind, deduplicationKey)`:

- payment-scoped kinds use `PAYMENT`;
- proof-scoped kinds use `SUBMISSION:<submissionId>`.

This permits distinct notifications for legitimate later proof attempts while preventing duplicates for one attempt or one payment event.

## Transaction boundary

Payment-required, proof-received, verification/rejection, and expiration rows are inserted in the same serializable transaction as their domain transition. Provider delivery happens only after commit. A provider outage therefore cannot roll back or corrupt financial state. Reminder generation uses an idempotent unique insert and does not alter `expiresAt`.

## Claim, lease, retry, and provider idempotency

The worker claims at most four due rows in one atomic `FOR UPDATE SKIP LOCKED` statement, changes them to `PROCESSING`, increments the attempt, and assigns one five-minute UUID lease. Every completion update must still own that lease. Expired leases are reclaimable.

Transient failures use bounded backoff: 5 minutes, 30 minutes, 2 hours, then 8 hours, with at most five attempts. Permanent validation failures become `FAILED`. Rows that are no longer authoritative become `CANCELLED`. Error storage is a redacted 64-character code; bodies and raw provider errors are not persisted or logged.

Every delivery uses `course-payment-notification/<outbox-id>` as the Resend idempotency key and the immutable payload snapshot. Resend retains idempotency keys for 24 hours. Automatic retry stops at a conservative 23-hour boundary so the system does not claim exactly-once behavior beyond the provider guarantee.

Crash behavior:

1. Before claim: row remains due.
2. After claim/before provider call: the stale lease is reclaimed.
3. During provider call: the same payload/key is retried after the lease.
4. Provider accepted/process crashed before `SENT`: the same key suppresses a duplicate within the provider window.
5. Database completion update failed after acceptance: lease is deliberately retained and the same key is retried.

Delivery is strongest-practical at-least-once, not an unconditional exactly-once guarantee. An unresolved row older than the 23-hour safety window becomes `FAILED` for manual reconciliation rather than risking an unkeyed duplicate.

## Reminder windows

For an actionable `INITIAL_ENROLLMENT` obligation:

- 48-hour reminder: more than 36 and at most 48 hours remain;
- 24-hour reminder: more than 12 and at most 24 hours remain.

The windows do not overlap. A missed window remains missed, so a late hourly scheduler never emits both reminders together. Eligibility requires a `PENDING` payment, `PENDING_PAYMENT` unarchived enrollment, active unarchived customer, no portal access, and an unexpired deadline. `PROOF_SUBMITTED`, `VERIFIED`, `EXPIRED`, and cancelled enrollments are excluded. A rejected proof that returns the obligation to `PENDING` is eligible while its original deadline remains in a useful window.

## Migration, rollback, and recovery

The migration adds two enums, one table, one redundant composite unique index on submissions, worker indexes, check constraints, two restrictive foreign keys, and RLS. It performs no update, delete, backfill, or send.

Before any outbox row is used, a non-production rollback may drop only the new table/enums/index if required. After rows exist, destructive rollback is not acceptable: preserve the delivery ledger and use a forward migration. A code rollback may leave the additive table unused while existing financial history remains intact.
