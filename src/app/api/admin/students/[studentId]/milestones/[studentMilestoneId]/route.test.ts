import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireAdminApi = vi.fn();
vi.mock("@/lib/admin/dal", () => ({
  requireAdminApi: () => mockRequireAdminApi(),
}));

const mockFindUniqueStudentMilestone = vi.fn();
const mockUpdateStudentMilestone = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    studentMilestone: {
      findUnique: (...args: unknown[]) => mockFindUniqueStudentMilestone(...args),
      update: (...args: unknown[]) => mockUpdateStudentMilestone(...args),
    },
  },
}));

import { PATCH } from "@/app/api/admin/students/[studentId]/milestones/[studentMilestoneId]/route";

function buildRequest(fields: Record<string, string>): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return new Request("http://localhost/api/admin/students/student-1/milestones/sm-1", {
    method: "PATCH",
    body: formData,
  });
}

function params(studentId = "student-1", studentMilestoneId = "sm-1") {
  return { params: Promise.resolve({ studentId, studentMilestoneId }) };
}

const existing = {
  id: "sm-1",
  studentId: "student-1",
  milestoneId: "m-1",
  status: "IN_PROGRESS",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminApi.mockResolvedValue({ session: { adminId: "admin-1" } });
  mockFindUniqueStudentMilestone.mockResolvedValue(existing);
  mockUpdateStudentMilestone.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...existing, ...data })
  );
});

describe("PATCH /api/admin/students/[studentId]/milestones/[studentMilestoneId] (approve)", () => {
  it("returns 404 when the row belongs to a different student than the URL", async () => {
    mockFindUniqueStudentMilestone.mockResolvedValue({ ...existing, studentId: "student-2" });
    const res = await PATCH(buildRequest({ teacherComment: "Great!" }), params("student-1"));
    expect(res.status).toBe(404);
    expect(mockUpdateStudentMilestone).not.toHaveBeenCalled();
  });

  it("marks the milestone achieved and sets achievedAt/signedOffById from the session — never client-suppliable", async () => {
    const res = await PATCH(buildRequest({ teacherComment: "Great control!" }), params());
    expect(res.status).toBe(200);
    const call = mockUpdateStudentMilestone.mock.calls.at(-1)?.[0] as {
      data: { status: string; achievedAt: Date; signedOffById: string; teacherComment: string };
    };
    expect(call.data.status).toBe("ACHIEVED");
    expect(call.data.signedOffById).toBe("admin-1");
    expect(call.data.achievedAt).toBeInstanceOf(Date);
    expect(call.data.teacherComment).toBe("Great control!");
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdminApi.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const res = await PATCH(buildRequest({}), params());
    expect(res.status).toBe(401);
    expect(mockFindUniqueStudentMilestone).not.toHaveBeenCalled();
  });
});
