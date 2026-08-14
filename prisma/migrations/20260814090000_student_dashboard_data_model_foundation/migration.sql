-- Stage 2 data model foundation for the Student Dashboard MVP.
-- Purely additive: new tables, new nullable/defaulted columns on existing
-- tables, one new enum. No DROP, no NOT NULL added to an existing column,
-- no enum values removed. WeeklyPractice's existing fields, status
-- workflow, and reopen mechanism are all preserved unchanged. No
-- application code reads or writes any of this yet.

-- CreateEnum
CREATE TYPE "StudentMilestoneStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'ACHIEVED');

-- AlterTable: WeeklyPractice — hybrid assignment model additions
ALTER TABLE "WeeklyPractice" ADD COLUMN "internalCurriculumRef" TEXT;
ALTER TABLE "WeeklyPractice" ADD COLUMN "currentTechnique" TEXT;
ALTER TABLE "WeeklyPractice" ADD COLUMN "recordingRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WeeklyPractice" ADD COLUMN "feedbackStatus" TEXT;

-- AlterTable: WeeklyPracticeAttachment — recording-specific additions
ALTER TABLE "WeeklyPracticeAttachment" ADD COLUMN "label" TEXT;
ALTER TABLE "WeeklyPracticeAttachment" ADD COLUMN "isMilestoneMarker" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: StudentProfile — teacher association (one field, not a feature)
ALTER TABLE "StudentProfile" ADD COLUMN "teacherId" TEXT;

-- CreateTable: StudentNote
CREATE TABLE "StudentNote" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "weeklyPracticeId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TeacherPrivateNote
CREATE TABLE "TeacherPrivateNote" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherPrivateNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Milestone
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "level" "StudentLevel" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "internalCriteria" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable: StudentMilestone
CREATE TABLE "StudentMilestone" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "status" "StudentMilestoneStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "achievedAt" TIMESTAMP(3),
    "teacherComment" TEXT,
    "signedOffById" TEXT,

    CONSTRAINT "StudentMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentNote_studentId_createdAt_idx" ON "StudentNote"("studentId", "createdAt");
CREATE INDEX "StudentNote_weeklyPracticeId_idx" ON "StudentNote"("weeklyPracticeId");
CREATE INDEX "TeacherPrivateNote_studentId_createdAt_idx" ON "TeacherPrivateNote"("studentId", "createdAt");
CREATE INDEX "Milestone_level_sortOrder_idx" ON "Milestone"("level", "sortOrder");
CREATE UNIQUE INDEX "StudentMilestone_studentId_milestoneId_key" ON "StudentMilestone"("studentId", "milestoneId");
CREATE INDEX "StudentMilestone_studentId_status_idx" ON "StudentMilestone"("studentId", "status");

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StudentNote" ADD CONSTRAINT "StudentNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentNote" ADD CONSTRAINT "StudentNote_weeklyPracticeId_fkey" FOREIGN KEY ("weeklyPracticeId") REFERENCES "WeeklyPractice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TeacherPrivateNote" ADD CONSTRAINT "TeacherPrivateNote_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeacherPrivateNote" ADD CONSTRAINT "TeacherPrivateNote_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentMilestone" ADD CONSTRAINT "StudentMilestone_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentMilestone" ADD CONSTRAINT "StudentMilestone_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentMilestone" ADD CONSTRAINT "StudentMilestone_signedOffById_fkey" FOREIGN KEY ("signedOffById") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row Level Security: match the deny-all, zero-policy posture already
-- applied to every other table (see 20260729001047_enable_rls_deny_all).
-- Defense-in-depth only — the app's own Prisma connection uses the
-- postgres role (BYPASSRLS) and real authorization is enforced entirely in
-- application code (src/lib/student/dal.ts, src/lib/admin/dal.ts). New
-- tables already get zero default anon/authenticated grants via that
-- migration's ALTER DEFAULT PRIVILEGES statement; this adds the matching
-- RLS-enabled layer explicitly rather than leaving these 4 tables the only
-- ones without it (the gap OrderNotificationLog fell into once already).
ALTER TABLE "StudentNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TeacherPrivateNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Milestone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentMilestone" ENABLE ROW LEVEL SECURITY;
