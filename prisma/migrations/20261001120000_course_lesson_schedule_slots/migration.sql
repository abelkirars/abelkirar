-- Additive scheduling only. No financial, access, seat or marketing mutations.
BEGIN ISOLATION LEVEL SERIALIZABLE;

CREATE TYPE "CourseLessonSlotState" AS ENUM ('LEGACY', 'DRAFT', 'PUBLISHED');
CREATE TABLE "CourseLessonScheduleSlot" (
  "id" TEXT PRIMARY KEY,
  "cohortId" TEXT,
  "enrollmentId" TEXT,
  "teacherAdminId" TEXT,
  "ordinal" SMALLINT NOT NULL,
  "weekday" "CourseWeekday" NOT NULL,
  "localStartMinute" SMALLINT NOT NULL,
  "durationMinutes" SMALLINT NOT NULL,
  "timeZone" VARCHAR(64) NOT NULL,
  "effectiveStartDate" DATE NOT NULL,
  "effectiveEndDate" DATE,
  "state" "CourseLessonSlotState" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMPTZ(3),
  "publishedByAdminId" TEXT,
  "archivedAt" TIMESTAMPTZ(3),
  "createdByAdminId" TEXT,
  "updatedByAdminId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "LessonSlot_owner_xor" CHECK (num_nonnulls("cohortId", "enrollmentId") = 1),
  CONSTRAINT "LessonSlot_ordinal" CHECK (ordinal IN (1,2)),
  CONSTRAINT "LessonSlot_start" CHECK ("localStartMinute" BETWEEN 0 AND 1439),
  CONSTRAINT "LessonSlot_duration" CHECK ("durationMinutes" BETWEEN 15 AND 480),
  CONSTRAINT "LessonSlot_midnight" CHECK ("localStartMinute" + "durationMinutes" <= 1440),
  CONSTRAINT "LessonSlot_dates" CHECK (isfinite("effectiveStartDate") AND ("effectiveEndDate" IS NULL OR (isfinite("effectiveEndDate") AND "effectiveEndDate" >= "effectiveStartDate"))),
  CONSTRAINT "LessonSlot_publication" CHECK (
    (state = 'PUBLISHED' AND "teacherAdminId" IS NOT NULL AND "publishedAt" IS NOT NULL AND "publishedByAdminId" IS NOT NULL AND "timeZone" = 'America/Chicago')
    OR (state <> 'PUBLISHED' AND "publishedAt" IS NULL AND "publishedByAdminId" IS NULL)),
  CONSTRAINT "CourseLessonScheduleSlot_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "CourseCohort"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "CourseLessonScheduleSlot_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "CourseEnrollment"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "CourseLessonScheduleSlot_teacherAdminId_fkey" FOREIGN KEY ("teacherAdminId") REFERENCES "Admin"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "CourseLessonScheduleSlot_publishedByAdminId_fkey" FOREIGN KEY ("publishedByAdminId") REFERENCES "Admin"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "CourseLessonScheduleSlot_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "CourseLessonScheduleSlot_updatedByAdminId_fkey" FOREIGN KEY ("updatedByAdminId") REFERENCES "Admin"(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "CourseLessonScheduleSlot_cohortId_archivedAt_idx" ON "CourseLessonScheduleSlot"("cohortId","archivedAt");
CREATE INDEX "CourseLessonScheduleSlot_enrollmentId_archivedAt_idx" ON "CourseLessonScheduleSlot"("enrollmentId","archivedAt");
CREATE INDEX "LessonSlot_teacher_weekday_state_archive_idx" ON "CourseLessonScheduleSlot"("teacherAdminId",weekday,state,"archivedAt");
CREATE UNIQUE INDEX "LessonSlot_current_cohort_ordinal" ON "CourseLessonScheduleSlot"("cohortId",ordinal) WHERE "archivedAt" IS NULL AND "cohortId" IS NOT NULL;
CREATE UNIQUE INDEX "LessonSlot_current_enrollment_ordinal" ON "CourseLessonScheduleSlot"("enrollmentId",ordinal) WHERE "archivedAt" IS NULL AND "enrollmentId" IS NOT NULL;
ALTER TABLE "CourseLessonScheduleSlot" ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: access goes through the authenticated server DAL.

CREATE FUNCTION "lesson_slot_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- SSI predicate reads below are part of integrity, not merely an optimization.
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'Lesson slot writes require Serializable isolation' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Archive lesson slots; do not delete history' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id,NEW."cohortId",NEW."enrollmentId",NEW.ordinal,NEW."createdAt",NEW."createdByAdminId") IS DISTINCT FROM
       (OLD.id,OLD."cohortId",OLD."enrollmentId",OLD.ordinal,OLD."createdAt",OLD."createdByAdminId") THEN
      RAISE EXCEPTION 'Lesson slot identity is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.state='PUBLISHED' AND
      (to_jsonb(NEW)-'archivedAt'-'updatedAt'-'updatedByAdminId') IS DISTINCT FROM
      (to_jsonb(OLD)-'archivedAt'-'updatedAt'-'updatedByAdminId') THEN
      RAISE EXCEPTION 'Published recurrence is immutable; rescheduling is not supported' USING ERRCODE='23514';
    END IF;
    IF OLD."archivedAt" IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'Archived schedule history is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW."cohortId" IS NOT NULL THEN
    PERFORM 1 FROM "CourseCohort" c JOIN "CoursePlan" p ON p.id=c."coursePlanId"
      WHERE c.id=NEW."cohortId" AND p.format='GROUP' FOR SHARE OF c,p;
  ELSE
    PERFORM 1 FROM "CourseEnrollment" e JOIN "CoursePlan" p ON p.id=e."coursePlanId"
      WHERE e.id=NEW."enrollmentId" AND e."formatSnapshot"='ONE_TO_ONE' AND p.format='ONE_TO_ONE' AND e."cohortId" IS NULL FOR SHARE OF e,p;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid lesson owner format' USING ERRCODE='23514'; END IF;
  -- Avoid evaluating the full timezone catalog for every operational row.
  -- The sole published zone is a known IANA zone; legacy zones still validate.
  IF NEW."timeZone" <> 'America/Chicago' THEN
    IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=NEW."timeZone") THEN
      RAISE EXCEPTION 'Unrecognized lesson timezone' USING ERRCODE='23514';
    END IF;
  END IF;
  IF NEW.state='PUBLISHED' AND NEW."archivedAt" IS NULL THEN
    PERFORM 1 FROM "Admin" WHERE id=NEW."teacherAdminId" AND "isActive" FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Explicit active teacher required' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "LessonSlot_guard" BEFORE INSERT OR UPDATE OR DELETE ON "CourseLessonScheduleSlot"
  FOR EACH ROW EXECUTE FUNCTION "lesson_slot_guard"();

CREATE FUNCTION "lesson_slot_publication_integrity"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n integer; teachers integer; zones integer; days integer; windows integer;
BEGIN
  SELECT count(*),count(DISTINCT "teacherAdminId"),count(DISTINCT "timeZone"),count(DISTINCT weekday),
    count(DISTINCT ROW("effectiveStartDate","effectiveEndDate")) INTO n,teachers,zones,days,windows
  FROM "CourseLessonScheduleSlot" WHERE "archivedAt" IS NULL AND state='PUBLISHED'
    AND ("cohortId"=NEW."cohortId" OR "enrollmentId"=NEW."enrollmentId");
  IF n<>0 AND (n<>2 OR teachers<>1 OR zones<>1 OR days<>2 OR windows<>1) THEN
    RAISE EXCEPTION 'Publish exactly two different weekdays with one teacher, timezone and date window' USING ERRCODE='23514';
  END IF;
  -- Half-open civil intervals; inclusive effective dates must share an actual weekday.
  IF EXISTS (
    SELECT 1 FROM "CourseLessonScheduleSlot" a JOIN "CourseLessonScheduleSlot" b
      ON a.id<b.id AND a."teacherAdminId"=b."teacherAdminId" AND a.weekday=b.weekday
    CROSS JOIN LATERAL (SELECT greatest(a."effectiveStartDate",b."effectiveStartDate") AS first,
      least(coalesce(a."effectiveEndDate",'infinity'::date),coalesce(b."effectiveEndDate",'infinity'::date)) AS last) d
    WHERE a."teacherAdminId"=NEW."teacherAdminId" AND a.state='PUBLISHED' AND b.state='PUBLISHED' AND a."archivedAt" IS NULL AND b."archivedAt" IS NULL
      AND a."localStartMinute" < b."localStartMinute"+b."durationMinutes"
      AND b."localStartMinute" < a."localStartMinute"+a."durationMinutes"
      AND d.first + ((array_position(enum_range(NULL::"CourseWeekday"),a.weekday)-extract(isodow FROM d.first)::int+7)%7) <= d.last
  ) THEN RAISE EXCEPTION 'Teacher recurring lesson conflict' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "LessonSlot_publication_integrity" AFTER INSERT OR UPDATE ON "CourseLessonScheduleSlot"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "lesson_slot_publication_integrity"();

-- Parent edits may not invalidate a schedule through a route that never writes a slot.
CREATE FUNCTION "lesson_slot_parent_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='Admin' THEN
    IF NOT NEW."isActive" AND EXISTS (SELECT 1 FROM "CourseLessonScheduleSlot" WHERE "teacherAdminId"=OLD.id AND state='PUBLISHED' AND "archivedAt" IS NULL) THEN
      RAISE EXCEPTION 'Archive published schedules before deactivating their teacher' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='CoursePlan' THEN
    IF NEW.format IS DISTINCT FROM OLD.format AND EXISTS (
      SELECT 1 FROM "CourseLessonScheduleSlot" s LEFT JOIN "CourseCohort" c ON c.id=s."cohortId" LEFT JOIN "CourseEnrollment" e ON e.id=s."enrollmentId"
      WHERE c."coursePlanId"=OLD.id OR e."coursePlanId"=OLD.id) THEN
      RAISE EXCEPTION 'Scheduled owner format is immutable' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='CourseCohort' THEN
    IF NEW."coursePlanId" IS DISTINCT FROM OLD."coursePlanId" AND EXISTS (SELECT 1 FROM "CourseLessonScheduleSlot" WHERE "cohortId"=OLD.id) THEN
      RAISE EXCEPTION 'Scheduled owner plan is immutable' USING ERRCODE='23514';
    END IF;
    IF ROW(NEW."weeklyDay",NEW."localStartTime",NEW."durationMinutes",NEW."timeZone",NEW."courseStartDate",NEW."courseEndDate") IS DISTINCT FROM
       ROW(OLD."weeklyDay",OLD."localStartTime",OLD."durationMinutes",OLD."timeZone",OLD."courseStartDate",OLD."courseEndDate") AND EXISTS
       (SELECT 1 FROM "CourseLessonScheduleSlot" WHERE "cohortId"=OLD.id AND state='PUBLISHED' AND "archivedAt" IS NULL) THEN
      RAISE EXCEPTION 'Legacy fields cannot edit a published schedule' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME='CourseEnrollment' THEN
    IF ROW(NEW."formatSnapshot",NEW."coursePlanId",NEW."cohortId") IS DISTINCT FROM ROW(OLD."formatSnapshot",OLD."coursePlanId",OLD."cohortId") AND EXISTS
      (SELECT 1 FROM "CourseLessonScheduleSlot" WHERE "enrollmentId"=OLD.id) THEN
      RAISE EXCEPTION 'Scheduled owner identity is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "LessonSlot_admin_guard" BEFORE UPDATE OF "isActive" ON "Admin" FOR EACH ROW EXECUTE FUNCTION "lesson_slot_parent_guard"();
CREATE TRIGGER "LessonSlot_plan_guard" BEFORE UPDATE OF format ON "CoursePlan" FOR EACH ROW EXECUTE FUNCTION "lesson_slot_parent_guard"();
CREATE TRIGGER "LessonSlot_cohort_guard" BEFORE UPDATE ON "CourseCohort" FOR EACH ROW EXECUTE FUNCTION "lesson_slot_parent_guard"();
CREATE TRIGGER "LessonSlot_enrollment_guard" BEFORE UPDATE ON "CourseEnrollment" FOR EACH ROW EXECUTE FUNCTION "lesson_slot_parent_guard"();

-- Backfill block deliberately separable for disposable replay tests; never overwrites.
-- BEGIN LEGACY BACKFILL
DO $$
DECLARE c record; existing "CourseLessonScheduleSlot"%ROWTYPE; expected_archive timestamptz;
BEGIN
  FOR c IN SELECT source.* FROM "CourseCohort" source JOIN "CoursePlan" p ON p.id=source."coursePlanId"
    WHERE p.format='GROUP' AND source."weeklyDay" IS NOT NULL AND source."localStartTime" IS NOT NULL
      AND source."durationMinutes" BETWEEN 15 AND 480 AND source."courseStartDate" IS NOT NULL
      AND isfinite(source."courseStartDate") AND (source."courseEndDate" IS NULL OR (isfinite(source."courseEndDate") AND source."courseEndDate">=source."courseStartDate"))
      AND extract(second FROM source."localStartTime")=0
      AND extract(hour FROM source."localStartTime")*60+extract(minute FROM source."localStartTime")+source."durationMinutes"<=1440
      AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=source."timeZone")
  LOOP
    expected_archive := CASE WHEN c."archivedAt" IS NOT NULL THEN c."archivedAt" AT TIME ZONE 'UTC'
      WHEN c.status IN ('COMPLETED','CANCELLED') THEN c."updatedAt" AT TIME ZONE 'UTC' ELSE NULL END;
    SELECT * INTO existing FROM "CourseLessonScheduleSlot" WHERE id='legacy-cohort:'||c.id||':slot-1';
    IF FOUND THEN
      IF ROW(existing."cohortId",existing."enrollmentId",existing.ordinal,existing.state,existing.weekday,existing."localStartMinute",existing."durationMinutes",existing."timeZone",existing."effectiveStartDate",existing."effectiveEndDate",existing."teacherAdminId",existing."archivedAt") IS DISTINCT FROM
         ROW(c.id,NULL::text,1::smallint,'LEGACY'::"CourseLessonSlotState",c."weeklyDay",(extract(hour FROM c."localStartTime")*60+extract(minute FROM c."localStartTime"))::smallint,c."durationMinutes"::smallint,c."timeZone",c."courseStartDate",c."courseEndDate",NULL::text,expected_archive) THEN
        RAISE EXCEPTION 'Legacy schedule backfill mismatch; manual review required';
      END IF;
      IF existing."createdByAdminId" IS NOT NULL OR existing."updatedByAdminId" IS NOT NULL OR existing."publishedAt" IS NOT NULL OR existing."publishedByAdminId" IS NOT NULL THEN
        RAISE EXCEPTION 'Legacy backfill actor metadata mismatch; manual review required';
      END IF;
    ELSE
      IF EXISTS (SELECT 1 FROM "CourseLessonScheduleSlot" WHERE "cohortId"=c.id AND ordinal=1 AND "archivedAt" IS NULL) THEN
        RAISE EXCEPTION 'Administrator slot exists; do not overwrite';
      END IF;
      INSERT INTO "CourseLessonScheduleSlot" (id,"cohortId",ordinal,weekday,"localStartMinute","durationMinutes","timeZone","effectiveStartDate","effectiveEndDate",state,"archivedAt","createdAt","updatedAt")
      VALUES ('legacy-cohort:'||c.id||':slot-1',c.id,1,c."weeklyDay",extract(hour FROM c."localStartTime")*60+extract(minute FROM c."localStartTime"),c."durationMinutes",c."timeZone",c."courseStartDate",c."courseEndDate",'LEGACY',expected_archive,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    END IF;
  END LOOP;
END $$;
-- END LEGACY BACKFILL
COMMIT;
