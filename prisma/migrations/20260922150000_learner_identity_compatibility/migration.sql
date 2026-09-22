-- Preserve all learner identity values and UNIQUE indexes; PostgreSQL allows
-- multiple NULLs in these existing ordinary UNIQUE indexes.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "StudentProfile"
  ALTER COLUMN "supabaseUserId" DROP NOT NULL,
  ALTER COLUMN "email" DROP NOT NULL;

-- Remove only the lifetime one-application-per-learner restriction.
-- The FK and CourseEnrollment.applicationId uniqueness remain unchanged.
DROP INDEX "CourseApplication_studentProfileId_key";
CREATE INDEX "CourseApplication_studentProfileId_idx"
  ON "CourseApplication"("studentProfileId");

COMMIT;
