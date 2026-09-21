\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM "CoursePlan") <> 5 THEN
    RAISE EXCEPTION 'expected exactly five foundation plans';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'
  ) THEN
    RAISE EXCEPTION 'btree_gist is not installed';
  END IF;
  IF (
    SELECT count(*)
    FROM pg_class
    WHERE relname IN (
      'Customer', 'CustomerStudentRelation', 'CoursePlan', 'CourseCohort',
      'CourseCohortSeat', 'CourseEnrollment', 'CoursePromotion',
      'CoursePayment', 'CoursePaymentSubmission', 'CoursePortalAccess'
    ) AND relrowsecurity
  ) <> 10 THEN
    RAISE EXCEPTION 'every Phase 1 table must have RLS enabled';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname IN (
      'CustomerStudentRelation_customerId_fkey',
      'CustomerStudentRelation_studentId_fkey',
      'CourseCohort_coursePlanId_fkey',
      'CourseCohortSeat_cohortId_fkey',
      'CourseEnrollment_studentId_fkey',
      'CourseEnrollment_customerId_fkey',
      'CourseEnrollment_coursePlanId_fkey',
      'CourseEnrollment_applicationId_fkey',
      'CourseEnrollment_cohortId_fkey',
      'CourseEnrollment_overrideByAdminId_fkey',
      'CoursePromotion_coursePlanId_fkey',
      'CoursePayment_enrollmentId_fkey',
      'CoursePayment_promotionId_fkey',
      'CoursePayment_verifiedByAdminId_fkey',
      'CoursePayment_supersedesPaymentId_fkey',
      'CoursePaymentSubmission_paymentId_fkey',
      'CoursePaymentSubmission_reviewedByAdminId_fkey',
      'CoursePortalAccess_enrollmentId_fkey',
      'CoursePortalAccess_changedByAdminId_fkey',
      'Order_customerId_fkey',
      'CourseApplication_customerId_fkey',
      'CourseApplication_requestedPlanId_fkey'
    ) AND confdeltype <> 'r'
  ) THEN
    RAISE EXCEPTION 'a historical Phase 1 foreign key is not ON DELETE RESTRICT';
  END IF;
  IF (
    SELECT confdeltype FROM pg_constraint
    WHERE conname = 'CourseCohortSeat_currentEnrollmentId_fkey'
  ) <> 'n' THEN
    RAISE EXCEPTION 'the operational current-seat pointer must be ON DELETE SET NULL';
  END IF;
END $$;

INSERT INTO "Admin" (
  "id", "username", "passwordHash", "displayName", "isActive", "createdAt"
) VALUES (
  'phase1_admin', 'phase1-admin', 'not-a-real-hash', 'Phase 1 Admin', true, CURRENT_TIMESTAMP
);

INSERT INTO "StudentProfile" (
  "id", "supabaseUserId", "email", "fullName", "createdAt", "updatedAt"
) VALUES (
  'phase1_student', 'phase1-supabase-student', 'student@example.test',
  'Phase 1 Student', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "Customer" (
  "id", "supabaseUserId", "email", "emailNormalized", "emailVerifiedAt",
  "emailSyncedAt", "createdAt", "updatedAt"
) VALUES
  (
    'phase1_customer', '00000000-0000-0000-0000-000000000001',
    'Student@Example.test', 'student@example.test', CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'phase1_customer_same_email', '00000000-0000-0000-0000-000000000002',
    'student@example.test', 'student@example.test', CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

-- emailNormalized is searchable but deliberately not globally unique.
DO $$
BEGIN
  IF (SELECT count(*) FROM "Customer" WHERE "emailNormalized" = 'student@example.test') <> 2 THEN
    RAISE EXCEPTION 'Customer email must not be the security identity';
  END IF;
END $$;

INSERT INTO "CustomerStudentRelation" (
  "id", "customerId", "studentId", "type", "isPrimary", "createdAt", "updatedAt"
) VALUES (
  'phase1_relation', 'phase1_customer', 'phase1_student', 'SELF', true,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

DO $$
BEGIN
  INSERT INTO "CustomerStudentRelation" (
    "id", "customerId", "studentId", "type", "isPrimary", "createdAt", "updatedAt"
  ) VALUES (
    'phase1_second_primary', 'phase1_customer_same_email', 'phase1_student',
    'GUARDIAN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );
  RAISE EXCEPTION 'expected the active-primary relationship constraint';
EXCEPTION WHEN unique_violation THEN
  NULL;
END $$;

INSERT INTO "CourseEnrollment" (
  "id", "studentId", "customerId", "coursePlanId", "status",
  "levelSnapshot", "formatSnapshot", "planCodeSnapshot", "createdAt", "updatedAt"
) VALUES (
  'phase1_enrollment', 'phase1_student', 'phase1_customer',
  'plan_advanced_one_to_one', 'ACTIVE', 'ADVANCED', 'ONE_TO_ONE',
  'ADVANCED_ONE_TO_ONE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

DO $$
BEGIN
  INSERT INTO "CourseEnrollment" (
    "id", "studentId", "customerId", "coursePlanId", "status",
    "levelSnapshot", "formatSnapshot", "planCodeSnapshot", "createdAt", "updatedAt"
  ) VALUES (
    'phase1_second_normal_active', 'phase1_student', 'phase1_customer',
    'plan_beginner_one_to_one', 'ACTIVE', 'BEGINNER', 'ONE_TO_ONE',
    'BEGINNER_ONE_TO_ONE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );
  RAISE EXCEPTION 'expected the one-normal-active-enrollment constraint';
EXCEPTION WHEN unique_violation THEN
  NULL;
END $$;

-- The future override shape is valid only with a complete admin audit.
INSERT INTO "CourseEnrollment" (
  "id", "studentId", "customerId", "coursePlanId", "status",
  "levelSnapshot", "formatSnapshot", "planCodeSnapshot",
  "concurrentEnrollmentOverride", "overrideReason", "overrideByAdminId",
  "overrideAt", "createdAt", "updatedAt"
) VALUES (
  'phase1_override_enrollment', 'phase1_student', 'phase1_customer',
  'plan_beginner_one_to_one', 'ACTIVE', 'BEGINNER', 'ONE_TO_ONE',
  'BEGINNER_ONE_TO_ONE', true, 'Foundation constraint test', 'phase1_admin',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "CourseCohort" (
  "id", "coursePlanId", "code", "name", "status", "weeklyDay",
  "localStartTime", "durationMinutes", "timeZone", "courseStartDate",
  "courseEndDate", "createdAt", "updatedAt"
) VALUES (
  'phase1_cohort', 'plan_beginner_group', 'PHASE1_GROUP', 'Phase 1 Group',
  'OPEN', 'SATURDAY', TIME '18:00', 60, 'America/New_York',
  DATE '2026-10-10', DATE '2027-01-10', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "CourseEnrollment" (
  "id", "studentId", "customerId", "coursePlanId", "cohortId", "status",
  "levelSnapshot", "formatSnapshot", "planCodeSnapshot", "createdAt", "updatedAt"
) VALUES (
  'phase1_group_reservation', 'phase1_student', 'phase1_customer',
  'plan_beginner_group', 'phase1_cohort', 'PENDING_PAYMENT', 'BEGINNER',
  'GROUP', 'BEGINNER_GROUP', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "CourseCohortSeat" (
  "id", "cohortId", "position", "currentEnrollmentId", "reservedUntil",
  "assignedAt", "createdAt", "updatedAt"
) VALUES (
  'phase1_seat', 'phase1_cohort', 1, 'phase1_group_reservation',
  CURRENT_TIMESTAMP + interval '7 days', CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

-- Releasing an operational seat does not clear durable cohort membership.
UPDATE "CourseCohortSeat"
SET "currentEnrollmentId" = NULL, "reservedUntil" = NULL,
    "assignedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'phase1_seat';

DO $$
BEGIN
  IF (SELECT "cohortId" FROM "CourseEnrollment" WHERE "id" = 'phase1_group_reservation') <> 'phase1_cohort' THEN
    RAISE EXCEPTION 'seat release destroyed cohort membership history';
  END IF;
END $$;

INSERT INTO "CoursePromotion" (
  "id", "coursePlanId", "name", "discountType", "discountValue",
  "startsAt", "endsAt", "createdAt", "updatedAt"
) VALUES (
  'phase1_promotion', 'plan_beginner_group', 'October offer', 'PERCENT', 10,
  TIMESTAMP '2026-10-01 00:00:00', TIMESTAMP '2026-11-01 00:00:00',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

DO $$
BEGIN
  INSERT INTO "CoursePromotion" (
    "id", "coursePlanId", "name", "discountType", "discountValue",
    "startsAt", "endsAt", "createdAt", "updatedAt"
  ) VALUES (
    'phase1_overlap', 'plan_beginner_group', 'Overlapping offer', 'PERCENT', 15,
    TIMESTAMP '2026-10-15 00:00:00', TIMESTAMP '2026-11-15 00:00:00',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );
  RAISE EXCEPTION 'expected overlapping promotion exclusion';
EXCEPTION WHEN exclusion_violation THEN
  NULL;
END $$;

-- Adjacent [start, end) periods are valid.
INSERT INTO "CoursePromotion" (
  "id", "coursePlanId", "name", "discountType", "discountValue",
  "startsAt", "endsAt", "createdAt", "updatedAt"
) VALUES (
  'phase1_adjacent', 'plan_beginner_group', 'November offer', 'FIXED', 500,
  TIMESTAMP '2026-11-01 00:00:00', TIMESTAMP '2026-12-01 00:00:00',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "CoursePayment" (
  "id", "enrollmentId", "kind", "periodStart", "periodEnd", "expiresAt",
  "status", "baseAmountCents", "discountAmountCents", "finalAmountCents",
  "createdAt", "updatedAt"
) VALUES (
  'phase1_payment', 'phase1_enrollment', 'INITIAL_ENROLLMENT',
  DATE '2026-09-21', DATE '2026-10-21', TIMESTAMP '2026-09-28 10:00:00',
  'PENDING', 10000, 0, 10000, TIMESTAMP '2026-09-21 10:00:00',
  TIMESTAMP '2026-09-21 10:00:00'
);

DO $$
BEGIN
  INSERT INTO "CoursePayment" (
    "id", "enrollmentId", "kind", "periodStart", "periodEnd", "dueAt",
    "expiresAt", "status", "baseAmountCents", "discountAmountCents",
    "finalAmountCents", "createdAt", "updatedAt"
  ) VALUES (
    'phase1_invalid_initial', 'phase1_enrollment', 'INITIAL_ENROLLMENT',
    DATE '2026-10-21', DATE '2026-11-21', TIMESTAMP '2026-10-22 10:00:00',
    TIMESTAMP '2026-10-28 10:00:00', 'PENDING', 10000, 0, 10000,
    TIMESTAMP '2026-10-21 10:00:00', TIMESTAMP '2026-10-21 10:00:00'
  );
  RAISE EXCEPTION 'expected initial-payment timing constraint';
EXCEPTION WHEN check_violation THEN
  NULL;
END $$;

INSERT INTO "CoursePaymentSubmission" (
  "id", "paymentId", "attemptNumber", "method", "amountSentCents",
  "proofStoragePath", "mimeType", "fileSizeBytes", "submittedAt",
  "createdAt", "updatedAt"
) VALUES (
  'phase1_submission', 'phase1_payment', 1, 'ZELLE', 10000,
  'phase1/proof.png', 'image/png', 100, CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

DO $$
BEGIN
  INSERT INTO "CoursePaymentSubmission" (
    "id", "paymentId", "attemptNumber", "method", "amountSentCents",
    "proofStoragePath", "mimeType", "fileSizeBytes", "submittedAt",
    "createdAt", "updatedAt"
  ) VALUES (
    'phase1_second_submission', 'phase1_payment', 2, 'CASH_APP', 10000,
    'phase1/proof-2.png', 'image/png', 100, CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );
  RAISE EXCEPTION 'expected one-submission-under-review constraint';
EXCEPTION WHEN unique_violation THEN
  NULL;
END $$;

-- Core business and financial parents are protected from physical deletion.
DO $$
BEGIN
  DELETE FROM "Customer" WHERE "id" = 'phase1_customer';
  RAISE EXCEPTION 'expected Customer delete restriction';
EXCEPTION WHEN foreign_key_violation THEN
  NULL;
END $$;

DO $$
BEGIN
  DELETE FROM "StudentProfile" WHERE "id" = 'phase1_student';
  RAISE EXCEPTION 'expected StudentProfile delete restriction';
EXCEPTION WHEN foreign_key_violation THEN
  NULL;
END $$;

DO $$
BEGIN
  DELETE FROM "CourseEnrollment" WHERE "id" = 'phase1_enrollment';
  RAISE EXCEPTION 'expected enrollment delete restriction';
EXCEPTION WHEN foreign_key_violation THEN
  NULL;
END $$;

ROLLBACK;
