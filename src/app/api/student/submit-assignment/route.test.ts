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

const mockSubmitCurrentAssignment = vi.fn();
// Hand-rolled equivalent of the real AssignmentSubmissionError, same
// pattern used for OrderCreationError in src/app/api/orders/route.test.ts —
// the route does `instanceof AssignmentSubmissionError`, so the mock must
// export a class the route's own `instanceof` check actually recognizes.
vi.mock("@/lib/student/queries", () => {
  class AssignmentSubmissionError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    submitCurrentAssignment: (...args: unknown[]) => mockSubmitCurrentAssignment(...args),
    AssignmentSubmissionError,
  };
});

import { POST } from "@/app/api/student/submit-assignment/route";
import { AssignmentSubmissionError } from "@/lib/student/queries";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/student/submit-assignment", {
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

const validBody = { studentSubmission: "Practiced the etude at 60bpm." };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireStudentApi.mockResolvedValue({ session: sessionStudent1 });
  mockCheckRateLimit.mockResolvedValue(true);
  mockSubmitCurrentAssignment.mockResolvedValue({
    id: "wp-1",
    status: "SUBMITTED",
    studentSubmission: validBody.studentSubmission,
    submittedAt: "2026-08-15T00:00:00.000Z",
  });
});

describe("POST /api/student/submit-assignment", () => {
  it("submits using only the session's studentId", async () => {
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(200);
    const call = mockSubmitCurrentAssignment.mock.calls.at(-1);
    expect(call?.[0]).toEqual(sessionStudent1);
  });

  it("rejects a body containing studentId, even alongside otherwise-valid fields", async () => {
    const res = await POST(buildRequest({ ...validBody, studentId: "student-2" }));
    expect(res.status).toBe(400);
    expect(mockSubmitCurrentAssignment).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireStudentApi.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(401);
    expect(mockSubmitCurrentAssignment).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue(false);
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(429);
    expect(mockSubmitCurrentAssignment).not.toHaveBeenCalled();
  });

  it("rejects an empty submission", async () => {
    const res = await POST(buildRequest({ studentSubmission: "" }));
    expect(res.status).toBe(400);
    expect(mockSubmitCurrentAssignment).not.toHaveBeenCalled();
  });

  it("surfaces the recording-required message plainly, not a generic failure", async () => {
    mockSubmitCurrentAssignment.mockRejectedValue(
      new AssignmentSubmissionError(
        "This assignment requires a recording, and recording upload isn't available yet. Ask your teacher for guidance.",
        "RECORDING_REQUIRED"
      )
    );
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/recording upload isn't available yet/i);
  });

  it("refuses resubmission of an already-submitted assignment with its own message, not a generic failure", async () => {
    mockSubmitCurrentAssignment.mockRejectedValue(
      new AssignmentSubmissionError(
        "This assignment has already been submitted. Ask your teacher to reopen it before submitting again.",
        "ALREADY_SUBMITTED"
      )
    );
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toMatch(/already been submitted/i);
  });

  it("returns 404 when there is no current assignment to submit", async () => {
    mockSubmitCurrentAssignment.mockRejectedValue(
      new AssignmentSubmissionError("No assignment to submit.", "NOT_FOUND")
    );
    const res = await POST(buildRequest(validBody));
    expect(res.status).toBe(404);
  });
});
