import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireAdminApi = vi.fn();
vi.mock("@/lib/admin/dal", () => ({
  requireAdminApi: () => mockRequireAdminApi(),
}));

const mockCreateMilestone = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    milestone: {
      create: (...args: unknown[]) => mockCreateMilestone(...args),
    },
  },
}));

import { POST } from "@/app/api/admin/milestones/route";

function buildRequest(fields: Record<string, string>): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return new Request("http://localhost/api/admin/milestones", { method: "POST", body: formData });
}

const validFields = {
  level: "BEGINNER",
  label: "Foundation exercise mastered",
  sortOrder: "1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminApi.mockResolvedValue({ session: { adminId: "admin-1" } });
  mockCreateMilestone.mockResolvedValue({ id: "m-1", ...validFields });
});

describe("POST /api/admin/milestones", () => {
  it("rejects a non-admin caller before touching the database", async () => {
    mockRequireAdminApi.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const res = await POST(buildRequest(validFields));
    expect(res.status).toBe(401);
    expect(mockCreateMilestone).not.toHaveBeenCalled();
  });

  it("creates a milestone with the submitted fields, including internalCriteria", async () => {
    const res = await POST(
      buildRequest({
        ...validFields,
        description: "Play the foundation exercise cleanly.",
        internalCriteria: "INTERNAL: 56bpm, zero buzz",
      })
    );
    expect(res.status).toBe(200);
    const call = mockCreateMilestone.mock.calls.at(-1)?.[0] as {
      data: { level: string; label: string; internalCriteria: string | null };
    };
    expect(call.data.level).toBe("BEGINNER");
    expect(call.data.label).toBe("Foundation exercise mastered");
    expect(call.data.internalCriteria).toBe("INTERNAL: 56bpm, zero buzz");
  });

  it("rejects an invalid body", async () => {
    const res = await POST(buildRequest({ ...validFields, label: "" }));
    expect(res.status).toBe(400);
    expect(mockCreateMilestone).not.toHaveBeenCalled();
  });
});
