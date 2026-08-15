import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireAdminApi = vi.fn();
vi.mock("@/lib/admin/dal", () => ({
  requireAdminApi: () => mockRequireAdminApi(),
}));

const mockFindUniqueStudentNote = vi.fn();
const mockUpdateStudentNote = vi.fn();
const mockDeleteStudentNote = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    studentNote: {
      findUnique: (...args: unknown[]) => mockFindUniqueStudentNote(...args),
      update: (...args: unknown[]) => mockUpdateStudentNote(...args),
      delete: (...args: unknown[]) => mockDeleteStudentNote(...args),
    },
  },
}));

import { PATCH, DELETE } from "@/app/api/admin/students/[studentId]/notes/[noteId]/route";

function buildRequest(method: string, fields?: Record<string, string>): Request {
  const formData = new FormData();
  if (fields) for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return new Request("http://localhost/api/admin/students/student-1/notes/note-1", {
    method,
    body: fields ? formData : undefined,
  });
}

function params(studentId = "student-1", noteId = "note-1") {
  return { params: Promise.resolve({ studentId, noteId }) };
}

const existingNote = {
  id: "note-1",
  studentId: "student-1",
  weeklyPracticeId: null,
  body: "Original body",
  visibleToStudent: true,
  createdAt: new Date("2026-08-10"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminApi.mockResolvedValue({ session: { adminId: "admin-1" } });
  mockFindUniqueStudentNote.mockResolvedValue(existingNote);
  mockUpdateStudentNote.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...existingNote, ...data })
  );
  mockDeleteStudentNote.mockResolvedValue(existingNote);
});

describe("PATCH /api/admin/students/[studentId]/notes/[noteId]", () => {
  it("returns 404 when the note belongs to a different student than the URL", async () => {
    mockFindUniqueStudentNote.mockResolvedValue({ ...existingNote, studentId: "student-2" });
    const res = await PATCH(buildRequest("PATCH", { body: "edited" }), params());
    expect(res.status).toBe(404);
    expect(mockUpdateStudentNote).not.toHaveBeenCalled();
  });

  it("edits the body and visibility", async () => {
    const res = await PATCH(
      buildRequest("PATCH", { body: "edited body", visibleToStudent: "false" }),
      params()
    );
    expect(res.status).toBe(200);
    const call = mockUpdateStudentNote.mock.calls.at(-1)?.[0] as {
      data: { body: string; visibleToStudent: boolean };
    };
    expect(call.data.body).toBe("edited body");
    expect(call.data.visibleToStudent).toBe(false);
  });
});

describe("DELETE /api/admin/students/[studentId]/notes/[noteId]", () => {
  it("returns 404 when the note belongs to a different student than the URL", async () => {
    mockFindUniqueStudentNote.mockResolvedValue({ ...existingNote, studentId: "student-2" });
    const res = await DELETE(buildRequest("DELETE"), params());
    expect(res.status).toBe(404);
    expect(mockDeleteStudentNote).not.toHaveBeenCalled();
  });

  it("deletes the note", async () => {
    const res = await DELETE(buildRequest("DELETE"), params());
    expect(res.status).toBe(200);
    expect(mockDeleteStudentNote).toHaveBeenCalledWith({ where: { id: "note-1" } });
  });
});
