import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireAdminApi = vi.fn();
vi.mock("@/lib/admin/dal", () => ({
  requireAdminApi: () => mockRequireAdminApi(),
}));

const mockFindUniqueWeeklyPracticeAttachment = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    weeklyPracticeAttachment: {
      findUnique: (...args: unknown[]) => mockFindUniqueWeeklyPracticeAttachment(...args),
    },
  },
}));

const mockGetRecordingSignedUrl = vi.fn();
vi.mock("@/lib/student-recordings", () => ({
  getRecordingSignedUrl: (...args: unknown[]) => mockGetRecordingSignedUrl(...args),
}));

import { GET } from "@/app/api/admin/students/[studentId]/weekly-practice/[weeklyPracticeId]/recordings/[attachmentId]/route";

function params(
  studentId = "student-1",
  weeklyPracticeId = "wp-1",
  attachmentId = "attachment-1"
) {
  return { params: Promise.resolve({ studentId, weeklyPracticeId, attachmentId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminApi.mockResolvedValue({ session: { adminId: "admin-1" } });
  mockFindUniqueWeeklyPracticeAttachment.mockResolvedValue({
    storagePath: "students/student-1/weekly-practice/wp-1/x.webm",
    weeklyPracticeId: "wp-1",
    weeklyPractice: { studentId: "student-1" },
  });
  mockGetRecordingSignedUrl.mockResolvedValue("https://signed.example/view");
});

describe("GET .../recordings/[attachmentId] (admin)", () => {
  it("redirects to a signed URL when the URL's studentId/weeklyPracticeId match the attachment", async () => {
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://signed.example/view");
  });

  it("404s when the attachment's assignment doesn't match the studentId in the URL", async () => {
    mockFindUniqueWeeklyPracticeAttachment.mockResolvedValue({
      storagePath: "students/student-2/weekly-practice/wp-1/x.webm",
      weeklyPracticeId: "wp-1",
      weeklyPractice: { studentId: "student-2" },
    });
    const res = await GET(new Request("http://localhost"), params("student-1"));
    expect(res.status).toBe(404);
    expect(mockGetRecordingSignedUrl).not.toHaveBeenCalled();
  });

  it("404s when the attachment's weeklyPracticeId doesn't match the URL", async () => {
    const res = await GET(new Request("http://localhost"), params("student-1", "wp-different"));
    expect(res.status).toBe(404);
    expect(mockGetRecordingSignedUrl).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAdminApi.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(401);
    expect(mockFindUniqueWeeklyPracticeAttachment).not.toHaveBeenCalled();
  });
});
