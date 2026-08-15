import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StudentSessionPayload } from "@/lib/student/dal";

// The mock below deliberately does NOT provide `teacherPrivateNote` or
// `milestone` on the fake prisma object. If any function in queries.ts ever
// called either directly, that call would throw "Cannot read properties of
// undefined" and fail immediately — that's the actual enforcement behind
// "TeacherPrivateNote is unreachable from the student side" and "Milestone
// reads only go through StudentMilestone," not a naming convention.

// --- Fake in-memory backing store ------------------------------------------
// A vi.fn() returning a fixed value can't prove a `where` clause actually
// scopes by studentId, or that a `select` clause actually narrows fields —
// it would return whatever fixture is configured regardless of what the
// implementation passed in. This tiny fake simulates both real Prisma
// behaviors (where-filtering, select-narrowing) so the tests below prove the
// real thing rather than a mock configured to look right.

interface WeeklyPracticeRow {
  id: string;
  studentId: string;
  weekTitle: string;
  weekStartDate: Date;
  weekEndDate: Date;
  instructions: string | null;
  goals: string | null;
  teacherNotes: string | null;
  internalCurriculumRef: string | null;
  currentTechnique: string | null;
  recordingRequired: boolean;
  status: string;
  studentSubmission: string | null;
  submittedAt: Date | null;
  adminFeedback: string | null;
  feedbackStatus: string | null;
  feedbackAt: Date | null;
}

const weeklyPracticeRows: WeeklyPracticeRow[] = [
  {
    id: "wp-student1-current",
    studentId: "student-1",
    weekTitle: "Week of Aug 10",
    weekStartDate: new Date("2026-08-10"),
    weekEndDate: new Date("2026-08-16"),
    instructions: "Practice FL2 slowly.",
    goals: "20 minutes",
    teacherNotes: "SECRET: struggling with ring finger independence",
    internalCurriculumRef: "C1-FL2",
    currentTechnique: "INTERNAL-TECH-4",
    recordingRequired: true,
    status: "IN_PROGRESS",
    studentSubmission: null,
    submittedAt: null,
    adminFeedback: null,
    feedbackStatus: null,
    feedbackAt: null,
  },
  {
    id: "wp-student2-current",
    studentId: "student-2",
    weekTitle: "Week of Aug 10 — Student 2",
    weekStartDate: new Date("2026-08-10"),
    weekEndDate: new Date("2026-08-16"),
    instructions: "Practice damping.",
    goals: "15 minutes",
    teacherNotes: "SECRET: student 2's private note",
    internalCurriculumRef: "C1-DM",
    currentTechnique: "INTERNAL-TECH-2",
    recordingRequired: false,
    status: "NOT_STARTED",
    studentSubmission: null,
    submittedAt: null,
    adminFeedback: null,
    feedbackStatus: null,
    feedbackAt: null,
  },
  // Already submitted — resubmission must be blocked until an admin reopens
  // it. recordingRequired is false here specifically so the resubmission
  // test isolates that one rule, rather than also tripping the recording
  // check.
  {
    id: "wp-student3-submitted",
    studentId: "student-3",
    weekTitle: "Week of Aug 3 — Student 3",
    weekStartDate: new Date("2026-08-03"),
    weekEndDate: new Date("2026-08-09"),
    instructions: "Practice the etude.",
    goals: "10 minutes",
    teacherNotes: null,
    internalCurriculumRef: null,
    currentTechnique: null,
    recordingRequired: false,
    status: "SUBMITTED",
    studentSubmission: "Practiced the etude at 60bpm.",
    submittedAt: new Date("2026-08-09"),
    adminFeedback: null,
    feedbackStatus: null,
    feedbackAt: null,
  },
  // Status is back to IN_PROGRESS, representing "an admin reopened this."
  // submitCurrentAssignment only ever reads `status` to decide eligibility —
  // it does not read reopenedAt/reopenCount (those are admin-side audit
  // fields) — so this fixture models a reopened row purely by status, which
  // is what actually makes resubmission possible.
  {
    id: "wp-student4-reopened",
    studentId: "student-4",
    weekTitle: "Week of Aug 3 — Student 4",
    weekStartDate: new Date("2026-08-03"),
    weekEndDate: new Date("2026-08-09"),
    instructions: "Practice the etude again.",
    goals: "10 minutes",
    teacherNotes: null,
    internalCurriculumRef: null,
    currentTechnique: null,
    recordingRequired: false,
    status: "IN_PROGRESS",
    studentSubmission: "Previous attempt, now editable again.",
    submittedAt: new Date("2026-08-05"),
    adminFeedback: null,
    feedbackStatus: null,
    feedbackAt: null,
  },
  // recordingRequired: true, WITH a matching attachment (see
  // weeklyPracticeAttachmentRows below) — the "should succeed" counterpart
  // to wp-student1-current's "should be refused" (which deliberately stays
  // attachment-less).
  {
    id: "wp-student5-recording-required",
    studentId: "student-5",
    weekTitle: "Week of Aug 3 — Student 5",
    weekStartDate: new Date("2026-08-03"),
    weekEndDate: new Date("2026-08-09"),
    instructions: "Record your scale practice.",
    goals: "5 minutes",
    teacherNotes: null,
    internalCurriculumRef: null,
    currentTechnique: null,
    recordingRequired: true,
    status: "IN_PROGRESS",
    studentSubmission: null,
    submittedAt: null,
    adminFeedback: null,
    feedbackStatus: null,
    feedbackAt: null,
  },
];

interface StudentNoteRow {
  id: string;
  studentId: string;
  weeklyPracticeId: string | null;
  body: string;
  visibleToStudent: boolean;
  createdAt: Date;
}

let studentNoteRows: StudentNoteRow[];

interface PracticeLogEntryRow {
  id: string;
  studentId: string;
  weeklyPracticeId: string | null;
  practicedAt: Date;
  durationMinutes: number;
  focus: string;
  selfRating: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let practiceLogEntryRows: PracticeLogEntryRow[];

interface WeeklyPracticeAttachmentRow {
  id: string;
  weeklyPracticeId: string;
  uploadedBy: string; // "ADMIN" | "STUDENT"
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  label: string | null;
  isMilestoneMarker: boolean;
  createdAt: Date;
}

let weeklyPracticeAttachmentRows: WeeklyPracticeAttachmentRow[];

interface MilestoneRow {
  id: string;
  level: string;
  label: string;
  description: string | null;
  internalCriteria: string | null;
}

const milestoneRows: MilestoneRow[] = [
  {
    id: "m-1",
    level: "BEGINNER",
    label: "Foundation exercise mastered",
    description: "Play the foundation exercise cleanly.",
    internalCriteria: "INTERNAL: 56bpm, zero buzz, 3 consecutive clean passes",
  },
  {
    id: "m-2",
    level: "BEGINNER",
    label: "Finger Independence 2",
    description: "Independent ring-finger control.",
    internalCriteria: "INTERNAL: see C1-FL2 rubric",
  },
  {
    id: "m-3-unassigned",
    level: "BEGINNER",
    label: "A milestone nobody has yet",
    description: "Should never surface to anyone in this test.",
    internalCriteria: "INTERNAL: future criteria",
  },
];

interface StudentMilestoneRow {
  id: string;
  studentId: string;
  milestoneId: string;
  status: string;
  assignedAt: Date;
  achievedAt: Date | null;
  teacherComment: string | null;
}

const studentMilestoneRows: StudentMilestoneRow[] = [
  {
    id: "sm-1",
    studentId: "student-1",
    milestoneId: "m-1",
    status: "ACHIEVED",
    assignedAt: new Date("2026-07-01"),
    achievedAt: new Date("2026-07-20"),
    teacherComment: "Great control!",
  },
  {
    id: "sm-2",
    studentId: "student-1",
    milestoneId: "m-2",
    status: "IN_PROGRESS",
    assignedAt: new Date("2026-07-21"),
    achievedAt: null,
    teacherComment: null,
  },
  // m-3-unassigned deliberately has NO StudentMilestone row for anyone.
  {
    id: "sm-3",
    studentId: "student-2",
    milestoneId: "m-1",
    status: "IN_PROGRESS",
    assignedAt: new Date("2026-07-01"),
    achievedAt: null,
    teacherComment: null,
  },
];

type SelectShape = Record<string, boolean | { select?: SelectShape }>;

function applySelect<T extends object>(row: T, select?: SelectShape): Partial<T> {
  if (!select) return row;
  const result: Partial<T> = {};
  for (const key of Object.keys(select)) {
    const value = select[key];
    if (value) (result as Record<string, unknown>)[key] = (row as Record<string, unknown>)[key];
  }
  return result;
}

function applyStudentMilestoneSelect(row: StudentMilestoneRow, select?: SelectShape) {
  if (!select) return row;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    const value = select[key];
    if (!value) continue;
    if (key === "milestone" && typeof value === "object") {
      const milestoneRow = milestoneRows.find((m) => m.id === row.milestoneId);
      result.milestone = milestoneRow ? applySelect(milestoneRow, value.select) : null;
    } else {
      result[key] = (row as unknown as Record<string, unknown>)[key];
    }
  }
  return result;
}

interface WhereClause {
  studentId: string;
  id?: string;
  status?: string | { in: string[] };
  visibleToStudent?: boolean;
}

/** Mirrors applyStudentMilestoneSelect's nested-relation handling, for
 *  WeeklyPracticeAttachment's `weeklyPractice: { select: { studentId } }`. */
function applyAttachmentSelect(row: WeeklyPracticeAttachmentRow, select?: SelectShape) {
  if (!select) return row;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    const value = select[key];
    if (!value) continue;
    if (key === "weeklyPractice" && typeof value === "object") {
      const wp = weeklyPracticeRows.find((r) => r.id === row.weeklyPracticeId);
      result.weeklyPractice = wp ? applySelect(wp, value.select) : null;
    } else {
      result[key] = (row as unknown as Record<string, unknown>)[key];
    }
  }
  return result;
}

const mockFindFirstWeeklyPractice = vi.fn(
  ({ where, select }: { where: WhereClause; select?: SelectShape }) => {
    const row = weeklyPracticeRows.find((r) => {
      if (r.studentId !== where.studentId) return false;
      if (where.id && r.id !== where.id) return false;
      return true;
    });
    return row ? applySelect(row, select) : null;
  }
);

const mockUpdateWeeklyPractice = vi.fn(
  ({
    where,
    data,
    select,
  }: {
    where: { id: string };
    data: Partial<WeeklyPracticeRow>;
    select?: SelectShape;
  }) => {
    const row = weeklyPracticeRows.find((r) => r.id === where.id);
    if (!row) throw new Error(`No WeeklyPractice row with id ${where.id}`);
    Object.assign(row, data);
    return applySelect(row, select);
  }
);

const mockFindManyStudentNote = vi.fn(
  ({ where, select }: { where: WhereClause; select?: SelectShape }) => {
    return studentNoteRows
      .filter((r) => {
        if (r.studentId !== where.studentId) return false;
        // Mirrors real Prisma: a `where` key that isn't present doesn't
        // filter at all. This is deliberate — it's what makes the
        // visibility test below fail for the right reason before
        // listMyNotes actually passes visibleToStudent in its where clause.
        if (where.visibleToStudent !== undefined && r.visibleToStudent !== where.visibleToStudent) {
          return false;
        }
        return true;
      })
      .map((r) => applySelect(r, select));
  }
);

const mockCreateStudentNote = vi.fn(
  ({
    data,
    select,
  }: {
    data: {
      studentId: string;
      body: string;
      weeklyPracticeId: string | null;
      visibleToStudent: boolean;
    };
    select?: SelectShape;
  }) => {
    const row: StudentNoteRow = {
      id: `note-${studentNoteRows.length + 1}`,
      createdAt: new Date(),
      ...data,
    };
    studentNoteRows.push(row);
    return applySelect(row, select);
  }
);

const mockFindManyPracticeLogEntry = vi.fn(
  ({ where, select }: { where: WhereClause; select?: SelectShape }) => {
    return practiceLogEntryRows
      .filter((r) => r.studentId === where.studentId)
      .map((r) => applySelect(r, select));
  }
);

const mockCreatePracticeLogEntry = vi.fn(
  ({
    data,
    select,
  }: {
    data: {
      studentId: string;
      weeklyPracticeId: string | null;
      practicedAt: Date;
      durationMinutes: number;
      focus: string;
      selfRating: string | null;
    };
    select?: SelectShape;
  }) => {
    const row: PracticeLogEntryRow = {
      id: `ple-${practiceLogEntryRows.length + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    };
    practiceLogEntryRows.push(row);
    return applySelect(row, select);
  }
);

interface AttachmentWhereClause {
  id?: string;
  weeklyPracticeId?: string;
  uploadedBy?: string;
}

const mockFindFirstWeeklyPracticeAttachment = vi.fn(
  ({ where, select }: { where: AttachmentWhereClause; select?: SelectShape }) => {
    const row = weeklyPracticeAttachmentRows.find(
      (r) =>
        (!where.weeklyPracticeId || r.weeklyPracticeId === where.weeklyPracticeId) &&
        (!where.uploadedBy || r.uploadedBy === where.uploadedBy)
    );
    return row ? applyAttachmentSelect(row, select) : null;
  }
);

const mockFindUniqueWeeklyPracticeAttachment = vi.fn(
  ({ where, select }: { where: AttachmentWhereClause; select?: SelectShape }) => {
    const row = weeklyPracticeAttachmentRows.find((r) => r.id === where.id);
    return row ? applyAttachmentSelect(row, select) : null;
  }
);

const mockCreateWeeklyPracticeAttachment = vi.fn(
  ({
    data,
    select,
  }: {
    data: {
      weeklyPracticeId: string;
      uploadedBy: string;
      storagePath: string;
      fileName: string;
      mimeType: string;
      fileSize: number;
    };
    select?: SelectShape;
  }) => {
    const row: WeeklyPracticeAttachmentRow = {
      id: `attachment-${weeklyPracticeAttachmentRows.length + 1}`,
      label: null,
      isMilestoneMarker: false,
      createdAt: new Date(),
      ...data,
    };
    weeklyPracticeAttachmentRows.push(row);
    return applyAttachmentSelect(row, select);
  }
);

const mockUpdateWeeklyPracticeAttachment = vi.fn(
  ({
    where,
    data,
    select,
  }: {
    where: { id: string };
    data: Partial<WeeklyPracticeAttachmentRow>;
    select?: SelectShape;
  }) => {
    const row = weeklyPracticeAttachmentRows.find((r) => r.id === where.id);
    if (!row) throw new Error(`No WeeklyPracticeAttachment row with id ${where.id}`);
    Object.assign(row, data);
    return applyAttachmentSelect(row, select);
  }
);

const mockDeleteWeeklyPracticeAttachment = vi.fn(({ where }: { where: { id: string } }) => {
  const index = weeklyPracticeAttachmentRows.findIndex((r) => r.id === where.id);
  if (index === -1) throw new Error(`No WeeklyPracticeAttachment row with id ${where.id}`);
  const [row] = weeklyPracticeAttachmentRows.splice(index, 1);
  return row;
});

function matchesStatus(row: StudentMilestoneRow, status?: WhereClause["status"]) {
  if (!status) return true;
  if (typeof status === "string") return row.status === status;
  return status.in.includes(row.status);
}

const mockFindManyStudentMilestone = vi.fn(
  ({ where, select }: { where: WhereClause; select?: SelectShape }) => {
    return studentMilestoneRows
      .filter((r) => r.studentId === where.studentId && matchesStatus(r, where.status))
      .map((r) => applyStudentMilestoneSelect(r, select));
  }
);

const mockFindFirstStudentMilestone = vi.fn(
  ({ where, select }: { where: WhereClause; select?: SelectShape }) => {
    const row = studentMilestoneRows.find(
      (r) => r.studentId === where.studentId && matchesStatus(r, where.status)
    );
    return row ? applyStudentMilestoneSelect(row, select) : null;
  }
);

vi.mock("@/lib/db", () => ({
  prisma: {
    weeklyPractice: {
      findFirst: (args: unknown) => mockFindFirstWeeklyPractice(args as never),
      update: (args: unknown) => mockUpdateWeeklyPractice(args as never),
    },
    studentNote: {
      findMany: (args: unknown) => mockFindManyStudentNote(args as never),
      create: (args: unknown) => mockCreateStudentNote(args as never),
    },
    studentMilestone: {
      findMany: (args: unknown) => mockFindManyStudentMilestone(args as never),
      findFirst: (args: unknown) => mockFindFirstStudentMilestone(args as never),
    },
    practiceLogEntry: {
      findMany: (args: unknown) => mockFindManyPracticeLogEntry(args as never),
      create: (args: unknown) => mockCreatePracticeLogEntry(args as never),
    },
    weeklyPracticeAttachment: {
      findFirst: (args: unknown) => mockFindFirstWeeklyPracticeAttachment(args as never),
      findUnique: (args: unknown) => mockFindUniqueWeeklyPracticeAttachment(args as never),
      create: (args: unknown) => mockCreateWeeklyPracticeAttachment(args as never),
      update: (args: unknown) => mockUpdateWeeklyPracticeAttachment(args as never),
      delete: (args: unknown) => mockDeleteWeeklyPracticeAttachment(args as never),
    },
    // No `milestone`, no `teacherPrivateNote` — see the note at the top of
    // this file.
  },
}));

const mockCreateRecordingUploadUrl = vi.fn();
const mockGetRecordingSignedUrl = vi.fn();
const mockDeleteRecordingObject = vi.fn();
const mockVerifyRecordingObject = vi.fn();
// student-recordings.ts has `import "server-only"`, same as
// supabase-admin-auth.ts — mocked at the boundary queries.ts actually
// imports, matching the established convention (see DECISIONS.md's
// server-only-guard entry). InvalidRecordingError is hand-rolled inline,
// same pattern as StudentInviteError/OrderCreationError elsewhere.
vi.mock("@/lib/student-recordings", () => {
  class InvalidRecordingError extends Error {}
  return {
    createRecordingUploadUrl: (...args: unknown[]) => mockCreateRecordingUploadUrl(...args),
    getRecordingSignedUrl: (...args: unknown[]) => mockGetRecordingSignedUrl(...args),
    deleteRecordingObject: (...args: unknown[]) => mockDeleteRecordingObject(...args),
    verifyRecordingObject: (...args: unknown[]) => mockVerifyRecordingObject(...args),
    InvalidRecordingError,
  };
});

import {
  getCurrentAssignment,
  listMyNotes,
  addMyNote,
  listMyMilestones,
  getCurrentMilestone,
  listAchievedMilestones,
  listMyPracticeLogEntries,
  addMyPracticeLogEntry,
  submitCurrentAssignment,
  createMyRecordingUploadUrl,
  confirmMyRecordingUpload,
  getMyRecordingAttachment,
  getMyCurrentAssignmentRecording,
  StudentAuthorizationError,
  AssignmentSubmissionError,
} from "@/lib/student/queries";

const sessionStudent1: StudentSessionPayload = {
  studentId: "student-1",
  supabaseUserId: "sb-1",
  email: "student1@example.com",
  fullName: "Student One",
  locale: "en",
};
const sessionStudent2: StudentSessionPayload = {
  studentId: "student-2",
  supabaseUserId: "sb-2",
  email: "student2@example.com",
  fullName: "Student Two",
  locale: "en",
};
const sessionStudent3: StudentSessionPayload = {
  studentId: "student-3",
  supabaseUserId: "sb-3",
  email: "student3@example.com",
  fullName: "Student Three",
  locale: "en",
};
const sessionStudent4: StudentSessionPayload = {
  studentId: "student-4",
  supabaseUserId: "sb-4",
  email: "student4@example.com",
  fullName: "Student Four",
  locale: "en",
};
const sessionStudent5: StudentSessionPayload = {
  studentId: "student-5",
  supabaseUserId: "sb-5",
  email: "student5@example.com",
  fullName: "Student Five",
  locale: "en",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: the actual uploaded object is within policy on both size and
  // mimeType. Tests that specifically exercise verification failure
  // override this.
  mockVerifyRecordingObject.mockResolvedValue({ fileSize: 500000, mimeType: "audio/webm" });
  studentNoteRows = [
    {
      id: "note-1",
      studentId: "student-1",
      weeklyPracticeId: "wp-student1-current",
      body: "Struggled with string 4",
      visibleToStudent: true,
      createdAt: new Date("2026-08-11"),
    },
    {
      id: "note-2",
      studentId: "student-2",
      weeklyPracticeId: null,
      body: "Student 2's note",
      visibleToStudent: true,
      createdAt: new Date("2026-08-11"),
    },
    // A teacher-authored observation about student-1, deliberately hidden —
    // exactly the "avoiding the harder qignit" scenario. No code path
    // creates rows like this yet (no teacher-facing writer exists), but the
    // read side must already refuse to leak one if it ever appears.
    {
      id: "note-3-hidden",
      studentId: "student-1",
      weeklyPracticeId: null,
      body: "Avoiding the harder qignit — private observation",
      visibleToStudent: false,
      createdAt: new Date("2026-08-12"),
    },
  ];
  practiceLogEntryRows = [
    {
      id: "ple-1",
      studentId: "student-1",
      weeklyPracticeId: "wp-student1-current",
      practicedAt: new Date("2026-08-11"),
      durationMinutes: 20,
      focus: "String crossing",
      selfRating: "Focused",
      createdAt: new Date("2026-08-11"),
      updatedAt: new Date("2026-08-11"),
    },
    {
      id: "ple-2",
      studentId: "student-2",
      weeklyPracticeId: null,
      practicedAt: new Date("2026-08-11"),
      durationMinutes: 15,
      focus: "Student 2's practice",
      selfRating: null,
      createdAt: new Date("2026-08-11"),
      updatedAt: new Date("2026-08-11"),
    },
  ];
  weeklyPracticeAttachmentRows = [
    // Belongs to student-5's assignment — recordingRequired: true AND has
    // an attachment, so submission should succeed. Deliberately NOT on
    // wp-student1-current, which stays attachment-less so the existing
    // "is refused when recordingRequired is true" test keeps proving the
    // no-attachment case.
    {
      id: "attachment-student5",
      weeklyPracticeId: "wp-student5-recording-required",
      uploadedBy: "STUDENT",
      storagePath: "students/student-5/weekly-practice/wp-student5-recording-required/existing.webm",
      fileName: "practice-take-1.webm",
      mimeType: "audio/webm",
      fileSize: 500000,
      label: null,
      isMilestoneMarker: false,
      createdAt: new Date("2026-08-12"),
    },
  ];
});

describe("getCurrentAssignment", () => {
  it("returns only the calling student's own assignment", async () => {
    const result = await getCurrentAssignment(sessionStudent1);
    expect(result?.id).toBe("wp-student1-current");
  });

  it("a student cannot read another student's WeeklyPractice", async () => {
    const result = await getCurrentAssignment(sessionStudent1);
    expect(result?.id).not.toBe("wp-student2-current");
    const otherResult = await getCurrentAssignment(sessionStudent2);
    expect(otherResult?.id).toBe("wp-student2-current");
  });

  it("excludes teacherNotes, internalCurriculumRef, and currentTechnique", async () => {
    const result = await getCurrentAssignment(sessionStudent1);
    expect(result).not.toBeNull();
    expect("teacherNotes" in (result as object)).toBe(false);
    expect("internalCurriculumRef" in (result as object)).toBe(false);
    expect("currentTechnique" in (result as object)).toBe(false);
  });

  // Not a red-first test — the select already includes all five of these
  // (recordingRequired since Stage 3; studentSubmission/submittedAt/
  // adminFeedback/feedbackStatus since Stage 2). Nothing changes here to
  // make it fail. It closes a real coverage gap instead: the test above
  // only ever proved the three admin fields are ABSENT, nothing proved
  // these five are actually PRESENT — a future accidental narrowing of
  // SAFE_WEEKLY_PRACTICE_SELECT would have broken the dashboard silently.
  it("includes recordingRequired, studentSubmission, submittedAt, adminFeedback, and feedbackStatus", async () => {
    const result = await getCurrentAssignment(sessionStudent1);
    expect(result).not.toBeNull();
    for (const key of [
      "recordingRequired",
      "studentSubmission",
      "submittedAt",
      "adminFeedback",
      "feedbackStatus",
    ]) {
      expect(key in (result as object)).toBe(true);
    }
  });

  it("scopes the query using session.studentId, nothing else", async () => {
    await getCurrentAssignment(sessionStudent1);
    const call = mockFindFirstWeeklyPractice.mock.calls.at(-1)?.[0] as { where: WhereClause };
    expect(call.where.studentId).toBe("student-1");
  });
});

describe("listMyNotes / addMyNote", () => {
  it("only returns the calling student's own notes", async () => {
    const notes = await listMyNotes(sessionStudent1);
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe("note-1");
  });

  it("a student cannot read another student's StudentNote", async () => {
    const notes = await listMyNotes(sessionStudent2);
    expect(notes.every((n) => n.id !== "note-1")).toBe(true);
  });

  it("writes a new note under session.studentId, never a caller-supplied id", async () => {
    const note = await addMyNote(sessionStudent1, { body: "New note" });
    const call = mockCreateStudentNote.mock.calls.at(-1)?.[0] as {
      data: { studentId: string };
    };
    expect(call.data.studentId).toBe("student-1");
    expect(note.body).toBe("New note");
  });

  it("rejects linking a note to another student's WeeklyPractice", async () => {
    await expect(
      addMyNote(sessionStudent1, {
        body: "trying to attach to someone else's week",
        weeklyPracticeId: "wp-student2-current",
      })
    ).rejects.toThrow(StudentAuthorizationError);
  });

  it("a note with visibleToStudent=false is unreachable through listMyNotes", async () => {
    const notes = await listMyNotes(sessionStudent1);
    expect(notes.some((n) => n.id === "note-3-hidden")).toBe(false);
  });

  it("addMyNote always creates a visible note — a student has no parameter to hide their own note", async () => {
    await addMyNote(sessionStudent1, { body: "New note" });
    const call = mockCreateStudentNote.mock.calls.at(-1)?.[0] as {
      data: { visibleToStudent: boolean };
    };
    expect(call.data.visibleToStudent).toBe(true);
  });

  it("a student cannot reach another student's notes, including a visible admin-authored one", async () => {
    // note-2 belongs to student-2 and is visible — the scoping that matters
    // here is studentId, not visibility, and it must hold regardless of who
    // authored the row.
    const notes = await listMyNotes(sessionStudent1);
    expect(notes.some((n) => n.id === "note-2")).toBe(false);
  });
});

describe("Milestones — go through StudentMilestone only", () => {
  it("returns only the calling student's own milestone rows", async () => {
    const rows = await listMyMilestones(sessionStudent1);
    expect(rows.map((r) => r.id).sort()).toEqual(["sm-1", "sm-2"]);
  });

  it("a student cannot read another student's StudentMilestone rows", async () => {
    const rows = await listMyMilestones(sessionStudent1);
    expect(rows.every((r) => r.id !== "sm-3")).toBe(true);
  });

  it("a Milestone with no StudentMilestone row for this student is unreachable", async () => {
    const rows = await listMyMilestones(sessionStudent1);
    expect(rows.some((r) => (r as { milestone: { id: string } }).milestone.id === "m-3-unassigned")).toBe(
      false
    );
  });

  it("never exposes internalCriteria, on any milestone read", async () => {
    const rows = await listMyMilestones(sessionStudent1);
    for (const row of rows) {
      expect("internalCriteria" in (row as { milestone: object }).milestone).toBe(false);
    }
    const current = await getCurrentMilestone(sessionStudent1);
    expect(current && "internalCriteria" in (current as { milestone: object }).milestone).toBeFalsy();
    const achieved = await listAchievedMilestones(sessionStudent1);
    for (const row of achieved) {
      expect("internalCriteria" in (row as { milestone: object }).milestone).toBe(false);
    }
  });

  it("getCurrentMilestone returns the in-progress milestone, not the achieved one", async () => {
    const current = await getCurrentMilestone(sessionStudent1);
    expect((current as { milestone: { id: string } } | null)?.milestone.id).toBe("m-2");
  });

  it("listAchievedMilestones returns only ACHIEVED rows, with the teacher comment", async () => {
    const achieved = await listAchievedMilestones(sessionStudent1);
    expect(achieved).toHaveLength(1);
    expect((achieved[0] as { milestone: { id: string } }).milestone.id).toBe("m-1");
    expect(achieved[0].teacherComment).toBe("Great control!");
  });
});

describe("listMyPracticeLogEntries / addMyPracticeLogEntry", () => {
  it("only returns the calling student's own entries", async () => {
    const entries = await listMyPracticeLogEntries(sessionStudent1);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("ple-1");
  });

  it("a student cannot read another student's PracticeLogEntry", async () => {
    const entries = await listMyPracticeLogEntries(sessionStudent1);
    expect(entries.every((e) => e.id !== "ple-2")).toBe(true);
  });

  it("writes a new entry under session.studentId, never a caller-supplied id", async () => {
    const entry = await addMyPracticeLogEntry(sessionStudent1, {
      practicedAt: new Date("2026-08-12"),
      durationMinutes: 30,
      focus: "Tizita scale",
    });
    const call = mockCreatePracticeLogEntry.mock.calls.at(-1)?.[0] as {
      data: { studentId: string };
    };
    expect(call.data.studentId).toBe("student-1");
    expect(entry.focus).toBe("Tizita scale");
  });

  it("infers weeklyPracticeId from the current assignment at write time, per student", async () => {
    const entry1 = await addMyPracticeLogEntry(sessionStudent1, {
      practicedAt: new Date("2026-08-12"),
      durationMinutes: 10,
      focus: "Warm-up",
    });
    expect(entry1.weeklyPracticeId).toBe("wp-student1-current");

    const entry2 = await addMyPracticeLogEntry(sessionStudent2, {
      practicedAt: new Date("2026-08-12"),
      durationMinutes: 10,
      focus: "Warm-up",
    });
    expect(entry2.weeklyPracticeId).toBe("wp-student2-current");
  });

  it("the returned entry contains no admin-only field and no studentId", async () => {
    const entry = await addMyPracticeLogEntry(sessionStudent1, {
      practicedAt: new Date("2026-08-12"),
      durationMinutes: 10,
      focus: "Warm-up",
    });
    expect(Object.keys(entry).sort()).toEqual(
      ["durationMinutes", "focus", "id", "practicedAt", "selfRating", "weeklyPracticeId"].sort()
    );
  });
});

describe("submitCurrentAssignment", () => {
  it("is refused when recordingRequired is true", async () => {
    // wp-student1-current: IN_PROGRESS, recordingRequired: true.
    await expect(
      submitCurrentAssignment(sessionStudent1, { studentSubmission: "Practiced today." })
    ).rejects.toThrow(AssignmentSubmissionError);
    // Nothing should have been written.
    expect(mockUpdateWeeklyPractice).not.toHaveBeenCalled();
  });

  it("is refused when status is SUBMITTED, REVIEWED, or COMPLETED", async () => {
    // wp-student3-submitted: status SUBMITTED, recordingRequired: false —
    // isolates the resubmission rule from the recording rule.
    await expect(
      submitCurrentAssignment(sessionStudent3, { studentSubmission: "Trying again." })
    ).rejects.toThrow(AssignmentSubmissionError);
    expect(mockUpdateWeeklyPractice).not.toHaveBeenCalled();
  });

  it("succeeds after reopen", async () => {
    // wp-student4-reopened: status IN_PROGRESS (modeling "an admin reopened
    // this"), recordingRequired: false.
    const result = await submitCurrentAssignment(sessionStudent4, {
      studentSubmission: "Second attempt, much steadier.",
    });
    expect(result.status).toBe("SUBMITTED");
    expect(result.studentSubmission).toBe("Second attempt, much steadier.");
    expect(result.submittedAt).not.toBeNull();

    const call = mockUpdateWeeklyPractice.mock.calls.at(-1)?.[0] as { where: { id: string } };
    expect(call.where.id).toBe("wp-student4-reopened");
  });

  it("succeeds when recordingRequired is true and a recording has been uploaded", async () => {
    // wp-student5-recording-required: recordingRequired true, WITH
    // attachment-student5 present — the "unblocked" case Stage 8 adds.
    const result = await submitCurrentAssignment(sessionStudent5, {
      studentSubmission: "Recorded and practiced.",
    });
    expect(result.status).toBe("SUBMITTED");
  });
});

describe("createMyRecordingUploadUrl", () => {
  it("mints an upload URL for the calling student's own assignment", async () => {
    mockCreateRecordingUploadUrl.mockResolvedValue({
      signedUrl: "https://signed.example/upload",
      token: "upload-token",
      path: "students/student-1/weekly-practice/wp-student1-current/new.webm",
      bucket: "student-files",
    });

    const result = await createMyRecordingUploadUrl(sessionStudent1, {
      weeklyPracticeId: "wp-student1-current",
      mimeType: "audio/webm",
      fileSize: 1000,
    });

    expect(result.path).toContain("wp-student1-current");
    expect(mockCreateRecordingUploadUrl).toHaveBeenCalledWith("student-1", "wp-student1-current", {
      mimeType: "audio/webm",
      fileSize: 1000,
    });
  });

  it("a student cannot sign an upload for another student's assignment", async () => {
    await expect(
      createMyRecordingUploadUrl(sessionStudent1, {
        weeklyPracticeId: "wp-student2-current",
        mimeType: "audio/webm",
        fileSize: 1000,
      })
    ).rejects.toThrow(StudentAuthorizationError);
    expect(mockCreateRecordingUploadUrl).not.toHaveBeenCalled();
  });
});

describe("confirmMyRecordingUpload", () => {
  it("creates a new attachment when none exists yet", async () => {
    const result = await confirmMyRecordingUpload(sessionStudent2, {
      weeklyPracticeId: "wp-student2-current",
      path: "students/student-2/weekly-practice/wp-student2-current/new.webm",
      fileName: "take1.webm",
      mimeType: "audio/webm",
      fileSize: 2000,
    });

    expect(result.fileName).toBe("take1.webm");
    const call = mockCreateWeeklyPracticeAttachment.mock.calls.at(-1)?.[0] as {
      data: { weeklyPracticeId: string; uploadedBy: string };
    };
    expect(call.data.weeklyPracticeId).toBe("wp-student2-current");
    expect(call.data.uploadedBy).toBe("STUDENT");
  });

  it("replaces, not accumulates, an existing recording for the same assignment — deletes the previous object and row, writes a fresh one", async () => {
    await confirmMyRecordingUpload(sessionStudent5, {
      weeklyPracticeId: "wp-student5-recording-required",
      path: "students/student-5/weekly-practice/wp-student5-recording-required/replacement.webm",
      fileName: "take2.webm",
      mimeType: "audio/webm",
      fileSize: 3000,
    });

    const forAssignment = weeklyPracticeAttachmentRows.filter(
      (r) => r.weeklyPracticeId === "wp-student5-recording-required" && r.uploadedBy === "STUDENT"
    );
    expect(forAssignment).toHaveLength(1);
    expect(forAssignment[0]?.fileName).toBe("take2.webm");
    expect(mockDeleteWeeklyPracticeAttachment).toHaveBeenCalledWith({
      where: { id: "attachment-student5" },
    });
    expect(mockCreateWeeklyPracticeAttachment).toHaveBeenCalled();
    expect(mockUpdateWeeklyPracticeAttachment).not.toHaveBeenCalled();
    expect(mockDeleteRecordingObject).toHaveBeenCalledWith(
      "students/student-5/weekly-practice/wp-student5-recording-required/existing.webm"
    );
  });

  it("rejects when the ACTUAL uploaded object exceeds the size cap, and writes nothing — the client-declared fileSize is not trusted", async () => {
    const { InvalidRecordingError } = await import("@/lib/student-recordings");
    mockVerifyRecordingObject.mockRejectedValue(new InvalidRecordingError("Recording is too large"));

    await expect(
      confirmMyRecordingUpload(sessionStudent2, {
        weeklyPracticeId: "wp-student2-current",
        path: "students/student-2/weekly-practice/wp-student2-current/huge.webm",
        fileName: "huge.webm",
        mimeType: "audio/webm",
        fileSize: 1000, // declares a small size — the mock proves this is irrelevant
      })
    ).rejects.toThrow(InvalidRecordingError);

    expect(mockCreateWeeklyPracticeAttachment).not.toHaveBeenCalled();
    expect(mockUpdateWeeklyPracticeAttachment).not.toHaveBeenCalled();
    expect(mockDeleteWeeklyPracticeAttachment).not.toHaveBeenCalled();
  });

  it("rejects when the ACTUAL stored content-type is not on the allowlist, even though the client declared an allowed one — createSignedUploadUrl enforces no content-type constraint of its own, so the sign-time allowlist alone cannot be trusted", async () => {
    const { InvalidRecordingError } = await import("@/lib/student-recordings");
    mockVerifyRecordingObject.mockRejectedValue(new InvalidRecordingError("Unsupported recording type"));

    await expect(
      confirmMyRecordingUpload(sessionStudent2, {
        weeklyPracticeId: "wp-student2-current",
        path: "students/student-2/weekly-practice/wp-student2-current/sneaky.exe",
        fileName: "sneaky.exe",
        mimeType: "audio/webm", // declared an allowed type — the mock proves this is irrelevant
        fileSize: 1000,
      })
    ).rejects.toThrow(InvalidRecordingError);

    expect(mockCreateWeeklyPracticeAttachment).not.toHaveBeenCalled();
    expect(mockUpdateWeeklyPracticeAttachment).not.toHaveBeenCalled();
    expect(mockDeleteWeeklyPracticeAttachment).not.toHaveBeenCalled();
  });

  it("stores the server-verified size and mimeType, not the client-declared ones", async () => {
    mockVerifyRecordingObject.mockResolvedValue({ fileSize: 987654, mimeType: "audio/mp4" });
    const result = await confirmMyRecordingUpload(sessionStudent2, {
      weeklyPracticeId: "wp-student2-current",
      path: "students/student-2/weekly-practice/wp-student2-current/new.webm",
      fileName: "take1.webm",
      mimeType: "audio/webm", // deliberately wrong — the stored value must come from verification
      fileSize: 1, // deliberately wrong — the stored value must come from verification
    });
    expect(result.fileSize).toBe(987654);
    expect(result.mimeType).toBe("audio/mp4");
  });

  it("the confirm route cannot attach to an assignment the student does not own", async () => {
    await expect(
      confirmMyRecordingUpload(sessionStudent1, {
        weeklyPracticeId: "wp-student2-current",
        path: "students/student-1/weekly-practice/wp-student2-current/sneaky.webm",
        fileName: "sneaky.webm",
        mimeType: "audio/webm",
        fileSize: 1000,
      })
    ).rejects.toThrow(StudentAuthorizationError);
    expect(mockCreateWeeklyPracticeAttachment).not.toHaveBeenCalled();
  });

  it("rejects a path that doesn't match the calling student's own prefix, even for an assignment they own", async () => {
    await expect(
      confirmMyRecordingUpload(sessionStudent1, {
        weeklyPracticeId: "wp-student1-current",
        path: "students/student-2/weekly-practice/wp-student1-current/mismatched.webm",
        fileName: "mismatched.webm",
        mimeType: "audio/webm",
        fileSize: 1000,
      })
    ).rejects.toThrow(StudentAuthorizationError);
    expect(mockCreateWeeklyPracticeAttachment).not.toHaveBeenCalled();
  });
});

describe("getMyRecordingAttachment", () => {
  it("returns the calling student's own recording", async () => {
    const result = await getMyRecordingAttachment(sessionStudent5, "attachment-student5");
    expect(result).not.toBeNull();
    expect(result?.storagePath).toContain("wp-student5-recording-required");
  });

  it("a student cannot fetch another student's recording", async () => {
    const result = await getMyRecordingAttachment(sessionStudent1, "attachment-student5");
    expect(result).toBeNull();
  });

  it("returns null for a nonexistent attachment id", async () => {
    const result = await getMyRecordingAttachment(sessionStudent1, "attachment-does-not-exist");
    expect(result).toBeNull();
  });
});

describe("getMyCurrentAssignmentRecording", () => {
  it("returns the recording attached to the student's current assignment", async () => {
    const result = await getMyCurrentAssignmentRecording(sessionStudent5);
    expect(result?.id).toBe("attachment-student5");
  });

  it("returns null when the current assignment has no recording yet", async () => {
    const result = await getMyCurrentAssignmentRecording(sessionStudent1);
    expect(result).toBeNull();
  });
});

describe("TeacherPrivateNote is unreachable from the student side", () => {
  it("every exported student query function runs without touching prisma.teacherPrivateNote or prisma.milestone", async () => {
    // @/lib/db is mocked above WITHOUT `teacherPrivateNote` or `milestone`
    // keys — either being referenced anywhere in queries.ts would throw
    // here, not silently pass.
    await getCurrentAssignment(sessionStudent1);
    await listMyNotes(sessionStudent1);
    await listMyMilestones(sessionStudent1);
    await getCurrentMilestone(sessionStudent1);
    await listAchievedMilestones(sessionStudent1);
    await listMyPracticeLogEntries(sessionStudent1);
    await addMyPracticeLogEntry(sessionStudent1, {
      practicedAt: new Date("2026-08-12"),
      durationMinutes: 5,
      focus: "x",
    });
    expect(true).toBe(true);
  });
});
