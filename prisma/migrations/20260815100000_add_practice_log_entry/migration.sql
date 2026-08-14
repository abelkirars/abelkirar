-- PracticeLogEntry: a Stage 2 continuation for the Student Dashboard MVP.
-- Purely additive — one new table plus two new back-relation arrays (no SQL
-- impact from those). No application code reads or writes this yet.

CREATE TABLE "PracticeLogEntry" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "weeklyPracticeId" TEXT,
    "practicedAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "focus" TEXT NOT NULL,
    "selfRating" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PracticeLogEntry_studentId_practicedAt_idx" ON "PracticeLogEntry"("studentId", "practicedAt");
CREATE INDEX "PracticeLogEntry_weeklyPracticeId_idx" ON "PracticeLogEntry"("weeklyPracticeId");

-- AddForeignKey
ALTER TABLE "PracticeLogEntry" ADD CONSTRAINT "PracticeLogEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeLogEntry" ADD CONSTRAINT "PracticeLogEntry_weeklyPracticeId_fkey" FOREIGN KEY ("weeklyPracticeId") REFERENCES "WeeklyPractice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row Level Security: same deny-all, zero-policy posture as every other
-- table (see 20260729001047_enable_rls_deny_all and
-- 20260814090000_student_dashboard_data_model_foundation). Defense in
-- depth only — real authorization is application code
-- (src/lib/student/dal.ts, src/lib/student/queries.ts).
ALTER TABLE "PracticeLogEntry" ENABLE ROW LEVEL SECURITY;
