import { describe, it, expect, vi, beforeEach } from "vitest";

// This route is the first student WRITE path. The one thing that must be
// true no matter how the request body is shaped: the student identity comes
// ONLY from requireStudentApi()'s session, never from the body. These tests
// prove that structurally, not just for the field names we thought of.

const mockRequireStudentApi = vi.fn();
vi.mock("@/lib/student/dal", () => ({
  requireStudentApi: () => mockRequireStudentApi(),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  clientIpFrom: (request: Request) => request.headers.get("x-forwarded-for") ?? "unknown",
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

const mockAddMyPracticeLogEntry = vi.fn();
vi.mock("@/lib/student/queries", () => ({
  addMyPracticeLogEntry: (...args: unknown[]) => mockAddMyPracticeLogEntry(...args),
}));

import { POST } from "@/app/api/student/practice-log/route";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/student/practice-log", {
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
  practicedAt: "2026-08-12",
  durationMinutes: 20,
  focus: "String crossing",
  selfRating: "Focused",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudentApi.mockResolvedValue({ session: sessionStudent1 });
  mockCheckRateLimit.mockResolvedValue(true);
  mockAddMyPracticeLogEntry.mockResolvedValue({
    id: "ple-1",
    practicedAt: "2026-08-12T00:00:00.000Z",
    durationMinutes: 20,
    focus: "String crossing",
    selfRating: "Focused",
    weeklyPracticeId: null,
  });
});

describe("POST /api/student/practice-log", () => {
  it("creates an entry using only the session's studentId", async () => {
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(200);
    const call = mockAddMyPracticeLogEntry.mock.calls.at(-1);
    expect(call?.[0]).toEqual(sessionStudent1);
  });

  it("rejects a body containing studentProfileId, even alongside otherwise-valid fields", async () => {
    const res = await POST(buildRequest({ ...validBody, studentProfileId: "student-2" }));
    expect(res.status).toBe(400);
    expect(mockAddMyPracticeLogEntry).not.toHaveBeenCalled();
  });

  it("rejects a body containing studentId, even alongside otherwise-valid fields", async () => {
    const res = await POST(buildRequest({ ...validBody, studentId: "student-2" }));
    expect(res.status).toBe(400);
    expect(mockAddMyPracticeLogEntry).not.toHaveBeenCalled();
  });

  it("cannot create an entry for another student however the body is shaped: the write always uses the session, never the body", async () => {
    await POST(buildRequest(validBody));
    const call = mockAddMyPracticeLogEntry.mock.calls.at(-1);
    expect((call?.[0] as { studentId: string }).studentId).toBe("student-1");
  });

  it("returns 401 and never calls addMyPracticeLogEntry when unauthenticated", async () => {
    mockRequireStudentApi.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(401);
    expect(mockAddMyPracticeLogEntry).not.toHaveBeenCalled();
  });

  it("returns 429 and never calls addMyPracticeLogEntry when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(false);
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(429);
    expect(mockAddMyPracticeLogEntry).not.toHaveBeenCalled();
  });

  it("rejects an invalid body (negative duration) without calling addMyPracticeLogEntry", async () => {
    const res = await POST(buildRequest({ ...validBody, durationMinutes: -5 }));
    expect(res.status).toBe(400);
    expect(mockAddMyPracticeLogEntry).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await POST(buildRequest("not json"));
    expect(res.status).toBe(400);
    expect(mockAddMyPracticeLogEntry).not.toHaveBeenCalled();
  });

  it("the returned entry contains no admin-only field and no studentId", async () => {
    const res = await POST(buildRequest(validBody));
    const data = await res.json();
    expect(Object.keys(data.entry).sort()).toEqual(
      ["durationMinutes", "focus", "id", "practicedAt", "selfRating", "weeklyPracticeId"].sort()
    );
  });
});
