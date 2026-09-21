-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "CustomerStudentRelationType" AS ENUM ('SELF', 'GUARDIAN');

-- CreateEnum
CREATE TYPE "CourseFormat" AS ENUM ('GROUP', 'ONE_TO_ONE');

-- CreateEnum
CREATE TYPE "CourseBillingInterval" AS ENUM ('MONTHLY');

-- CreateEnum
CREATE TYPE "CourseWeekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "CourseCohortStatus" AS ENUM ('DRAFT', 'OPEN', 'FULL', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CourseEnrollmentStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CoursePaymentKind" AS ENUM ('INITIAL_ENROLLMENT', 'MONTHLY');

-- CreateEnum
CREATE TYPE "CoursePaymentStatus" AS ENUM ('PENDING', 'PAST_DUE', 'PROOF_SUBMITTED', 'VERIFIED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CoursePaymentSubmissionStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CourseTuitionPaymentMethod" AS ENUM ('ZELLE', 'CASH_APP');

-- CreateEnum
CREATE TYPE "CoursePortalAccessStatus" AS ENUM ('ENABLED', 'SUSPENDED', 'REVOKED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "customerLinkedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "preferredTimeZone" TEXT;

-- AlterTable
ALTER TABLE "CourseApplication" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "requestedPlanId" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "supabaseUserId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3) NOT NULL,
    "emailSyncedAt" TIMESTAMP(3) NOT NULL,
    "fullName" TEXT,
    "phone" TEXT,
    "locale" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "deactivatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerStudentRelation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "CustomerStudentRelationType" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "endedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerStudentRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "level" "StudentLevel" NOT NULL,
    "format" "CourseFormat" NOT NULL,
    "billingInterval" "CourseBillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "monthlyPriceCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "groupMinimumStudents" INTEGER,
    "groupMaximumStudents" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoursePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCohort" (
    "id" TEXT NOT NULL,
    "coursePlanId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CourseCohortStatus" NOT NULL DEFAULT 'DRAFT',
    "minimumStudents" INTEGER NOT NULL DEFAULT 3,
    "maximumStudents" INTEGER NOT NULL DEFAULT 4,
    "weeklyDay" "CourseWeekday",
    "localStartTime" TIME(0),
    "durationMinutes" INTEGER,
    "timeZone" TEXT,
    "courseStartDate" DATE,
    "courseEndDate" DATE,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseCohort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCohortSeat" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "currentEnrollmentId" TEXT,
    "reservedUntil" TIMESTAMP(3),
    "assignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseCohortSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseEnrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "coursePlanId" TEXT NOT NULL,
    "applicationId" TEXT,
    "cohortId" TEXT,
    "status" "CourseEnrollmentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "levelSnapshot" "StudentLevel" NOT NULL,
    "formatSnapshot" "CourseFormat" NOT NULL,
    "planCodeSnapshot" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "concurrentEnrollmentOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "overrideByAdminId" TEXT,
    "overrideAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePromotion" (
    "id" TEXT NOT NULL,
    "coursePlanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publicMessage" TEXT,
    "discountType" "CourseDiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "publicCountdownEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoursePromotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePayment" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "promotionId" TEXT,
    "kind" "CoursePaymentKind" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "dueAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "CoursePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "baseAmountCents" INTEGER NOT NULL,
    "discountAmountCents" INTEGER NOT NULL DEFAULT 0,
    "finalAmountCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "pricingRuleVersion" TEXT NOT NULL DEFAULT 'v1',
    "promotionNameSnapshot" TEXT,
    "discountTypeSnapshot" "CourseDiscountType",
    "discountValueSnapshot" INTEGER,
    "verifiedAt" TIMESTAMP(3),
    "verifiedByAdminId" TEXT,
    "supersedesPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoursePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePaymentSubmission" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "CoursePaymentSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "method" "CourseTuitionPaymentMethod" NOT NULL,
    "senderName" TEXT,
    "transactionReference" TEXT,
    "amountSentCents" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3),
    "proofStoragePath" TEXT NOT NULL,
    "originalFileName" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAdminId" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoursePaymentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePortalAccess" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "status" "CoursePortalAccessStatus" NOT NULL DEFAULT 'ENABLED',
    "reason" TEXT,
    "changedByAdminId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoursePortalAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_supabaseUserId_key" ON "Customer"("supabaseUserId");

-- CreateIndex
CREATE INDEX "Customer_emailNormalized_idx" ON "Customer"("emailNormalized");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE INDEX "CustomerStudentRelation_studentId_idx" ON "CustomerStudentRelation"("studentId");

-- CreateIndex
CREATE INDEX "CustomerStudentRelation_customerId_type_idx" ON "CustomerStudentRelation"("customerId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerStudentRelation_customerId_studentId_key" ON "CustomerStudentRelation"("customerId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePlan_code_key" ON "CoursePlan"("code");

-- CreateIndex
CREATE INDEX "CoursePlan_active_displayOrder_idx" ON "CoursePlan"("active", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePlan_level_format_key" ON "CoursePlan"("level", "format");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCohort_code_key" ON "CourseCohort"("code");

-- CreateIndex
CREATE INDEX "CourseCohort_coursePlanId_status_idx" ON "CourseCohort"("coursePlanId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCohortSeat_currentEnrollmentId_key" ON "CourseCohortSeat"("currentEnrollmentId");

-- CreateIndex
CREATE INDEX "CourseCohortSeat_cohortId_currentEnrollmentId_idx" ON "CourseCohortSeat"("cohortId", "currentEnrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCohortSeat_cohortId_position_key" ON "CourseCohortSeat"("cohortId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CourseEnrollment_applicationId_key" ON "CourseEnrollment"("applicationId");

-- CreateIndex
CREATE INDEX "CourseEnrollment_studentId_status_idx" ON "CourseEnrollment"("studentId", "status");

-- CreateIndex
CREATE INDEX "CourseEnrollment_customerId_status_idx" ON "CourseEnrollment"("customerId", "status");

-- CreateIndex
CREATE INDEX "CourseEnrollment_cohortId_status_idx" ON "CourseEnrollment"("cohortId", "status");

-- CreateIndex
CREATE INDEX "CoursePromotion_coursePlanId_startsAt_endsAt_idx" ON "CoursePromotion"("coursePlanId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePayment_supersedesPaymentId_key" ON "CoursePayment"("supersedesPaymentId");

-- CreateIndex
CREATE INDEX "CoursePayment_enrollmentId_status_idx" ON "CoursePayment"("enrollmentId", "status");

-- CreateIndex
CREATE INDEX "CoursePayment_status_dueAt_idx" ON "CoursePayment"("status", "dueAt");

-- CreateIndex
CREATE INDEX "CoursePayment_status_expiresAt_idx" ON "CoursePayment"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePayment_enrollmentId_periodStart_revision_key" ON "CoursePayment"("enrollmentId", "periodStart", "revision");

-- CreateIndex
CREATE INDEX "CoursePaymentSubmission_status_submittedAt_idx" ON "CoursePaymentSubmission"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "CoursePaymentSubmission_transactionReference_idx" ON "CoursePaymentSubmission"("transactionReference");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePaymentSubmission_paymentId_attemptNumber_key" ON "CoursePaymentSubmission"("paymentId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePortalAccess_enrollmentId_key" ON "CoursePortalAccess"("enrollmentId");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "CourseApplication_customerId_idx" ON "CourseApplication"("customerId");

-- CreateIndex
CREATE INDEX "CourseApplication_requestedPlanId_idx" ON "CourseApplication"("requestedPlanId");

-- AddForeignKey
ALTER TABLE "CustomerStudentRelation" ADD CONSTRAINT "CustomerStudentRelation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStudentRelation" ADD CONSTRAINT "CustomerStudentRelation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCohort" ADD CONSTRAINT "CourseCohort_coursePlanId_fkey" FOREIGN KEY ("coursePlanId") REFERENCES "CoursePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCohortSeat" ADD CONSTRAINT "CourseCohortSeat_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "CourseCohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCohortSeat" ADD CONSTRAINT "CourseCohortSeat_currentEnrollmentId_fkey" FOREIGN KEY ("currentEnrollmentId") REFERENCES "CourseEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_coursePlanId_fkey" FOREIGN KEY ("coursePlanId") REFERENCES "CoursePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CourseApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "CourseCohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_overrideByAdminId_fkey" FOREIGN KEY ("overrideByAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePromotion" ADD CONSTRAINT "CoursePromotion_coursePlanId_fkey" FOREIGN KEY ("coursePlanId") REFERENCES "CoursePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePayment" ADD CONSTRAINT "CoursePayment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CourseEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePayment" ADD CONSTRAINT "CoursePayment_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "CoursePromotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePayment" ADD CONSTRAINT "CoursePayment_verifiedByAdminId_fkey" FOREIGN KEY ("verifiedByAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePayment" ADD CONSTRAINT "CoursePayment_supersedesPaymentId_fkey" FOREIGN KEY ("supersedesPaymentId") REFERENCES "CoursePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePaymentSubmission" ADD CONSTRAINT "CoursePaymentSubmission_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "CoursePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePaymentSubmission" ADD CONSTRAINT "CoursePaymentSubmission_reviewedByAdminId_fkey" FOREIGN KEY ("reviewedByAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePortalAccess" ADD CONSTRAINT "CoursePortalAccess_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CourseEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePortalAccess" ADD CONSTRAINT "CoursePortalAccess_changedByAdminId_fkey" FOREIGN KEY ("changedByAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseApplication" ADD CONSTRAINT "CourseApplication_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseApplication" ADD CONSTRAINT "CourseApplication_requestedPlanId_fkey" FOREIGN KEY ("requestedPlanId") REFERENCES "CoursePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Domain checks. These make the approved invariants database facts rather
-- than decorative UI copy. Cross-table rules (for example, a cohort's plan
-- must itself be GROUP) remain transactional service checks because a CHECK
-- constraint cannot reference another table safely.
-- ---------------------------------------------------------------------------
ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_email_normalized" CHECK (
    "emailNormalized" <> '' AND "emailNormalized" = lower(btrim("emailNormalized"))
  );

ALTER TABLE "CoursePlan"
  ADD CONSTRAINT "CoursePlan_price_positive" CHECK ("monthlyPriceCents" > 0),
  ADD CONSTRAINT "CoursePlan_currency_usd" CHECK ("currency" = 'USD'),
  ADD CONSTRAINT "CoursePlan_group_capacity" CHECK (
    ("format" = 'GROUP' AND "groupMinimumStudents" = 3 AND "groupMaximumStudents" = 4)
    OR
    ("format" = 'ONE_TO_ONE' AND "groupMinimumStudents" IS NULL AND "groupMaximumStudents" IS NULL)
  ),
  ADD CONSTRAINT "CoursePlan_advanced_one_to_one" CHECK (
    "level" <> 'ADVANCED' OR "format" = 'ONE_TO_ONE'
  ),
  ADD CONSTRAINT "CoursePlan_display_order_nonnegative" CHECK ("displayOrder" >= 0);

ALTER TABLE "CourseCohort"
  ADD CONSTRAINT "CourseCohort_capacity_three_to_four" CHECK (
    "minimumStudents" = 3 AND "maximumStudents" = 4
  ),
  ADD CONSTRAINT "CourseCohort_schedule_pair" CHECK (
    ("weeklyDay" IS NULL AND "localStartTime" IS NULL)
    OR
    ("weeklyDay" IS NOT NULL AND "localStartTime" IS NOT NULL)
  ),
  ADD CONSTRAINT "CourseCohort_published_schedule_required" CHECK (
    "status" IN ('DRAFT', 'CANCELLED')
    OR
    ("weeklyDay" IS NOT NULL AND "localStartTime" IS NOT NULL AND "timeZone" IS NOT NULL AND btrim("timeZone") <> '')
  ),
  ADD CONSTRAINT "CourseCohort_duration_valid" CHECK (
    "durationMinutes" IS NULL OR "durationMinutes" BETWEEN 15 AND 480
  ),
  ADD CONSTRAINT "CourseCohort_date_range_valid" CHECK (
    "courseStartDate" IS NULL OR "courseEndDate" IS NULL OR "courseEndDate" >= "courseStartDate"
  );

ALTER TABLE "CourseCohortSeat"
  ADD CONSTRAINT "CourseCohortSeat_position_valid" CHECK ("position" BETWEEN 1 AND 4),
  ADD CONSTRAINT "CourseCohortSeat_assignment_consistent" CHECK (
    ("currentEnrollmentId" IS NULL AND "assignedAt" IS NULL AND "reservedUntil" IS NULL)
    OR
    ("currentEnrollmentId" IS NOT NULL AND "assignedAt" IS NOT NULL)
  );

ALTER TABLE "CourseEnrollment"
  ADD CONSTRAINT "CourseEnrollment_format_cohort_consistent" CHECK (
    ("formatSnapshot" = 'GROUP' AND "cohortId" IS NOT NULL)
    OR
    ("formatSnapshot" = 'ONE_TO_ONE' AND "cohortId" IS NULL)
  ),
  ADD CONSTRAINT "CourseEnrollment_terminal_state_consistent" CHECK (
    ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "cancelledAt" IS NULL)
    OR
    ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancellationReason" IS NOT NULL AND btrim("cancellationReason") <> '')
    OR
    ("status" NOT IN ('COMPLETED', 'CANCELLED') AND "completedAt" IS NULL AND "cancelledAt" IS NULL)
  ),
  ADD CONSTRAINT "CourseEnrollment_override_audited" CHECK (
    (
      "concurrentEnrollmentOverride" = false
      AND "overrideReason" IS NULL
      AND "overrideByAdminId" IS NULL
      AND "overrideAt" IS NULL
    )
    OR
    (
      "concurrentEnrollmentOverride" = true
      AND "overrideReason" IS NOT NULL
      AND btrim("overrideReason") <> ''
      AND "overrideByAdminId" IS NOT NULL
      AND "overrideAt" IS NOT NULL
    )
  );

ALTER TABLE "CoursePromotion"
  ADD CONSTRAINT "CoursePromotion_period_valid" CHECK ("endsAt" > "startsAt"),
  ADD CONSTRAINT "CoursePromotion_discount_valid" CHECK (
    ("discountType" = 'PERCENT' AND "discountValue" BETWEEN 1 AND 99)
    OR
    ("discountType" = 'FIXED' AND "discountValue" > 0)
  ),
  ADD CONSTRAINT "CoursePromotion_cancelled_disabled" CHECK (
    "cancelledAt" IS NULL OR "enabled" = false
  );

ALTER TABLE "CoursePayment"
  ADD CONSTRAINT "CoursePayment_period_valid" CHECK ("periodEnd" > "periodStart"),
  ADD CONSTRAINT "CoursePayment_revision_positive" CHECK ("revision" > 0),
  ADD CONSTRAINT "CoursePayment_expiration_valid" CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT "CoursePayment_kind_timing_valid" CHECK (
    (
      "kind" = 'INITIAL_ENROLLMENT'
      AND "dueAt" IS NULL
      AND "expiresAt" = "createdAt" + interval '7 days'
    )
    OR
    (
      "kind" = 'MONTHLY'
      AND "dueAt" IS NOT NULL
      AND "expiresAt" > "dueAt"
    )
  ),
  ADD CONSTRAINT "CoursePayment_amounts_valid" CHECK (
    "baseAmountCents" > 0
    AND "discountAmountCents" >= 0
    AND "finalAmountCents" > 0
    AND "finalAmountCents" = "baseAmountCents" - "discountAmountCents"
  ),
  ADD CONSTRAINT "CoursePayment_currency_usd" CHECK ("currency" = 'USD'),
  ADD CONSTRAINT "CoursePayment_promotion_snapshot_consistent" CHECK (
    (
      "promotionId" IS NULL
      AND "promotionNameSnapshot" IS NULL
      AND "discountTypeSnapshot" IS NULL
      AND "discountValueSnapshot" IS NULL
      AND "discountAmountCents" = 0
    )
    OR
    (
      "promotionId" IS NOT NULL
      AND "promotionNameSnapshot" IS NOT NULL
      AND "discountTypeSnapshot" IS NOT NULL
      AND "discountValueSnapshot" IS NOT NULL
      AND "discountAmountCents" > 0
      AND (
        ("discountTypeSnapshot" = 'PERCENT' AND "discountValueSnapshot" BETWEEN 1 AND 99)
        OR
        ("discountTypeSnapshot" = 'FIXED' AND "discountValueSnapshot" > 0)
      )
    )
  ),
  ADD CONSTRAINT "CoursePayment_verification_audited" CHECK (
    ("status" = 'VERIFIED' AND "verifiedAt" IS NOT NULL AND "verifiedByAdminId" IS NOT NULL)
    OR
    ("status" <> 'VERIFIED' AND "verifiedAt" IS NULL AND "verifiedByAdminId" IS NULL)
  );

ALTER TABLE "CoursePaymentSubmission"
  ADD CONSTRAINT "CoursePaymentSubmission_attempt_positive" CHECK ("attemptNumber" > 0),
  ADD CONSTRAINT "CoursePaymentSubmission_amount_positive" CHECK ("amountSentCents" > 0),
  ADD CONSTRAINT "CoursePaymentSubmission_file_valid" CHECK (
    "fileSizeBytes" > 0 AND btrim("proofStoragePath") <> '' AND btrim("mimeType") <> ''
  ),
  ADD CONSTRAINT "CoursePaymentSubmission_review_consistent" CHECK (
    (
      "status" = 'SUBMITTED'
      AND "reviewedAt" IS NULL
      AND "reviewedByAdminId" IS NULL
      AND "rejectionReason" IS NULL
    )
    OR
    (
      "status" = 'ACCEPTED'
      AND "reviewedAt" IS NOT NULL
      AND "reviewedByAdminId" IS NOT NULL
      AND "rejectionReason" IS NULL
    )
    OR
    (
      "status" = 'REJECTED'
      AND "reviewedAt" IS NOT NULL
      AND "reviewedByAdminId" IS NOT NULL
      AND "rejectionReason" IS NOT NULL
      AND btrim("rejectionReason") <> ''
    )
  );

ALTER TABLE "CoursePortalAccess"
  ADD CONSTRAINT "CoursePortalAccess_manual_disable_audited" CHECK (
    "status" = 'ENABLED'
    OR
    (
      "changedByAdminId" IS NOT NULL
      AND "reason" IS NOT NULL
      AND btrim("reason") <> ''
    )
  );

-- ---------------------------------------------------------------------------
-- Partial uniqueness that Prisma cannot express.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "CustomerStudentRelation_one_active_primary_per_student"
  ON "CustomerStudentRelation"("studentId")
  WHERE "isPrimary" = true AND "endedAt" IS NULL AND "archivedAt" IS NULL;

CREATE UNIQUE INDEX "CourseEnrollment_one_normal_active_per_student"
  ON "CourseEnrollment"("studentId")
  WHERE "status" = 'ACTIVE' AND "concurrentEnrollmentOverride" = false;

CREATE UNIQUE INDEX "CoursePayment_one_open_obligation_per_period"
  ON "CoursePayment"("enrollmentId", "periodStart")
  WHERE "status" IN ('PENDING', 'PAST_DUE', 'PROOF_SUBMITTED');

CREATE UNIQUE INDEX "CoursePaymentSubmission_one_under_review_per_payment"
  ON "CoursePaymentSubmission"("paymentId")
  WHERE "status" = 'SUBMITTED';

-- ---------------------------------------------------------------------------
-- Prevent ambiguous pricing. btree_gist is present in the isolated PostgreSQL
-- test runtime and is a supported Supabase extension. [start, end) permits
-- adjacent promotions but rejects every overlapping enabled period.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
SET search_path TO public, extensions;
ALTER TABLE "CoursePromotion"
  ADD CONSTRAINT "CoursePromotion_no_enabled_overlap"
  EXCLUDE USING gist (
    "coursePlanId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE ("enabled" = true);
RESET search_path;

-- ---------------------------------------------------------------------------
-- Approved plan foundation. These rows do not replace CoursePrice and no
-- existing UI reads them in Phase 1.
-- ---------------------------------------------------------------------------
INSERT INTO "CoursePlan" (
  "id", "code", "level", "format", "billingInterval",
  "monthlyPriceCents", "currency", "groupMinimumStudents",
  "groupMaximumStudents", "active", "displayOrder", "updatedAt"
) VALUES
  ('plan_beginner_group', 'BEGINNER_GROUP', 'BEGINNER', 'GROUP', 'MONTHLY', 5000, 'USD', 3, 4, true, 10, CURRENT_TIMESTAMP),
  ('plan_beginner_one_to_one', 'BEGINNER_ONE_TO_ONE', 'BEGINNER', 'ONE_TO_ONE', 'MONTHLY', 7000, 'USD', NULL, NULL, true, 20, CURRENT_TIMESTAMP),
  ('plan_intermediate_group', 'INTERMEDIATE_GROUP', 'INTERMEDIATE', 'GROUP', 'MONTHLY', 5000, 'USD', 3, 4, true, 30, CURRENT_TIMESTAMP),
  ('plan_intermediate_one_to_one', 'INTERMEDIATE_ONE_TO_ONE', 'INTERMEDIATE', 'ONE_TO_ONE', 'MONTHLY', 8500, 'USD', NULL, NULL, true, 40, CURRENT_TIMESTAMP),
  ('plan_advanced_one_to_one', 'ADVANCED_ONE_TO_ONE', 'ADVANCED', 'ONE_TO_ONE', 'MONTHLY', 10000, 'USD', NULL, NULL, true, 50, CURRENT_TIMESTAMP);

-- Match the project's existing deny-all PostgREST posture. Prisma's database
-- role bypasses RLS; anon/authenticated receive no policies on these tables.
ALTER TABLE "public"."Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CustomerStudentRelation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CoursePlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CourseCohort" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CourseCohortSeat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CourseEnrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CoursePromotion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CoursePayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CoursePaymentSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CoursePortalAccess" ENABLE ROW LEVEL SECURITY;
