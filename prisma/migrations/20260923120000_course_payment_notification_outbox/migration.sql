-- Additive durable outbox for course-payment email notifications.
-- No existing rows are backfilled and this migration sends no email.
BEGIN;

CREATE TYPE "CoursePaymentNotificationKind" AS ENUM (
  'PAYMENT_REQUIRED',
  'PROOF_RECEIVED',
  'PAYMENT_VERIFIED',
  'PROOF_REJECTED',
  'INITIAL_PAYMENT_REMINDER_48H',
  'INITIAL_PAYMENT_REMINDER_24H',
  'INITIAL_PAYMENT_EXPIRED'
);

CREATE TYPE "CoursePaymentNotificationStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'RETRY',
  'SENT',
  'FAILED',
  'CANCELLED'
);

-- The redundant composite key lets PostgreSQL enforce that a submission-scoped
-- notification belongs to the same CoursePayment as the outbox row.
CREATE UNIQUE INDEX "CoursePaymentSubmission_id_paymentId_key"
  ON "CoursePaymentSubmission"("id", "paymentId");

CREATE TABLE "CoursePaymentNotification" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "submissionId" TEXT,
  "kind" "CoursePaymentNotificationKind" NOT NULL,
  "deduplicationKey" VARCHAR(191) NOT NULL,
  "status" "CoursePaymentNotificationStatus" NOT NULL DEFAULT 'PENDING',
  "recipientEmailSnapshot" VARCHAR(320) NOT NULL,
  "subjectSnapshot" VARCHAR(300) NOT NULL,
  "htmlSnapshot" TEXT NOT NULL,
  "senderEmailSnapshot" VARCHAR(320),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" UUID,
  "leaseExpiresAt" TIMESTAMP(3),
  "firstAttemptAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "providerMessageId" VARCHAR(255),
  "lastErrorCode" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoursePaymentNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoursePaymentNotification_paymentId_kind_deduplicationKey_key"
  ON "CoursePaymentNotification"("paymentId", "kind", "deduplicationKey");
CREATE INDEX "CoursePaymentNotification_status_nextAttemptAt_idx"
  ON "CoursePaymentNotification"("status", "nextAttemptAt");
CREATE INDEX "CoursePaymentNotification_leaseExpiresAt_idx"
  ON "CoursePaymentNotification"("leaseExpiresAt");
CREATE INDEX "CoursePaymentNotification_paymentId_createdAt_idx"
  ON "CoursePaymentNotification"("paymentId", "createdAt");

ALTER TABLE "CoursePaymentNotification"
  ADD CONSTRAINT "CoursePaymentNotification_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "CoursePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CoursePaymentNotification_submissionId_paymentId_fkey"
    FOREIGN KEY ("submissionId", "paymentId") REFERENCES "CoursePaymentSubmission"("id", "paymentId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CoursePaymentNotification_attempt_nonnegative"
    CHECK ("attemptCount" >= 0),
  ADD CONSTRAINT "CoursePaymentNotification_payload_nonempty"
    CHECK (
      btrim("recipientEmailSnapshot") <> ''
      AND btrim("subjectSnapshot") <> ''
      AND btrim("htmlSnapshot") <> ''
      AND ("senderEmailSnapshot" IS NULL OR btrim("senderEmailSnapshot") <> '')
    ),
  ADD CONSTRAINT "CoursePaymentNotification_scope_consistent"
    CHECK (
      (
        "kind" IN ('PROOF_RECEIVED', 'PROOF_REJECTED')
        AND "submissionId" IS NOT NULL
        AND "deduplicationKey" = 'SUBMISSION:' || "submissionId"
      )
      OR
      (
        "kind" NOT IN ('PROOF_RECEIVED', 'PROOF_REJECTED')
        AND "submissionId" IS NULL
        AND "deduplicationKey" = 'PAYMENT'
      )
    ),
  ADD CONSTRAINT "CoursePaymentNotification_lease_consistent"
    CHECK (
      (
        "status" = 'PROCESSING'
        AND "leaseToken" IS NOT NULL
        AND "leaseExpiresAt" IS NOT NULL
        AND "attemptCount" > 0
        AND "firstAttemptAt" IS NOT NULL
        AND "lastAttemptAt" IS NOT NULL
      )
      OR
      (
        "status" <> 'PROCESSING'
        AND "leaseToken" IS NULL
        AND "leaseExpiresAt" IS NULL
      )
    ),
  ADD CONSTRAINT "CoursePaymentNotification_sent_consistent"
    CHECK (
      (
        "status" = 'SENT'
        AND "sentAt" IS NOT NULL
        AND "providerMessageId" IS NOT NULL
        AND "lastErrorCode" IS NULL
      )
      OR
      (
        "status" <> 'SENT'
        AND "sentAt" IS NULL
      )
    );

-- Same deny-all PostgREST posture as every Phase 1 course/customer table.
-- The Prisma server role owns all outbox access; no anon/authenticated policy.
ALTER TABLE "public"."CoursePaymentNotification" ENABLE ROW LEVEL SECURITY;

COMMIT;
