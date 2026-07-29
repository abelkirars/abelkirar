import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const mockRequireAdminApi = vi.fn();
vi.mock("@/lib/admin/dal", () => ({
  requireAdminApi: () => mockRequireAdminApi(),
}));

const mockFindUniqueStudent = vi.fn();
const mockUpdateStudent = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    studentProfile: {
      findUnique: (...args: unknown[]) => mockFindUniqueStudent(...args),
      update: (...args: unknown[]) => mockUpdateStudent(...args),
    },
  },
}));

const mockUpdateUserById = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        updateUserById: (...args: unknown[]) => mockUpdateUserById(...args),
      },
    },
  },
}));

const mockGenerateStudentInviteLink = vi.fn();
vi.mock("@/lib/supabase-admin-auth", () => ({
  generateStudentInviteLink: (...args: unknown[]) => mockGenerateStudentInviteLink(...args),
}));

const mockNotifyStudentInvite = vi.fn();
vi.mock("@/lib/notifications", () => ({
  notificationService: {
    notifyStudentInvite: (...args: unknown[]) => mockNotifyStudentInvite(...args),
  },
}));

import { PATCH } from "@/app/api/admin/students/[studentId]/email/route";

const baseStudent = {
  id: "student-1",
  supabaseUserId: "auth-user-1",
  email: "old@example.com",
  fullName: "Old Name",
  locale: "en",
  activatedAt: null,
};

function buildRequest(email: string): Request {
  const formData = new FormData();
  formData.set("email", email);
  return new Request("http://localhost/api/admin/students/student-1/email", {
    method: "PATCH",
    body: formData,
  });
}

function callPatch(request: Request) {
  return PATCH(request, { params: Promise.resolve({ studentId: "student-1" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
  mockRequireAdminApi.mockResolvedValue({ session: { adminId: "admin-1" } });
});

describe("PATCH /api/admin/students/[studentId]/email", () => {
  it("rejects a non-admin caller before any Supabase call happens", async () => {
    mockRequireAdminApi.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await callPatch(buildRequest("new@example.com"));

    expect(res.status).toBe(401);
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(mockUpdateStudent).not.toHaveBeenCalled();
  });

  it("updates both Prisma and Supabase and sends a fresh invite when the student has never activated", async () => {
    mockFindUniqueStudent
      .mockResolvedValueOnce(baseStudent) // initial lookup by studentId
      .mockResolvedValueOnce(null) // conflict check by new email
      .mockResolvedValueOnce({ ...baseStudent, email: "new@example.com" }); // final refetch
    mockUpdateStudent.mockResolvedValue({ ...baseStudent, email: "new@example.com" });
    mockUpdateUserById.mockResolvedValue({ data: {}, error: null });
    mockGenerateStudentInviteLink.mockResolvedValue({
      actionLink: "https://supabase.example/verify?token=fresh",
      supabaseUserId: "auth-user-1",
    });
    mockNotifyStudentInvite.mockResolvedValue(undefined);

    const res = await callPatch(buildRequest("new@example.com"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockUpdateStudent).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: { email: "new@example.com" },
    });
    expect(mockUpdateUserById).toHaveBeenCalledWith("auth-user-1", {
      email: "new@example.com",
      email_confirm: false,
    });
    expect(mockNotifyStudentInvite).toHaveBeenCalledWith(
      "new@example.com",
      "Old Name",
      "https://supabase.example/verify?token=fresh",
      "en"
    );
    // Only ever the corrective update, never a rollback in the success path.
    expect(mockUpdateStudent).toHaveBeenCalledTimes(1);
  });

  it("rejects with 409 and changes nothing when the student has already activated", async () => {
    mockFindUniqueStudent.mockResolvedValueOnce({
      ...baseStudent,
      activatedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const res = await callPatch(buildRequest("new@example.com"));

    expect(res.status).toBe(409);
    expect(mockUpdateStudent).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(mockGenerateStudentInviteLink).not.toHaveBeenCalled();
  });

  it("rejects with 409 and changes nothing when the new email is already used by another StudentProfile", async () => {
    mockFindUniqueStudent
      .mockResolvedValueOnce(baseStudent) // initial lookup
      .mockResolvedValueOnce({ id: "student-2", email: "new@example.com" }); // conflict found

    const res = await callPatch(buildRequest("new@example.com"));

    expect(res.status).toBe(409);
    expect(mockUpdateStudent).not.toHaveBeenCalled();
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it("rolls back the Prisma email change when the Supabase update fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFindUniqueStudent
      .mockResolvedValueOnce(baseStudent) // initial lookup
      .mockResolvedValueOnce(null); // conflict check
    mockUpdateStudent.mockResolvedValue({}); // both the forward update and the rollback succeed
    mockUpdateUserById.mockResolvedValue({ data: null, error: { message: "supabase is down" } });

    const res = await callPatch(buildRequest("new@example.com"));

    expect(res.status).toBe(500);
    // Forward update to the new email, then rollback update back to the old one.
    expect(mockUpdateStudent).toHaveBeenNthCalledWith(1, {
      where: { id: "student-1" },
      data: { email: "new@example.com" },
    });
    expect(mockUpdateStudent).toHaveBeenNthCalledWith(2, {
      where: { id: "student-1" },
      data: { email: "old@example.com" },
    });
    expect(mockUpdateStudent).toHaveBeenCalledTimes(2);
    expect(mockGenerateStudentInviteLink).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("surfaces an error and logs it, without crashing, when the rollback itself also fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFindUniqueStudent.mockResolvedValueOnce(baseStudent).mockResolvedValueOnce(null);
    mockUpdateStudent
      .mockResolvedValueOnce({}) // forward update succeeds
      .mockRejectedValueOnce(new Error("db unreachable during rollback")); // rollback fails
    mockUpdateUserById.mockResolvedValue({ data: null, error: { message: "supabase is down" } });

    const res = await callPatch(buildRequest("new@example.com"));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    // Both the original Supabase failure and the rollback failure must be
    // logged — this is exactly the out-of-sync state that needs a human,
    // so it must never be silently swallowed.
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
