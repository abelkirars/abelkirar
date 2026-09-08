-- =============================================================================
-- Course application intake fields: country, lesson language, Kirar model, and
-- the under-15 guardian block.
--
-- PURELY ADDITIVE. Two new enum types and eight new nullable columns. No
-- existing column is altered or dropped, no row is written, no index or
-- constraint changes, and no backfill runs. Applying this migration cannot
-- change the behaviour of anything already deployed.
--
-- The Production table held 0 rows when this was written, and staging holds
-- test rows from the Phase 2 verification. Neither is touched.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums.
--
--    "LessonLanguage" is the language the applicant wants to be TAUGHT in,
--    which is a different fact from CourseApplication."locale" — that one
--    records the language the site was being read in and decides which
--    language we write back in. Someone can read the site in English and want
--    lessons in Amharic, so EITHER is a real answer, not a missing one.
--
--    These are Prisma enums while "locale" stays TEXT on purpose: locale has
--    to track src/i18n/locale.ts's list by hand, and a second declaration of
--    that list in the database would be one more thing to keep in sync. These
--    two closed sets mirror nothing app-side, so the database is the right
--    place to constrain them.
--
--    NONE_YET and UNSURE are both real answers about the instrument. A
--    beginner with no Kirar yet still needs a lesson plan, and knowing they do
--    not have one is what makes that plan possible.
-- ---------------------------------------------------------------------------
CREATE TYPE "LessonLanguage" AS ENUM ('AM', 'EN', 'EITHER');
CREATE TYPE "KirarModel" AS ENUM ('FIVE_STRING', 'SIX_STRING', 'NONE_YET', 'UNSURE');

-- ---------------------------------------------------------------------------
-- 2. Columns.
--
--    EVERY COLUMN HERE IS NULLABLE, AND EVERY ONE OF THEM IS REQUIRED IN
--    VALIDATION INSTEAD. That split is deliberate and is the reason this
--    migration is safe to apply to a table that already has rows:
--
--      - A NOT NULL column needs a default, and any default would assert
--        something about existing rows that nobody ever said. "country = ''"
--        or "isUnder15 = false" are not facts, they are fabrications.
--      - Zod requires a real value on every new submission, so the only rows
--        that can carry NULL are the ones written before the question existed.
--
--    NULL therefore means "this row predates the question", never "the
--    applicant skipped it". It is the same pattern "requestedLevel" already
--    uses, and the same reasoning as "approvedAt" staying NULL for backfilled
--    StudentProfile rows in 20260826120000 rather than fabricating a date.
--
--    "isUnder15" is consequently THREE STATE: true, false, or unknown. Code
--    reading it must compare explicitly (= true / = false / IS NULL) and never
--    rely on truthiness, because treating unknown as "not a child" is the
--    wrong direction for a safeguarding-adjacent flag.
--
--    "guardianConsentAt" is a timestamp rather than a boolean because a
--    timestamp records WHEN consent was given, and its presence already proves
--    that it was. It is generated server-side at the moment of submission and
--    is never accepted from client input — a consent timestamp the applicant
--    can set is not evidence of anything.
--
--    There is deliberately NO "experience" column. The free-text
--    "tell us about your playing so far" field maps onto the existing
--    "applicantMessage", which already carries exactly that meaning. A second
--    near-identical column would split the same data across two places.
--
--    There are deliberately NO emergency-contact columns. Lessons are online
--    and one-to-one; for under-15s "guardianPhone" already fills that role,
--    and for adults it is pure friction on the highest-drop-off screen.
-- ---------------------------------------------------------------------------
ALTER TABLE "CourseApplication"
    ADD COLUMN "country" TEXT,
    ADD COLUMN "lessonLanguage" "LessonLanguage",
    ADD COLUMN "kirarModel" "KirarModel",
    ADD COLUMN "isUnder15" BOOLEAN,
    ADD COLUMN "guardianName" TEXT,
    ADD COLUMN "guardianRelationship" TEXT,
    ADD COLUMN "guardianPhone" TEXT,
    ADD COLUMN "guardianConsentAt" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security.
--
--    Nothing to do. "CourseApplication" already has RLS enabled with zero
--    policies from 20260826120000, and that posture covers columns added
--    later. Recorded here only so the absence is visibly a decision rather
--    than an oversight — these new columns include a child's guardian's name
--    and phone number, which is exactly the kind of data that posture exists
--    for.
-- ---------------------------------------------------------------------------
