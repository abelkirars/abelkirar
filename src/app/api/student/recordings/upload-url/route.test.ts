import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireStudentApi = vi.fn();
vi.mock("@/lib/student/dal", () => ({
  requireStudentApi: () => mockRequireStudentApi(),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

const mockCreateMyRecordingUploadUrl = vi.fn();
vi.mock("@/lib/student/queries", () => {
  class StudentAuthorizationError extends Error {}
  return {
    createMyRecordingUploadUrl: (...args: unknown[]) => mockCreateMyRecordingUploadUrl(...args),
    StudentAuthorizationError,
  };
});

vi.mock("@/lib/student-recordings", () => {
  class InvalidRecordingError extends Error {}
  return { InvalidRecordingError };
});

import { POST } from "@/app/api/student/recordings/upload-url/route";
import { StudentAuthorizationError } from "@/lib/student/queries";
import { InvalidRecordingError } from "@/lib/student-recordings";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/student/recordings/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const sessionStudent1 = {
  studentId: "student-1",
  supabaseUserId: "sb-1",
  email: "student1@example.com",
  fullName: "Student One",
  locale: "en" as const,
};

const validBody = {
  weeklyPracticeId: "wp-1",
  mimeType: "audio/webm",
  fileSize: 1_000_000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudentApi.mockResolvedValue({ session: sessionStudent1 });
  mockCheckRateLimit.mockResolvedValue(true);
  mockCreateMyRecordingUploadUrl.mockResolvedValue({
    signedUrl: "https://signed.example/upload",
    token: "tok",
    path: "students/student-1/weekly-practice/wp-1/x.webm",
    bucket: "student-files",
  });
});

describe("POST /api/student/recordings/upload-url", () => {
  it("mints an upload URL using only the session's studentId", async () => {
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(200);
    const call = mockCreateMyRecordingUploadUrl.mock.calls.at(-1);
    expect(call?.[0]).toEqual(sessionStudent1);
  });

  it("rejects a body containing studentId, even alongside otherwise-valid fields", async () => {
    const res = await POST(buildRequest({ ...validBody, studentId: "student-2" }));
    expect(res.status).toBe(400);
    expect(mockCreateMyRecordingUploadUrl).not.toHaveBeenCalled();
  });

  it("a student cannot sign an upload for another student's assignment — the route surfaces 404, not a generic 500", async () => {
    mockCreateMyRecordingUploadUrl.mockRejectedValue(
      new StudentAuthorizationError("Cannot upload a recording to an assignment that isn't yours")
    );
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(404);
  });

  it("a disallowed mimeType is refused at sign-upload with a 400, not a 500", async () => {
    mockCreateMyRecordingUploadUrl.mockRejectedValue(new InvalidRecordingError("Unsupported recording type"));
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireStudentApi.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(401);
    expect(mockCreateMyRecordingUploadUrl).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(false);
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(429);
    expect(mockCreateMyRecordingUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects an invalid body", async () => {
    const res = await POST(buildRequest({ ...validBody, fileSize: -5 }));
    expect(res.status).toBe(400);
    expect(mockCreateMyRecordingUploadUrl).not.toHaveBeenCalled();
  });
});
