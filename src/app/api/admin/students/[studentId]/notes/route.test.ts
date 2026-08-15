import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireAdminApi = vi.fn();
vi.mock("@/lib/admin/dal", () => ({
  requireAdminApi: () => mockRequireAdminApi(),
}));

const mockFindUniqueStudent = vi.fn();
const mockCreateStudentNote = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    studentProfile: {
      findUnique: (...args: unknown[]) => mockFindUniqueStudent(...args),
    },
    studentNote: {
      create: (...args: unknown[]) => mockCreateStudentNote(...args),
    },
  },
}));

import { POST } from "@/app/api/admin/students/[studentId]/notes/route";

function buildRequest(fields: Record<string, string>): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return new Request("http://localhost/api/admin/students/student-1/notes", {
    method: "POST",
    body: formData,
  });
}

function params(studentId = "student-1") {
  return { params: Promise.resolve({ studentId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminApi.mockResolvedValue({ session: { adminId: "admin-1" } });
  mockFindUniqueStudent.mockResolvedValue({ id: "student-1", email: "s1@example.com" });
  mockCreateStudentNote.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "note-1", createdAt: new Date("2026-08-15"), ...data })
  );
});

describe("POST /api/admin/students/[studentId]/notes", () => {
  it("rejects a non-admin caller before touching the database", async () => {
    mockRequireAdminApi.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const res = await POST(buildRequest({ body: "x", visibleToStudent: "true" }), params());
    expect(res.status).toBe(401);
    expect(mockCreateStudentNote).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown student", async () => {
    mockFindUniqueStudent.mockResolvedValue(null);
    const res = await POST(buildRequest({ body: "x", visibleToStudent: "true" }), params());
    expect(res.status).toBe(404);
    expect(mockCreateStudentNote).not.toHaveBeenCalled();
  });

  it("admin can create a visible note", async () => {
    const res = await POST(
      buildRequest({ body: "Great progress this week.", visibleToStudent: "true" }),
      params()
    );
    expect(res.status).toBe(200);
    const call = mockCreateStudentNote.mock.calls.at(-1)?.[0] as {
      data: { studentId: string; body: string; visibleToStudent: boolean };
    };
    expect(call.data.studentId).toBe("student-1");
    expect(call.data.body).toBe("Great progress this week.");
    expect(call.data.visibleToStudent).toBe(true);
  });

  it("admin can create a private note", async () => {
    const res = await POST(
      buildRequest({ body: "Avoiding the harder qignit.", visibleToStudent: "false" }),
      params()
    );
    expect(res.status).toBe(200);
    const call = mockCreateStudentNote.mock.calls.at(-1)?.[0] as {
      data: { visibleToStudent: boolean };
    };
    expect(call.data.visibleToStudent).toBe(false);
  });

  it("rejects an empty body", async () => {
    const res = await POST(buildRequest({ body: "", visibleToStudent: "true" }), params());
    expect(res.status).toBe(400);
    expect(mockCreateStudentNote).not.toHaveBeenCalled();
  });
});
