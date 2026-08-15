import { prisma } from "@/lib/db";
import type { StudentSessionPayload } from "@/lib/student/dal";

/**
 * Student-facing data access layer — the authorization shape every later
 * stage of the Student Dashboard MVP builds on.
 *
 * Every exported function here takes the FULL session object, never a bare
 * studentId and never any other caller-supplied identifier — every query's
 * studentId comes exclusively from session.studentId. There is no
 * parameter through which a route could pass through a client-supplied id
 * instead; the only way to obtain a valid session is requireStudentApi()/
 * requireStudentPage() (src/lib/student/dal.ts), which re-verify against
 * Supabase and the DB on every call.
 *
 * Every query below uses an explicit `select` naming only the fields a
 * student may see — never `include`, and never a bare model query with no
 * select. WeeklyPractice specifically carries three admin-only fields
 * (teacherNotes, internalCurriculumRef, currentTechnique) — see the
 * SECURITY NOTE on that model in prisma/schema.prisma. Milestone data is
 * reached exclusively by querying StudentMilestone (scoped to this
 * student) and selecting the related Milestone through that relation —
 * this file never calls prisma.milestone.* directly, which is what makes a
 * milestone with no StudentMilestone row for a given student structurally
 * unreachable, not just conventionally hidden.
 *
 * TeacherPrivateNote has no function here at all, deliberately — nothing in
 * this file may ever read it. See CLAUDE.md hard rules.
 */

export class StudentAuthorizationError extends Error {}

/**
 * Thrown by submitCurrentAssignment for expected, student-facing refusals —
 * the route surfaces `.message` directly rather than a generic failure, and
 * uses `.code` to pick the HTTP status. See submitCurrentAssignment for what
 * each code means.
 */
export class AssignmentSubmissionError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "ALREADY_SUBMITTED" | "RECORDING_REQUIRED"
  ) {
    super(message);
  }
}

/**
 * Statuses that mean "already submitted, not resubmittable without an admin
 * reopen." Exported so the dashboard page can decide whether to render the
 * submit form at all — that's a UX nicety only; submitCurrentAssignment
 * enforces the same rule server-side regardless of what the page renders.
 */
export const SUBMITTED_ASSIGNMENT_STATUSES = ["SUBMITTED", "REVIEWED", "COMPLETED"] as const;

/** Fields a student may see on the Milestone catalog, reached only through
 *  StudentMilestone. Excludes internalCriteria, sortOrder, active. */
const SAFE_MILESTONE_SELECT = {
  id: true,
  level: true,
  label: true,
  description: true,
} as const;

/** Fields a student may see on their own WeeklyPractice row. Excludes
 *  teacherNotes, internalCurriculumRef, currentTechnique, createdById,
 *  reopenedAt, reopenCount — all admin-only. */
const SAFE_WEEKLY_PRACTICE_SELECT = {
  id: true,
  weekTitle: true,
  weekStartDate: true,
  weekEndDate: true,
  instructions: true,
  goals: true,
  recordingRequired: true,
  status: true,
  studentSubmission: true,
  submittedAt: true,
  adminFeedback: true,
  feedbackStatus: true,
  feedbackAt: true,
} as const;

/**
 * The student's current (most recently started) assignment, or null. The
 * weekStartDate <= now() filter is what makes "never the next lesson"
 * structurally true — a future-dated row an admin pre-created simply never
 * matches this query until its date arrives, not something hidden in a UI.
 */
export async function getCurrentAssignment(session: StudentSessionPayload) {
  return prisma.weeklyPractice.findFirst({
    where: { studentId: session.studentId, weekStartDate: { lte: new Date() } },
    orderBy: { weekStartDate: "desc" },
    select: SAFE_WEEKLY_PRACTICE_SELECT,
  });
}

/**
 * All of the calling student's own VISIBLE notes, most recent first.
 * visibleToStudent: true is part of the where clause, not a post-filter —
 * a hidden (teacher-authored) row must never even leave the database for
 * this student, let alone reach a select. See the StudentNote model
 * comment in prisma/schema.prisma for what visibleToStudent is for.
 */
export async function listMyNotes(session: StudentSessionPayload) {
  return prisma.studentNote.findMany({
    where: { studentId: session.studentId, visibleToStudent: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, body: true, createdAt: true, weeklyPracticeId: true },
  });
}

/**
 * Adds a note under the calling student's own id. If linked to a
 * WeeklyPractice, verifies that row actually belongs to this student first
 * — a client-supplied weeklyPracticeId is never trusted blindly, even
 * though it only ever links a note, since a wrong link would still let a
 * student's note attach to (and imply knowledge of) another student's
 * assignment.
 *
 * visibleToStudent is hardcoded true here, not a parameter — there is no
 * way for a student to write a hidden note about themselves through this
 * function. A false row can only ever come from a teacher-facing write
 * path, which does not exist yet.
 */
export async function addMyNote(
  session: StudentSessionPayload,
  input: { body: string; weeklyPracticeId?: string }
) {
  if (input.weeklyPracticeId) {
    const owns = await prisma.weeklyPractice.findFirst({
      where: { id: input.weeklyPracticeId, studentId: session.studentId },
      select: { id: true },
    });
    if (!owns) {
      throw new StudentAuthorizationError(
        "Cannot attach a note to an assignment that isn't yours"
      );
    }
  }

  return prisma.studentNote.create({
    data: {
      studentId: session.studentId,
      body: input.body,
      weeklyPracticeId: input.weeklyPracticeId ?? null,
      visibleToStudent: true,
    },
    select: { id: true, body: true, createdAt: true, weeklyPracticeId: true },
  });
}

/**
 * Every milestone ever assigned to this student, achieved or not — reached
 * only via StudentMilestone, never prisma.milestone directly.
 */
export async function listMyMilestones(session: StudentSessionPayload) {
  return prisma.studentMilestone.findMany({
    where: { studentId: session.studentId },
    orderBy: { assignedAt: "asc" },
    select: {
      id: true,
      status: true,
      assignedAt: true,
      achievedAt: true,
      teacherComment: true,
      milestone: { select: SAFE_MILESTONE_SELECT },
    },
  });
}

/** The student's current (in-progress or submitted) milestone, or null. */
export async function getCurrentMilestone(session: StudentSessionPayload) {
  return prisma.studentMilestone.findFirst({
    where: { studentId: session.studentId, status: { in: ["IN_PROGRESS", "SUBMITTED"] } },
    orderBy: { assignedAt: "desc" },
    select: {
      id: true,
      status: true,
      assignedAt: true,
      milestone: { select: SAFE_MILESTONE_SELECT },
    },
  });
}

/**
 * Achieved milestones, most recently achieved first, with the teacher's
 * comment — per the spec's "achieved milestones with dates and teacher
 * comment."
 */
export async function listAchievedMilestones(session: StudentSessionPayload) {
  return prisma.studentMilestone.findMany({
    where: { studentId: session.studentId, status: "ACHIEVED" },
    orderBy: { achievedAt: "desc" },
    select: {
      id: true,
      achievedAt: true,
      teacherComment: true,
      milestone: { select: SAFE_MILESTONE_SELECT },
    },
  });
}

/** All of the calling student's own practice log entries, most recent
 *  practice first. PracticeLogEntry carries no admin-only field — nothing to
 *  exclude here beyond studentId itself, same situation as StudentNote. */
export async function listMyPracticeLogEntries(session: StudentSessionPayload) {
  return prisma.practiceLogEntry.findMany({
    where: { studentId: session.studentId },
    orderBy: { practicedAt: "desc" },
    select: {
      id: true,
      practicedAt: true,
      durationMinutes: true,
      focus: true,
      selfRating: true,
      weeklyPracticeId: true,
    },
  });
}

/**
 * Records a practice log entry under the calling student's own id.
 * weeklyPracticeId is never taken from the caller — it is always inferred
 * as the student's current assignment (getCurrentAssignment) at write time,
 * or null if there isn't one right now. This mirrors addMyNote's ownership
 * check but goes one step further: there is no client-supplied
 * weeklyPracticeId parameter to validate at all, so there is nothing for a
 * caller to get wrong or spoof.
 */
export async function addMyPracticeLogEntry(
  session: StudentSessionPayload,
  input: { practicedAt: Date; durationMinutes: number; focus: string; selfRating?: string }
) {
  const currentAssignment = await getCurrentAssignment(session);

  return prisma.practiceLogEntry.create({
    data: {
      studentId: session.studentId,
      weeklyPracticeId: currentAssignment?.id ?? null,
      practicedAt: input.practicedAt,
      durationMinutes: input.durationMinutes,
      focus: input.focus,
      selfRating: input.selfRating ?? null,
    },
    select: {
      id: true,
      practicedAt: true,
      durationMinutes: true,
      focus: true,
      selfRating: true,
      weeklyPracticeId: true,
    },
  });
}

/**
 * Submits the student's current assignment. Two refusals, each with its own
 * plain, student-facing message (never a generic failure):
 *
 * - Already SUBMITTED/REVIEWED/COMPLETED: there is no separate resubmission
 *   system. The only way back to a submittable state is an admin using the
 *   existing WeeklyPractice.reopenedAt/reopenCount mechanism to move status
 *   back to IN_PROGRESS — this function only ever reads `status` to decide
 *   eligibility, so a reopened row becomes submittable again automatically,
 *   with no special-casing needed here.
 * - recordingRequired is true: recording upload doesn't exist until Stage 8,
 *   so this is refused unconditionally, every time, for every such
 *   assignment, until that stage ships. This is a missing feature, not a
 *   validation failure — the message says so, and the route must not turn
 *   it into a generic error. Do not fake, stub, or bypass this check.
 */
export async function submitCurrentAssignment(
  session: StudentSessionPayload,
  input: { studentSubmission: string }
) {
  const assignment = await getCurrentAssignment(session);

  if (!assignment) {
    throw new AssignmentSubmissionError("No assignment to submit.", "NOT_FOUND");
  }

  if ((SUBMITTED_ASSIGNMENT_STATUSES as readonly string[]).includes(assignment.status)) {
    throw new AssignmentSubmissionError(
      "This assignment has already been submitted. Ask your teacher to reopen it before submitting again.",
      "ALREADY_SUBMITTED"
    );
  }

  if (assignment.recordingRequired) {
    throw new AssignmentSubmissionError(
      "This assignment requires a recording, and recording upload isn't available yet. Ask your teacher for guidance.",
      "RECORDING_REQUIRED"
    );
  }

  return prisma.weeklyPractice.update({
    where: { id: assignment.id },
    data: {
      studentSubmission: input.studentSubmission,
      submittedAt: new Date(),
      status: "SUBMITTED",
    },
    select: SAFE_WEEKLY_PRACTICE_SELECT,
  });
}
