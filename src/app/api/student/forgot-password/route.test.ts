import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUniqueStudent = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    studentProfile: {
      findUnique: (...args: unknown[]) => mockFindUniqueStudent(...args),
    },
  },
}));

const mockGenerateStudentRecoveryLink = vi.fn();
vi.mock("@/lib/supabase-admin-auth", () => ({
  generateStudentRecoveryLink: (...args: unknown[]) => mockGenerateStudentRecoveryLink(...args),
}));

const mockNotifyStudentPasswordReset = vi.fn();
vi.mock("@/lib/notifications", () => ({
  notificationService: {
    notifyStudentPasswordReset: (...args: unknown[]) => mockNotifyStudentPasswordReset(...args),
  },
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  clientIpFrom: () => "127.0.0.1",
}));

import { POST } from "@/app/api/student/forgot-password/route";

function buildRequest(email: string): Request {
  return new Request("http://localhost/api/student/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
  mockCheckRateLimit.mockResolvedValue(true);
});

describe("POST /api/student/forgot-password", () => {
  it("returns the exact same response for an existing, active student as for a nonexistent email", async () => {
    mockFindUniqueStudent.mockResolvedValueOnce({
      id: "student-1",
      email: "alice@example.com",
      fullName: "Alice",
      locale: "en",
      status: "ACTIVE",
    });
    mockGenerateStudentRecoveryLink.mockResolvedValue({
      actionLink: "https://supabase.example/verify?token=abc",
      supabaseUserId: "sb-user-1",
    });
    mockNotifyStudentPasswordReset.mockResolvedValue(undefined);

    const resExisting = await POST(buildRequest("alice@example.com"));
    const bodyExisting = await resExisting.json();

    mockFindUniqueStudent.mockResolvedValueOnce(null);
    const resMissing = await POST(buildRequest("nobody@example.com"));
    const bodyMissing = await resMissing.json();

    expect(resExisting.status).toBe(resMissing.status);
    expect(bodyExisting).toEqual(bodyMissing);
    expect(mockGenerateStudentRecoveryLink).toHaveBeenCalledTimes(1);
    expect(mockNotifyStudentPasswordReset).toHaveBeenCalledTimes(1);
  });

  it("does not generate or send a link for a deactivated student, but still returns the generic response", async () => {
    mockFindUniqueStudent.mockResolvedValue({
      id: "student-2",
      email: "bob@example.com",
      fullName: "Bob",
      locale: "en",
      status: "INACTIVE",
    });

    const res = await POST(buildRequest("bob@example.com"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockGenerateStudentRecoveryLink).not.toHaveBeenCalled();
    expect(mockNotifyStudentPasswordReset).not.toHaveBeenCalled();
  });

  it("still returns the generic response even if generating/sending the link throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFindUniqueStudent.mockResolvedValue({
      id: "student-1",
      email: "alice@example.com",
      fullName: "Alice",
      locale: "en",
      status: "ACTIVE",
    });
    mockGenerateStudentRecoveryLink.mockRejectedValue(new Error("Supabase is down"));

    const res = await POST(buildRequest("alice@example.com"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("returns 429 when the rate limit is exceeded, without looking up the student", async () => {
    mockCheckRateLimit.mockResolvedValue(false);

    const res = await POST(buildRequest("alice@example.com"));

    expect(res.status).toBe(429);
    expect(mockFindUniqueStudent).not.toHaveBeenCalled();
  });

  it("rejects a malformed email with 400", async () => {
    const res = await POST(buildRequest("not-an-email"));

    expect(res.status).toBe(400);
    expect(mockFindUniqueStudent).not.toHaveBeenCalled();
  });
});
