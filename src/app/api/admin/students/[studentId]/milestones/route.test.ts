import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireAdminApi = vi.fn();
vi.mock("@/lib/admin/dal", () => ({
  requireAdminApi: () => mockRequireAdminApi(),
}));

const mockFindUniqueMilestone = vi.fn();
const mockCreateStudentMilestone = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    milestone: {
      findUnique: (...args: unknown[]) => mockFindUniqueMilestone(...args),
    },
    studentMilestone: {
      create: (...args: unknown[]) => mockCreateStudentMilestone(...args),
    },
  },
}));

import { POST } from "@/app/api/admin/students/[studentId]/milestones/route";

function buildRequest(fields: Record<string, string>): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return new Request("http://localhost/api/admin/students/student-1/milestones", {
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
  mockFindUniqueMilestone.mockResolvedValue({ id: "m-1", level: "BEGINNER" });
  mockCreateStudentMilestone.mockResolvedValue({
    id: "sm-1",
    studentId: "student-1",
    milestoneId: "m-1",
    status: "IN_PROGRESS",
  });
});

describe("POST /api/admin/students/[studentId]/milestones", () => {
  it("assigns a milestone to the student", async () => {
    const res = await POST(buildRequest({ milestoneId: "m-1" }), params());
    expect(res.status).toBe(200);
    const call = mockCreateStudentMilestone.mock.calls.at(-1)?.[0] as {
      data: { studentId: string; milestoneId: string };
    };
    expect(call.data.studentId).toBe("student-1");
    expect(call.data.milestoneId).toBe("m-1");
  });

  it("returns 404 when the milestone doesn't exist — never assigns a nonexistent milestone", async () => {
    mockFindUniqueMilestone.mockResolvedValue(null);
    const res = await POST(buildRequest({ milestoneId: "m-nonexistent" }), params());
    expect(res.status).toBe(404);
    expect(mockCreateStudentMilestone).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdminApi.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const res = await POST(buildRequest({ milestoneId: "m-1" }), params());
    expect(res.status).toBe(401);
    expect(mockCreateStudentMilestone).not.toHaveBeenCalled();
  });
});
