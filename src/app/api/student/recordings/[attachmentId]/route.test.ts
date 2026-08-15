import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireStudentApi = vi.fn();
vi.mock("@/lib/student/dal", () => ({
  requireStudentApi: () => mockRequireStudentApi(),
}));

const mockGetMyRecordingAttachment = vi.fn();
vi.mock("@/lib/student/queries", () => ({
  getMyRecordingAttachment: (...args: unknown[]) => mockGetMyRecordingAttachment(...args),
}));

const mockGetRecordingSignedUrl = vi.fn();
vi.mock("@/lib/student-recordings", () => ({
  getRecordingSignedUrl: (...args: unknown[]) => mockGetRecordingSignedUrl(...args),
}));

import { GET } from "@/app/api/student/recordings/[attachmentId]/route";

const sessionStudent1 = {
  studentId: "student-1",
  supabaseUserId: "sb-1",
  email: "student1@example.com",
  fullName: "Student One",
  locale: "en" as const,
};

function params(attachmentId = "attachment-1") {
  return { params: Promise.resolve({ attachmentId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudentApi.mockResolvedValue({ session: sessionStudent1 });
  mockGetMyRecordingAttachment.mockResolvedValue({
    storagePath: "students/student-1/weekly-practice/wp-1/x.webm",
  });
  mockGetRecordingSignedUrl.mockResolvedValue("https://signed.example/view");
});

describe("GET /api/student/recordings/[attachmentId]", () => {
  it("redirects to a signed URL for the calling student's own recording", async () => {
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://signed.example/view");
    expect(mockGetMyRecordingAttachment).toHaveBeenCalledWith(sessionStudent1, "attachment-1");
  });

  it("a student cannot fetch another student's recording — 404, and no signed URL is ever minted", async () => {
    mockGetMyRecordingAttachment.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(404);
    expect(mockGetRecordingSignedUrl).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated, without looking up anything", async () => {
    mockRequireStudentApi.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(401);
    expect(mockGetMyRecordingAttachment).not.toHaveBeenCalled();
  });

  it("returns 500 if a signed URL can't be generated for an owned recording", async () => {
    mockGetRecordingSignedUrl.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), params());
    expect(res.status).toBe(500);
  });
});
