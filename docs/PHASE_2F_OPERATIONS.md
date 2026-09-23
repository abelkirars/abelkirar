# Phase 2F: initial-payment expiration operations

Local implementation only. Nothing in this phase enables a live scheduler,
deploys the site, changes environment values, or contacts production.

## Checkpoint

Phase 2E: `b045fe0c5ae62b52e00250120569687e3aefa275`.
Reviewed/committed 20 files; clean worktree verified before Phase 2F.
No schema, migration, storage-policy, credential, certificate or backup files
were in the checkpoint. Store receipt signing retains its existing defaults.

## Invocation and cadence — requires later approval/configuration

`vercel.json` has no cron configuration. There is no existing application cron
runner, scheduler secret, or evidence of the Vercel billing plan in tracked
configuration. The current build script runs `prisma migrate deploy`; do not
use a production build as a validation command.

The prepared Node route is `GET /api/internal/course-payments/expire`.
It requires `Authorization: Bearer` authentication using the server-only
environment name **CRON_SECRET** (at least 32 characters, no surrounding
whitespace). This document supplies no secret value. Missing/invalid configuration
fails closed before querying the database. Customer/admin cookies do not count.
Comparison uses fixed-size SHA-256 digests and timingSafeEqual. HEAD explicitly
returns 405 rather than executing Next's automatic GET fallback. Other methods
are unsupported. No query parameters, target IDs, or supplied clock are accepted.
All responses are private/no-store. Keep the authorization header out of logs.

Recommended cadence: hourly, conditional on an already-supported scheduler.
Vercel Pro/Enterprise support hourly; Hobby is limited to daily jobs with
hour-level precision. The account plan has NOT been checked remotely. Do not
silently deploy an hourly Hobby cron or substitute daily operation as equivalent.

After separate approval and confirmation of the plan, the intended Vercel cron
entry is path `/api/internal/course-payments/expire`, schedule `0 * * * *` (UTC).
It is deliberately NOT added to the active `vercel.json` in this phase. If the
account is Hobby, choose explicitly between its delayed daily cadence, an
approved external hourly scheduler, or a plan change. No purchase is implied.

Official references checked during implementation:

- [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel cron security, concurrency, and failure handling](https://vercel.com/docs/cron-jobs/manage-cron-jobs)

## Domain behavior

Both entry points call `runInitialPaymentExpirationJob`, which delegates each
candidate to the existing `expireInitialPayment` serializable transaction.
Candidate selection is NOT authorization to expire: the payment lock and domain
recheck remain authoritative. Only INITIAL_ENROLLMENT/PENDING obligations whose
original expiresAt has passed are candidates, with a pending unarchived
enrollment and no existing access row. Timely SUBMITTED/ACCEPTED proofs protect
expiration, including inconsistent PENDING rows; PROOF_SUBMITTED is excluded.

One successful transition expires the obligation, cancels its pending enrollment
with INITIAL_PAYMENT_EXPIRED, releases only its own seat, and reopens eligible
FULL cohorts according to existing rules. No price/deadline is changed. Active
enrollments, verified payments, portal-access records, historical enrollments,
unrelated seats, store orders and learner identities are untouched. Initial
obligations inconsistent with active enrollment/access are skipped for review.

When an application is linked, a system CourseApplicationEvent is written in
the SAME transaction, preserving its current application status. actorAdminId
is null and the note explicitly identifies system expiration/payment/enrollment.
It is not a new application approval/decline. Existing payment/enrollment history
remains the audit record when no application exists. Replays do not add events.
An admin rejection after deadline legitimately records two distinct events:
system expiration and the admin's proof-review decision.

## Bounded execution and operator fallback

Each invocation selects at most 101 IDs, processes at most 100, and stops starting
new records after a 30-second soft work budget. Each record has its own transaction
and exception handling. Existing DB connection/statement/transaction limits still
apply. The route declares maxDuration 60 seconds; confirm actual platform limits
before activation. One email wait is capped at five seconds; a timeout is an
UNKNOWN delivery outcome, not proof that no email was accepted. No automatic
retry follows it. A timed-out provider call may still complete.

The batch is sequential and needs no in-memory mutex for correctness. Concurrent
jobs are safe at the per-payment database lock. Existing RateLimitHit is a
sliding-window traffic control, not a distributed lock or durable email ledger;
it is not repurposed for either. Unauthorized scheduler calls never write rate
limit rows. Valid repeated calls remain bounded but still consume resources.

Manual fallback: `POST /api/admin/course-payments/expire-overdue`, with an existing
valid admin session, same-origin request, and JSON `{"confirmation":true}` only.
It calls the identical bounded runner, not a generic arbitrary-job API. No new
button or customer-facing endpoint was added. Do not invoke it against production
without authorization. An operator can trigger it from an authenticated admin
session after explicit approval; check its response rather than blindly retrying.

## Notifications and reliability limits

Only the scheduler invocation whose transaction returns EXPIRED attempts the
expiration email. The notifier rechecks EXPIRED + CANCELLED + the matching reason
and no access before messaging the authoritative payer. English/Amharic copy says
the enrollment window expired, payment was not verified, enrollment was cancelled,
and access was not activated. It neither reveals seat internals nor promises a
refund/new deadline. Provider errors are redacted. Email never affects commits.

Replays/restarts do NOT scan old EXPIRED rows or re-send payment-required emails.
This prevents repeated-job duplicates but is NOT durable email delivery:

- A crash between commit and dispatch can lose a notification permanently.
- Provider acceptance is not inbox delivery; there is no course delivery webhook
  history or persisted provider message ID.
- Lazy expiration from an account read/upload does not get a later scheduler
  email, because the scheduler did not win that transition.
- Phase 2E after-deadline rejection retains its own rejection/expiration message;
  the scheduler does not add another email.
- Failed/uncertain emails are not automatically retried without persistent state.

Existing payment-required mail is called only after createEnrollmentAndInitialPayment
returns successfully and non-idempotently, using its payer/amount/original deadline.
Its URL is now validated as an authenticated payment path with a safe protocol,
no credentials, query tokens or fragment. Proof received remains explicitly
unverified; verified/rejected mail remains after review commit, with original
deadline/no resubmission after expiry. Course transport logging is redacted;
the shared sender's existing store defaults are preserved.

## Reminders stopped — schema approval needed

No 48-hour or 24-hour reminder is implemented or sent. Current schema inspection:

- CoursePayment has no reminder claim/sent/delivery state or outbox relationship.
- OrderNotificationLog requires a store Order and is not a course outbox.
- CourseApplication.notificationsSentAt only tracks application intake notices.
- CourseApplicationEvent is an audit trail, lacks delivery/claim semantics, and
  cannot cover payments whose enrollment has no application. Do not overload notes
  or deterministic audit IDs as a hidden email queue.
- RateLimitHit is cleaned up and cannot deduplicate reminders across restarts.
- Resend invocation currently has no per-course persisted idempotency keys/retries.

Smallest recommended separate approval: one CoursePaymentNotification table with
paymentId (RESTRICT), kind (REMINDER_48H, REMINDER_24H, EXPIRED initially), a unique
(paymentId, kind), status, attempt count, nextAttemptAt, lease/claim token and expiry,
createdAt, sentAt, providerMessageId and sanitized error category. Include a frozen
recipient/payload where needed to prevent retries changing content. RLS remains
enabled/server-only. This is a PROPOSAL ONLY: no model or migration was created.

Create expiration notification intent in the same financial transaction; insert
reminder intent with unique-key conflict protection after checking the original
deadline/current eligibility. A small worker claims leases, revalidates reminders
immediately before sending (exclude proof awaiting review, verified, expired or
cancelled), and records outcomes. Any provider idempotency mechanism must be checked
for retention limits; a timeout outside those limits requires reconciliation,
not blind retries or an exactly-once claim. Decide whether to suppress the older
48-hour reminder when first processing occurs inside the final 24 hours.

Financial expiration is suitable for supervised operation after validation and
activation approval. Fully automated reminders/reliable notification delivery
are NOT launch-ready. Approve the small persistence phase before relying on them.

## Observability and responses

Logs include jobId, candidate/processed/expired/skipped/failed counts,
emailAccepted/emailFailed/emailUnknown, deferred, hasMore, durationMs. Failed
records log only jobId/paymentId, never raw DB/provider errors, payer names/emails,
proofs, destinations, signed URLs, secrets or request headers. Provider acceptance
is deliberately labeled emailAccepted, not delivery confirmation.

An individual DB/domain error is isolated; successful records remain committed.
503 indicates at least one record failed or candidate query failed. Email-only
failures do not turn successful expiration into a failed transaction. Operators
must inspect emailFailed/emailUnknown even on 200. Vercel does not supply a durable
application retry queue. Monitor missed hourly completion, repeated failures,
skipped anomalies and persistent hasMore/deferred. These are logs/response counters,
not persisted job history or configured alerts.

The fixed oldest-first cap can require multiple approved invocations for backlog.
If malformed/protected inconsistent records saturate the cap, investigate before
repeated runs; there is no persistent cursor/quarantine queue yet. Do not claim
unbounded catch-up, exact hourly execution or guaranteed email delivery.

## Guardian boundary and stop point

A guardian-managed learner with null Supabase ID/email can have ACTIVE enrollment
and enabled CoursePortalAccess but cannot authenticate to the current child portal.
That remains a separate UX/authentication decision. No identity copying, fabricated
accounts or auth weakening is included here.

No monthly generation, Admin 360, guardian portal implementation, live cron,
production access, deployment, schema change, or Phase 2F commit is authorized here.
