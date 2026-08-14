import { z } from "zod";
import { strictBoolean } from "@/lib/validations/boolean";

// SUBMITTED / REVIEWED / COMPLETED are set by the student-submission and
// teacher-review workflows (later stages), never by this admin
// create/edit form — offering them here would let an admin silently
// overwrite a status that real events (a submission, a review) produced.
export const WEEKLY_PRACTICE_ADMIN_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "MISSED"] as const;

function isMonday(dateStr: string): boolean {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay() === 1;
}

export const weeklyPracticeSchema = z.object({
  weekTitle: z.string().min(1).max(200),
  // There is no separate "publish" action — weekStartDate alone controls
  // visibility (see getCurrentAssignment in src/lib/student/queries.ts,
  // which filters on weekStartDate <= now()). Enforcing Monday here too,
  // not just client-side, since a request could bypass the form's snapping.
  weekStartDate: z.iso.date().refine(isMonday, "Week start date must be a Monday"),
  instructions: z.string().max(4000).optional().or(z.literal("")),
  goals: z.string().max(1000).optional().or(z.literal("")),
  recordingRequired: strictBoolean(false),
  // Admin-only — never returned to a student client. See the SECURITY NOTE
  // on WeeklyPractice in prisma/schema.prisma.
  internalCurriculumRef: z.string().max(200).optional().or(z.literal("")),
  currentTechnique: z.string().max(200).optional().or(z.literal("")),
  teacherNotes: z.string().max(4000).optional().or(z.literal("")),
  // Edit only — the create route always writes NOT_STARTED regardless of
  // what (if anything) is sent here.
  status: z.enum(WEEKLY_PRACTICE_ADMIN_STATUSES).optional(),
});

export type WeeklyPracticeInput = z.infer<typeof weeklyPracticeSchema>;
