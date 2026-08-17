import { prisma } from "@/lib/db";
import type { StudentSessionPayload } from "@/lib/student/dal";
import {
  createRecordingUploadUrl,
  deleteRecordingObject,
  verifyRecordingObject,
} from "@/lib/student-recordings";
import { PERCENT_READY } from "@/lib/level-readiness";

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

/**
 * The calling student's own level, or null if the teacher hasn't set one
 * yet (see the admin student page's own "set this student's level before
 * assigning milestones" gate — null is a real, reachable state, not just a
 * theoretical one). Level itself is not curriculum content — it's a coarse
 * label ("Beginner"/"Intermediate"/"Advanced") the admin UI already treats
 * as ordinary, unlike Milestone fields — so this function's own select IS
 * the allowlist; there is no SAFE_*_SELECT to route through.
 */
export async function getMyLevel(session: StudentSessionPayload) {
  const student = await prisma.studentProfile.findUnique({
    where: { id: session.studentId },
    select: { level: true },
  });
  return student?.level ?? null;
}

/**
 * The student's current (in-progress or submitted) milestone, or null.
 *
 * Scoped to the student's CURRENT level. An admin changing
 * StudentProfile.level has no side effect on existing StudentMilestone rows
 * (see the admin student-update route) — without this filter, a milestone
 * left IN_PROGRESS at a level the student has since moved on from could
 * keep winning `orderBy: assignedAt desc` and surface as "current focus"
 * indefinitely after the level change, showing the wrong level's content.
 *
 * Deliberately does NOT apply getMyLevelProgress's frozen-eligibility
 * filter (Milestone.effectiveFrom at or before the student's baseline).
 * This is intentional, not an oversight — do not "fix" it by aligning the
 * two. They answer different questions: getMyLevelProgress answers "how
 * far through what I understood your curriculum to be when you started
 * this level are you," frozen specifically so catalog growth can't move it
 * retroactively; this function answers "what should I work on right now,"
 * entirely at the teacher's discretion and unconstrained by that snapshot.
 *
 * THE FAILURE MODE if you align them anyway: a student can finish every
 * milestone in their frozen effective set (percentage = 100%, all
 * ACHIEVED) and then be assigned a genuinely new milestone — one whose
 * effectiveFrom is later than the student's baseline, so it's correctly
 * excluded from the percentage's denominator by design. If this function
 * filtered to that same effective set, the new milestone would never
 * qualify as a candidate, no other IN_PROGRESS/SUBMITTED row would remain
 * inside the effective set either (they're all ACHIEVED — that's why it's
 * 100%), and this function would return null. The student would see
 * "100%" and no current-focus section at all, despite the teacher having
 * just assigned them something. Verified in queries.test.ts (the test
 * proving this divergence is intentional, paired with the level-scoping
 * test above).
 *
 * listAchievedMilestones below has the same level-scoping bug fix, same
 * cause, same reasoning — kept as a separate comment there since it's a
 * distinct function, but it is the SAME kind of fix as the paragraph
 * above this one, not the same kind of thing as the effectiveFrom
 * paragraph below it. Do not conflate the two when reading either.
 */
export async function getCurrentMilestone(session: StudentSessionPayload) {
  const student = await prisma.studentProfile.findUnique({
    where: { id: session.studentId },
    select: { level: true },
  });
  if (!student?.level) return null;

  return prisma.studentMilestone.findFirst({
    where: {
      studentId: session.studentId,
      status: { in: ["IN_PROGRESS", "SUBMITTED"] },
      milestone: { level: student.level },
    },
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
 *
 * BUG FIX, same defect and same cause as getCurrentMilestone above: scoped
 * to the student's CURRENT level, because an admin changing
 * StudentProfile.level has no side effect on existing StudentMilestone
 * rows, so a prior level's achievements would otherwise keep appearing
 * forever after a promotion. This is NOT the effectiveFrom/baseline
 * divergence discussed on getCurrentMilestone — that one is intentional
 * and does not apply to this function either; do not conflate the two.
 *
 * Why level-scoping matters here specifically: this list renders next to
 * getMyLevelProgress's percentage, which is already level-specific ("X%
 * through your CURRENT level"). An unscoped list would silently answer a
 * different question than the percentage sitting next to it — a student
 * promoted to Intermediate seeing "20%" beside a list of Beginner
 * achievements reads as "20% through what's shown below," which is wrong.
 *
 * Prior-level achievements are not lost — the StudentMilestone rows still
 * exist, permanently, with status ACHIEVED. A lifetime cross-level history
 * view may be worth building later, but it must be a deliberate, labelled
 * section of its own, not this function silently widened back out. Do not
 * remove this filter to build that; build the labelled view instead.
 */
export async function listAchievedMilestones(session: StudentSessionPayload) {
  const student = await prisma.studentProfile.findUnique({
    where: { id: session.studentId },
    select: { level: true },
  });
  if (!student?.level) return [];

  return prisma.studentMilestone.findMany({
    where: {
      studentId: session.studentId,
      status: "ACHIEVED",
      milestone: { level: student.level },
    },
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
 * - recordingRequired is true AND no recording has been uploaded: checked
 *   against WeeklyPracticeAttachment (Stage 8) — this used to be an
 *   unconditional refusal before Stage 8 existed; now it's a real existence
 *   check. Do not fake, stub, or bypass this check.
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
    const hasRecording = await prisma.weeklyPracticeAttachment.findFirst({
      where: { weeklyPracticeId: assignment.id, uploadedBy: "STUDENT" },
      select: { id: true },
    });
    if (!hasRecording) {
      throw new AssignmentSubmissionError(
        "This assignment requires a recording. Please upload one before submitting.",
        "RECORDING_REQUIRED"
      );
    }
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

/** Fields a student may see on their own recording attachment. Never
 *  includes storagePath — that never leaves the server, only a signed URL
 *  derived from it does (see getMyRecordingAttachment for the one
 *  exception, and why). Never includes label/isMilestoneMarker — both are
 *  teacher-authored fields with no defined student-visibility rule yet, and
 *  this stage only concerns the student's own uploaded recording. */
const SAFE_RECORDING_SELECT = {
  id: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  createdAt: true,
} as const;

/**
 * Mints a signed upload URL for a new recording, scoped to an assignment
 * the caller must already own. weeklyPracticeId is client-supplied (the
 * student picks which assignment they're recording for), so — unlike
 * addMyPracticeLogEntry's inferred weeklyPracticeId — it is verified here
 * exactly like addMyNote verifies its own client-supplied weeklyPracticeId,
 * never trusted blindly. The actual storage path is still entirely
 * server-derived inside createRecordingUploadUrl; only the assignment
 * choice comes from the caller.
 */
export async function createMyRecordingUploadUrl(
  session: StudentSessionPayload,
  input: { weeklyPracticeId: string; mimeType: string; fileSize: number }
) {
  const owns = await prisma.weeklyPractice.findFirst({
    where: { id: input.weeklyPracticeId, studentId: session.studentId },
    select: { id: true },
  });
  if (!owns) {
    throw new StudentAuthorizationError(
      "Cannot upload a recording to an assignment that isn't yours"
    );
  }

  return createRecordingUploadUrl(session.studentId, input.weeklyPracticeId, {
    mimeType: input.mimeType,
    fileSize: input.fileSize,
  });
}

/**
 * Records a completed direct-to-storage upload as a WeeklyPracticeAttachment
 * row. Checks before anything is written, none optional:
 *
 * 1. Ownership of the assignment (same pattern as
 *    createMyRecordingUploadUrl/addMyNote).
 * 2. The client-echoed `path` actually starts with this student's own
 *    prefix — the path was server-generated in the mint step, but a
 *    client could in principle echo back a DIFFERENT valid-looking path
 *    it was never issued, so it's re-validated here rather than trusted
 *    because we handed out something like it once.
 * 3. verifyRecordingObject — the actual stored size AND content-type,
 *    checked against what Supabase really has, not what the client
 *    declared in this request. The declared fileSize/mimeType in `input`
 *    are used for nothing beyond routing to this point; the values
 *    actually stored come from verification.
 *
 * "One recording per submission" (a product decision, not a schema
 * constraint — see the WeeklyPracticeAttachment model comment): if a
 * STUDENT-uploaded attachment already exists for this assignment, this
 * REPLACES it — the old storage object AND row are deleted (object
 * deletion is best-effort; a cleanup failure must not fail this request),
 * then a fresh row is written, rather than a second row accumulating
 * alongside it or the existing row being mutated in place.
 */
export async function confirmMyRecordingUpload(
  session: StudentSessionPayload,
  input: {
    weeklyPracticeId: string;
    path: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }
) {
  const owns = await prisma.weeklyPractice.findFirst({
    where: { id: input.weeklyPracticeId, studentId: session.studentId },
    select: { id: true },
  });
  if (!owns) {
    throw new StudentAuthorizationError(
      "Cannot attach a recording to an assignment that isn't yours"
    );
  }

  const expectedPrefix = `students/${session.studentId}/weekly-practice/${input.weeklyPracticeId}/`;
  if (!input.path.startsWith(expectedPrefix)) {
    throw new StudentAuthorizationError("Recording path does not match this assignment");
  }

  const verified = await verifyRecordingObject(input.path);

  const existing = await prisma.weeklyPracticeAttachment.findFirst({
    where: { weeklyPracticeId: input.weeklyPracticeId, uploadedBy: "STUDENT" },
  });

  if (existing) {
    await deleteRecordingObject(existing.storagePath);
    await prisma.weeklyPracticeAttachment.delete({ where: { id: existing.id } });
  }

  return prisma.weeklyPracticeAttachment.create({
    data: {
      weeklyPracticeId: input.weeklyPracticeId,
      uploadedBy: "STUDENT",
      storagePath: input.path,
      fileName: input.fileName,
      mimeType: verified.mimeType,
      fileSize: verified.fileSize,
    },
    select: SAFE_RECORDING_SELECT,
  });
}

/**
 * The calling student's own recording for the given attachment id, or null
 * if it doesn't exist or belongs to someone else. Unlike every other
 * student-facing select in this file, this one DOES include storagePath —
 * it's the one place a signed URL actually needs to be minted from it. The
 * caller (the viewing route) must never return storagePath itself to the
 * client, only a signed URL derived from it.
 */
export async function getMyRecordingAttachment(session: StudentSessionPayload, attachmentId: string) {
  const attachment = await prisma.weeklyPracticeAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      storagePath: true,
      weeklyPractice: { select: { studentId: true } },
    },
  });

  if (!attachment || attachment.weeklyPractice.studentId !== session.studentId) {
    return null;
  }

  return { storagePath: attachment.storagePath };
}

/** The recording attached to the student's current assignment, or null —
 *  "one per submission," so findFirst rather than findMany. */
export async function getMyCurrentAssignmentRecording(session: StudentSessionPayload) {
  const assignment = await getCurrentAssignment(session);
  if (!assignment) return null;

  return prisma.weeklyPracticeAttachment.findFirst({
    where: { weeklyPracticeId: assignment.id, uploadedBy: "STUDENT" },
    select: SAFE_RECORDING_SELECT,
  });
}

/**
 * The student's milestone-based progress within their CURRENT level only
 * — never against the whole curriculum (spec §9: "horizon-limited and
 * milestone-based, not denominator-based... provided the denominator does
 * not reveal total curriculum scope"). Returns either a rounded
 * percentage or "In Progress" — never the raw counts that produced it,
 * and never a `percent` key at all in the "In Progress" case.
 *
 * Gate 1 — PERCENT_READY (src/lib/level-readiness.ts): until a level's
 * milestone structure is marked ready, every student at that level sees
 * "In Progress" regardless of what the math would say.
 *
 * Gate 2 — the effective set: denominator/numerator are built ONLY from
 * StudentMilestone rows this student already has — never from the
 * Milestone catalog directly, which would leak the existence of
 * milestones the student hasn't been assigned yet. Within that, a
 * milestone only counts if its effectiveFrom is at or before this
 * student's own baseline (the earliest assignedAt among their own
 * StudentMilestone rows at this level) — a milestone added to the
 * catalog after a student's baseline never moves their denominator, even
 * if it's later explicitly assigned to them. See
 * Milestone.effectiveFrom's schema comment for the full reasoning.
 *
 * Rounds to the nearest 5%; any nonzero progress is floored at 5% so real
 * progress never displays as 0%.
 *
 * getCurrentMilestone deliberately does NOT use this effective-set filter
 * — see its own doc comment for why the two functions intentionally use
 * different eligibility rules, and the failure mode that results if
 * someone "fixes" them to match.
 */
export async function getMyLevelProgress(
  session: StudentSessionPayload
): Promise<{ display: "IN_PROGRESS" } | { display: "PERCENT"; percent: number }> {
  const student = await prisma.studentProfile.findUnique({
    where: { id: session.studentId },
    select: { level: true },
  });
  if (!student?.level) {
    return { display: "IN_PROGRESS" };
  }

  if (!PERCENT_READY[student.level]) {
    return { display: "IN_PROGRESS" };
  }

  const assigned = await prisma.studentMilestone.findMany({
    where: { studentId: session.studentId, milestone: { level: student.level } },
    select: { status: true, assignedAt: true, milestone: { select: { effectiveFrom: true } } },
  });
  if (assigned.length === 0) {
    return { display: "IN_PROGRESS" };
  }

  const baseline = assigned.reduce(
    (earliest, m) => (m.assignedAt < earliest ? m.assignedAt : earliest),
    assigned[0].assignedAt
  );

  const effectiveSet = assigned.filter((m) => m.milestone.effectiveFrom <= baseline);
  if (effectiveSet.length === 0) {
    return { display: "IN_PROGRESS" };
  }

  const achieved = effectiveSet.filter((m) => m.status === "ACHIEVED").length;
  let percent = Math.round(((achieved / effectiveSet.length) * 100) / 5) * 5;
  if (achieved > 0 && percent === 0) percent = 5;

  return { display: "PERCENT", percent };
}
