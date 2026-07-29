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

const mockGenerateLink = vi.fn();
const mockDeleteUser = vi.fn();
const mockListUsers = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        generateLink: (...args: unknown[]) => mockGenerateLink(...args),
        deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
        listUsers: (...args: unknown[]) => mockListUsers(...args),
      },
    },
  },
}));

const mockNotifyStudentInvite = vi.fn();
vi.mock("@/lib/notifications", () => ({
  notificationService: {
    notifyStudentInvite: (...args: unknown[]) => mockNotifyStudentInvite(...args),
  },
}));

import { POST } from "@/app/api/admin/students/route";

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
    expect(mockGenerateLink).not.toHaveBeenCalled();
    expect(mockCreateStudent).not.toHaveBeenCalled();
  });

  it("creates the profile, links supabaseUserId, and sends the invite on success", async () => {
    mockFindUniqueStudent.mockResolvedValue(null);
    mockGenerateLink.mockResolvedValue({
      data: {
        properties: { action_link: "https://supabase.example/verify?token=abc" },
        user: { id: "auth-user-1" },
      },
      error: null,
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
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("returns 409 without creating any auth user when a StudentProfile already has this email", async () => {
    mockFindUniqueStudent.mockResolvedValue({ id: "existing-student", email: "new@example.com" });

    const res = await POST(buildRequest(validFields));

    expect(res.status).toBe(409);
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  it("adopts an orphaned auth user (email_exists, but no StudentProfile references it) instead of rejecting", async () => {
    const orphanFields = { ...validFields, email: "orphan@example.com" };
    // Same mock backs both the initial email lookup and the later
    // supabaseUserId lookup — both are expected to find nothing for a true orphan.
    mockFindUniqueStudent.mockResolvedValue(null);
    mockGenerateLink
      .mockResolvedValueOnce({
        data: null,
        error: { code: "email_exists", message: "already exists" },
      })
      .mockResolvedValueOnce({
        data: {
          properties: { action_link: "https://supabase.example/verify?token=fresh" },
          user: { id: "auth-orphan-1" },
        },
        error: null,
      });
    mockListUsers.mockResolvedValue({
      data: {
        users: [{ id: "auth-orphan-1", email: "orphan@example.com", email_confirmed_at: null }],
      },
      error: null,
    });
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
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("cleans up the newly-created Supabase user when the Prisma insert fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFindUniqueStudent.mockResolvedValue(null);
    mockGenerateLink.mockResolvedValue({
      data: {
        properties: { action_link: "https://supabase.example/verify?token=abc" },
        user: { id: "auth-user-3" },
      },
      error: null,
    });
    mockCreateStudent.mockRejectedValue(new Error("unique constraint violation"));
    mockDeleteUser.mockResolvedValue({ data: {}, error: null });

    const res = await POST(buildRequest(validFields));

    expect(res.status).toBe(500);
    expect(mockDeleteUser).toHaveBeenCalledWith("auth-user-3");
    errorSpy.mockRestore();
  });

  it("surfaces an error and logs it, without crashing, when both the Prisma insert AND the cleanup delete fail", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFindUniqueStudent.mockResolvedValue(null);
    mockGenerateLink.mockResolvedValue({
      data: {
        properties: { action_link: "https://supabase.example/verify?token=abc" },
        user: { id: "auth-user-4" },
      },
      error: null,
    });
    mockCreateStudent.mockRejectedValue(new Error("db unreachable"));
    mockDeleteUser.mockResolvedValue({ data: null, error: { message: "delete failed" } });

    const response = await POST(buildRequest(validFields));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeTruthy();
    // The delete failure must be logged, not silently swallowed.
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("still saves the student and returns a degraded success when the invite email fails to send", async () => {
    mockFindUniqueStudent.mockResolvedValue(null);
    mockGenerateLink.mockResolvedValue({
      data: {
        properties: { action_link: "https://supabase.example/verify?token=abc" },
        user: { id: "auth-user-5" },
      },
      error: null,
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
