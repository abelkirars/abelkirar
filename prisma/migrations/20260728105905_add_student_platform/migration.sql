-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STUDENT');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "StudentLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "WeeklyPracticeStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'REVIEWED', 'COMPLETED', 'MISSED');

-- CreateEnum
CREATE TYPE "AttachmentUploadedBy" AS ENUM ('ADMIN', 'STUDENT');

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL,
    "supabaseUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "level" "StudentLevel",
    "enrollmentDate" TIMESTAMP(3),
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyPractice" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "weekTitle" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "weekEndDate" TIMESTAMP(3) NOT NULL,
    "instructions" TEXT,
    "goals" TEXT,
    "teacherNotes" TEXT,
    "status" "WeeklyPracticeStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "studentSubmission" TEXT,
    "submittedAt" TIMESTAMP(3),
    "adminFeedback" TEXT,
    "feedbackAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "reopenCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyPractice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyPracticeAttachment" (
    "id" TEXT NOT NULL,
    "weeklyPracticeId" TEXT NOT NULL,
    "uploadedBy" "AttachmentUploadedBy" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyPracticeAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyLog" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "attendanceSummary" TEXT,
    "practiceConsistency" TEXT,
    "skillsPracticed" TEXT,
    "strengths" TEXT,
    "areasForImprovement" TEXT,
    "teacherComments" TEXT,
    "studentComments" TEXT,
    "progressRating" INTEGER,
    "goalsNextMonth" TEXT,
    "publishedToStudent" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyLogAttachment" (
    "id" TEXT NOT NULL,
    "monthlyLogId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlyLogAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_supabaseUserId_key" ON "StudentProfile"("supabaseUserId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_email_key" ON "StudentProfile"("email");

-- CreateIndex
CREATE INDEX "StudentProfile_status_idx" ON "StudentProfile"("status");

-- CreateIndex
CREATE INDEX "WeeklyPractice_studentId_weekStartDate_idx" ON "WeeklyPractice"("studentId", "weekStartDate");

-- CreateIndex
CREATE INDEX "WeeklyPractice_status_idx" ON "WeeklyPractice"("status");

-- CreateIndex
CREATE INDEX "WeeklyPracticeAttachment_weeklyPracticeId_idx" ON "WeeklyPracticeAttachment"("weeklyPracticeId");

-- CreateIndex
CREATE INDEX "MonthlyLog_studentId_year_month_idx" ON "MonthlyLog"("studentId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyLog_studentId_month_year_key" ON "MonthlyLog"("studentId", "month", "year");

-- CreateIndex
CREATE INDEX "MonthlyLogAttachment_monthlyLogId_idx" ON "MonthlyLogAttachment"("monthlyLogId");

-- AddForeignKey
ALTER TABLE "WeeklyPractice" ADD CONSTRAINT "WeeklyPractice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPractice" ADD CONSTRAINT "WeeklyPractice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPracticeAttachment" ADD CONSTRAINT "WeeklyPracticeAttachment_weeklyPracticeId_fkey" FOREIGN KEY ("weeklyPracticeId") REFERENCES "WeeklyPractice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyLog" ADD CONSTRAINT "MonthlyLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyLog" ADD CONSTRAINT "MonthlyLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyLogAttachment" ADD CONSTRAINT "MonthlyLogAttachment_monthlyLogId_fkey" FOREIGN KEY ("monthlyLogId") REFERENCES "MonthlyLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

