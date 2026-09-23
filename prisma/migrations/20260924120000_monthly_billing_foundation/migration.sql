-- Additive monthly-billing foundation. Creates no obligations or notifications.
BEGIN;

ALTER TYPE "CoursePaymentNotificationKind" ADD VALUE 'MONTHLY_PAYMENT_REMINDER_72H';
ALTER TYPE "CoursePaymentNotificationKind" ADD VALUE 'MONTHLY_PAYMENT_REMINDER_24H';
ALTER TYPE "CoursePaymentNotificationKind" ADD VALUE 'MONTHLY_PAYMENT_PAST_DUE';

ALTER TABLE "CourseEnrollment" ADD COLUMN "billingTimeZone" TEXT;
CREATE INDEX "CourseEnrollment_status_archivedAt_idx"
  ON "CourseEnrollment"("status", "archivedAt");

-- An overdue monthly obligation may be discovered after its self-service
-- grace window. Its immutable timestamps must still reflect the real billing
-- boundary and real insertion time. Initial-enrollment obligations retain the
-- original seven-day creation-time invariant.
ALTER TABLE "CoursePayment" DROP CONSTRAINT "CoursePayment_expiration_valid";
ALTER TABLE "CoursePayment" ADD CONSTRAINT "CoursePayment_expiration_valid" CHECK (
  ("kind" = 'INITIAL_ENROLLMENT' AND "expiresAt" > "createdAt")
  OR
  ("kind" = 'MONTHLY' AND "dueAt" IS NOT NULL AND "expiresAt" > "dueAt")
);

CREATE OR REPLACE FUNCTION "prevent_course_payment_snapshot_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."enrollmentId" IS DISTINCT FROM OLD."enrollmentId"
    OR NEW."promotionId" IS DISTINCT FROM OLD."promotionId"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."periodStart" IS DISTINCT FROM OLD."periodStart"
    OR NEW."periodEnd" IS DISTINCT FROM OLD."periodEnd"
    OR NEW."revision" IS DISTINCT FROM OLD."revision"
    OR NEW."dueAt" IS DISTINCT FROM OLD."dueAt"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."baseAmountCents" IS DISTINCT FROM OLD."baseAmountCents"
    OR NEW."discountAmountCents" IS DISTINCT FROM OLD."discountAmountCents"
    OR NEW."finalAmountCents" IS DISTINCT FROM OLD."finalAmountCents"
    OR NEW."currency" IS DISTINCT FROM OLD."currency"
    OR NEW."pricingRuleVersion" IS DISTINCT FROM OLD."pricingRuleVersion"
    OR NEW."promotionNameSnapshot" IS DISTINCT FROM OLD."promotionNameSnapshot"
    OR NEW."discountTypeSnapshot" IS DISTINCT FROM OLD."discountTypeSnapshot"
    OR NEW."discountValueSnapshot" IS DISTINCT FROM OLD."discountValueSnapshot"
    OR NEW."supersedesPaymentId" IS DISTINCT FROM OLD."supersedesPaymentId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN RAISE EXCEPTION 'CoursePayment obligation snapshots are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "CoursePayment_snapshot_immutable"
BEFORE UPDATE ON "CoursePayment"
FOR EACH ROW EXECUTE FUNCTION "prevent_course_payment_snapshot_mutation"();

CREATE OR REPLACE FUNCTION "prevent_enrollment_billing_timezone_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."billingTimeZone" IS NOT NULL
    AND NEW."billingTimeZone" IS DISTINCT FROM OLD."billingTimeZone"
  THEN RAISE EXCEPTION 'CourseEnrollment billingTimeZone is immutable once set' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "CourseEnrollment_billing_timezone_immutable"
BEFORE UPDATE OF "billingTimeZone" ON "CourseEnrollment"
FOR EACH ROW EXECUTE FUNCTION "prevent_enrollment_billing_timezone_mutation"();

COMMIT;
