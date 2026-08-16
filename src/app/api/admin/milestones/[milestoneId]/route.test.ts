import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireAdminApi = vi.fn();
vi.mock("@/lib/admin/dal", () => ({
  requireAdminApi: () => mockRequireAdminApi(),
}));

const mockFindUniqueMilestone = vi.fn();
const mockUpdateMilestone = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    milestone: {
      findUnique: (...args: unknown[]) => mockFindUniqueMilestone(...args),
      update: (...args: unknown[]) => mockUpdateMilestone(...args),
    },
  },
}));

import { PATCH } from "@/app/api/admin/milestones/[milestoneId]/route";

function buildRequest(fields: Record<string, string>): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return new Request("http://localhost/api/admin/milestones/m-1", {
    method: "PATCH",
    body: formData,
  });
}

function params(milestoneId = "m-1") {
  return { params: Promise.resolve({ milestoneId }) };
}

const existingMilestone = {
  id: "m-1",
  level: "BEGINNER",
  label: "Foundation exercise mastered",
  description: null,
  internalCriteria: null,
  sortOrder: 1,
  active: true,
  effectiveFrom: new Date("2026-08-01"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminApi.mockResolvedValue({ session: { adminId: "admin-1" } });
  mockFindUniqueMilestone.mockResolvedValue(existingMilestone);
  mockUpdateMilestone.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...existingMilestone, ...data })
  );
});

describe("PATCH /api/admin/milestones/[milestoneId]", () => {
  it("returns 404 for an unknown milestone", async () => {
    mockFindUniqueMilestone.mockResolvedValue(null);
    const res = await PATCH(buildRequest({ level: "BEGINNER", label: "Updated", sortOrder: "1" }), params());
    expect(res.status).toBe(404);
    expect(mockUpdateMilestone).not.toHaveBeenCalled();
  });

  it("edits the milestone", async () => {
    const res = await PATCH(
      buildRequest({ level: "BEGINNER", label: "Updated label", sortOrder: "2", active: "false" }),
      params()
    );
    expect(res.status).toBe(200);
    const call = mockUpdateMilestone.mock.calls.at(-1)?.[0] as {
      data: { label: string; active: boolean };
    };
    expect(call.data.label).toBe("Updated label");
    expect(call.data.active).toBe(false);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdminApi.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const res = await PATCH(buildRequest({ level: "BEGINNER", label: "x", sortOrder: "1" }), params());
    expect(res.status).toBe(401);
    expect(mockFindUniqueMilestone).not.toHaveBeenCalled();
  });
});
