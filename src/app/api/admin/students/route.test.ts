import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequireAdminApi = vi.fn();
vi.mock("@/lib/admin/dal", () => ({
  requireAdminApi: () => mockRequireAdminApi(),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockFindUniqueStudent = vi.fn();
const mockCreateStudent = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    studentProfile: {
      findUnique: (...args: unknown[]) => mockFindUniqueStudent(...args),
      create: (...args: unknown[]) => mockCreateStudent(...args),
    },
  },
}));

const mockGenerateStudentInviteLink = vi.fn();
const mockGenerateStudentRecoveryLink = vi.fn();
const mockDeleteSupabaseUser = vi.fn();
const mockFindSupabaseUserByEmail = vi.fn();
// The route imports from @/lib/supabase-admin-auth directly, not
// @/lib/supabase-admin — mock at that boundary, not one level deeper.
// Previously this mocked @/lib/supabase-admin only, which still let the
// real supabase-admin-auth.ts module load; that was harmless until it
// gained its own `import "server-only"` line, which throws outside Next's
// webpack build (Vitest included) regardless of whether the code is
// genuinely server-side. See docs/DECISIONS.md's server-only-guard entry.
vi.mock("@/lib/supabase-admin-auth", () => {
  class StudentInviteError extends Error {
    code?: string;
    constructor(message: string, code?: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    generateStudentInviteLink: (...args: unknown[]) => mockGenerateStudentInviteLink(...args),
    generateStudentRecoveryLink: (...args: unknown[]) => mockGenerateStudentRecoveryLink(...args),
    deleteSupabaseUser: (...args: unknown[]) => mockDeleteSupabaseUser(...args),
    findSupabaseUserByEmail: (...args: unknown[]) => mockFindSupabaseUserByEmail(...args),
    StudentInviteError,
  };
});

const mockNotifyStudentInvite = vi.fn();
vi.mock("@/lib/notifications", () => ({
  notificationService: {
    notifyStudentInvite: (...args: unknown[]) => mockNotifyStudentInvite(...args),
  },
}));

import { POST } from "@/app/api/admin/students/route";
import { StudentInviteError } from "@/lib/supabase-admin-auth";

function buildRequest(fields: Record<string, string>): Request {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return new Request("http://localhost/api/admin/students", { method: "POST", body: formData });
}

const validFields = {
  fullName: "New Student",
  email: "new@example.com",
  enrollmentDate: "2026-01-01",
  status: "ACTIVE",
  locale: "en",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
  mockRequireAdminApi.mockResolvedValue({ session: { adminId: "admin-1" } });
  mockCheckRateLimit.mockResolvedValue(true);
});

describe("POST /api/admin/students", () => {
  it("rejects a non-admin caller before any Supabase call happens", async () => {
    mockRequireAdminApi.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await POST(buildRequest(validFields));

    expect(res.status).toBe(401);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockGenerateStudentInviteLink).not.toHaveBeenCalled();
    expect(mockCreateStudent).not.toHaveBeenCalled();
  });

  it("creates the profile, links supabaseUserId, and sends the invite on success", async () => {
    mockFindUniqueStudent.mockResolvedValue(null);
    mockGenerateStudentInviteLink.mockResolvedValue({
      actionLink: "https://supabase.example/verify?token=abc",
      supabaseUserId: "auth-user-1",
    });
    mockCreateStudent.mockResolvedValue({
      id: "student-1",
      email: "new@example.com",
      fullName: "New Student",
      supabaseUserId: "auth-user-1",
    });
    mockNotifyStudentInvite.mockResolvedValue({ sent: true });

    const res = await POST(buildRequest(validFields));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.emailSent).toBe(true);
    expect(mockCreateStudent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ supabaseUserId: "auth-user-1", email: "new@example.com" }),
      })
    );
    expect(mockNotifyStudentInvite).toHaveBeenCalledWith(
      "new@example.com",
      "New Student",
      "https://supabase.example/verify?token=abc",
      "en"
    );
    expect(mockDeleteSupabaseUser).not.toHaveBeenCalled();
  });

  it("returns 409 without creating any auth user when a StudentProfile already has this email", async () => {
    mockFindUniqueStudent.mockResolvedValue({ id: "existing-student", email: "new@example.com" });

    const res = await POST(buildRequest(validFields));

    expect(res.status).toBe(409);
    expect(mockGenerateStudentInviteLink).not.toHaveBeenCalled();
  });

  it("adopts an orphaned auth user (email_exists, but no StudentProfile references it) instead of rejecting", async () => {
    const orphanFields = { ...validFields, email: "orphan@example.com" };
    // Same mock backs both the initial email lookup and the later
    // supabaseUserId lookup — both are expected to find nothing for a true orphan.
    mockFindUniqueStudent.mockResolvedValue(null);
    mockGenerateStudentInviteLink
      .mockRejectedValueOnce(new StudentInviteError("already exists", "email_exists"))
      .mockResolvedValueOnce({
        actionLink: "https://supabase.example/verify?token=fresh",
        supabaseUserId: "auth-orphan-1",
      });
    mockFindSupabaseUserByEmail.mockResolvedValue({ id: "auth-orphan-1", emailConfirmedAt: null });
    mockCreateStudent.mockResolvedValue({
      id: "student-2",
      email: "orphan@example.com",
      fullName: "Orphan Student",
      supabaseUserId: "auth-orphan-1",
    });

    const res = await POST(buildRequest({ ...orphanFields, fullName: "Orphan Student" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockCreateStudent).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ supabaseUserId: "auth-orphan-1" }) })
    );
    expect(mockDeleteSupabaseUser).not.toHaveBeenCalled();
  });

  // This used to be two tests: one where the cleanup delete succeeds, one
  // where it also fails. That distinction was only observable by mocking
  // the raw Supabase SDK error response directly. Now that the mock
  // boundary is @/lib/supabase-admin-auth (see the module-level comment
  // above), deleteSupabaseUser's own internal error handling is hidden
  // behind the mock — the real function never surfaces a failure to its
  // caller; it's void and self-logging by design (see its doc comment in
  // supabase-admin-auth.ts). The route genuinely cannot tell the two cases
  // apart anymore, so keeping both tests would mean one passed for the
  // wrong reason. Merged into one.
  it("cleans up the newly-created Supabase user, logs, and returns 500 when the Prisma insert fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFindUniqueStudent.mockResolvedValue(null);
    mockGenerateStudentInviteLink.mockResolvedValue({
      actionLink: "https://supabase.example/verify?token=abc",
      supabaseUserId: "auth-user-3",
    });
    mockCreateStudent.mockRejectedValue(new Error("unique constraint violation"));
    mockDeleteSupabaseUser.mockResolvedValue(undefined);

    const res = await POST(buildRequest(validFields));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(mockDeleteSupabaseUser).toHaveBeenCalledWith("auth-user-3");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("still saves the student and returns a degraded success when the invite email fails to send", async () => {
    mockFindUniqueStudent.mockResolvedValue(null);
    mockGenerateStudentInviteLink.mockResolvedValue({
      actionLink: "https://supabase.example/verify?token=abc",
      supabaseUserId: "auth-user-5",
    });
    mockCreateStudent.mockResolvedValue({
      id: "student-5",
      email: "new@example.com",
      fullName: "New Student",
      supabaseUserId: "auth-user-5",
    });
    // notifyStudentInvite never throws (sendEmail catches both thrown and
    // API-level Resend failures) — a failed send resolves with sent:false.
    mockNotifyStudentInvite.mockResolvedValue({
      sent: false,
      error: "The abelkirar.com domain is not verified.",
    });

    const res = await POST(buildRequest(validFields));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.emailSent).toBe(false);
    expect(body.emailError).toBe("The abelkirar.com domain is not verified.");
  });
});
