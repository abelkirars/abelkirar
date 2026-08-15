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

const mockConfirmMyRecordingUpload = vi.fn();
vi.mock("@/lib/student/queries", () => {
  class StudentAuthorizationError extends Error {}
  return {
    confirmMyRecordingUpload: (...args: unknown[]) => mockConfirmMyRecordingUpload(...args),
    StudentAuthorizationError,
  };
});

vi.mock("@/lib/student-recordings", () => {
  class InvalidRecordingError extends Error {}
  return { InvalidRecordingError };
});

import { POST } from "@/app/api/student/recordings/confirm/route";
import { StudentAuthorizationError } from "@/lib/student/queries";
import { InvalidRecordingError } from "@/lib/student-recordings";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/student/recordings/confirm", {
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
  path: "students/student-1/weekly-practice/wp-1/x.webm",
  fileName: "recording.webm",
  mimeType: "audio/webm",
  fileSize: 1_000_000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudentApi.mockResolvedValue({ session: sessionStudent1 });
  mockCheckRateLimit.mockResolvedValue(true);
  mockConfirmMyRecordingUpload.mockResolvedValue({
    id: "attachment-1",
    fileName: "recording.webm",
    mimeType: "audio/webm",
    fileSize: 1_000_000,
    createdAt: "2026-08-16T00:00:00.000Z",
  });
});

describe("POST /api/student/recordings/confirm", () => {
  it("confirms using only the session's studentId", async () => {
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(200);
    const call = mockConfirmMyRecordingUpload.mock.calls.at(-1);
    expect(call?.[0]).toEqual(sessionStudent1);
  });

  it("rejects a body containing studentId, even alongside otherwise-valid fields", async () => {
    const res = await POST(buildRequest({ ...validBody, studentId: "student-2" }));
    expect(res.status).toBe(400);
    expect(mockConfirmMyRecordingUpload).not.toHaveBeenCalled();
  });

  it("the confirm route cannot attach to an assignment the student does not own — surfaces 404, not a generic 500", async () => {
    mockConfirmMyRecordingUpload.mockRejectedValue(
      new StudentAuthorizationError("Cannot attach a recording to an assignment that isn't yours")
    );
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(404);
  });

  it("returns 400, not a generic 500, when the actual uploaded object fails server-side verification (size or mimeType)", async () => {
    mockConfirmMyRecordingUpload.mockRejectedValue(
      new InvalidRecordingError("Recording is too large")
    );
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Recording is too large");
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireStudentApi.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(401);
    expect(mockConfirmMyRecordingUpload).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(false);
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(429);
    expect(mockConfirmMyRecordingUpload).not.toHaveBeenCalled();
  });

  it("rejects an invalid body", async () => {
    const res = await POST(buildRequest({ ...validBody, path: "" }));
    expect(res.status).toBe(400);
    expect(mockConfirmMyRecordingUpload).not.toHaveBeenCalled();
  });
});
