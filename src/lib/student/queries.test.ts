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
];

interface StudentNoteRow {
  id: string;
  studentId: string;
  weeklyPracticeId: string | null;
  body: string;
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

const mockFindManyStudentNote = vi.fn(
  ({ where, select }: { where: WhereClause; select?: SelectShape }) => {
    return studentNoteRows
      .filter((r) => r.studentId === where.studentId)
      .map((r) => applySelect(r, select));
  }
);

const mockCreateStudentNote = vi.fn(
  ({
    data,
    select,
  }: {
    data: { studentId: string; body: string; weeklyPracticeId: string | null };
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
    // No `milestone`, no `teacherPrivateNote` — see the note at the top of
    // this file.
  },
}));

import {
  getCurrentAssignment,
  listMyNotes,
  addMyNote,
  listMyMilestones,
  getCurrentMilestone,
  listAchievedMilestones,
  listMyPracticeLogEntries,
  addMyPracticeLogEntry,
  StudentAuthorizationError,
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

beforeEach(() => {
  vi.clearAllMocks();
  studentNoteRows = [
    {
      id: "note-1",
      studentId: "student-1",
      weeklyPracticeId: "wp-student1-current",
      body: "Struggled with string 4",
      createdAt: new Date("2026-08-11"),
    },
    {
      id: "note-2",
      studentId: "student-2",
      weeklyPracticeId: null,
      body: "Student 2's note",
      createdAt: new Date("2026-08-11"),
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
