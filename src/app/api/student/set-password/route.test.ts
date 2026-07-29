import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSetSession = vi.fn();
const mockUpdateUser = vi.fn();
const mockSignOut = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      setSession: (...args: unknown[]) => mockSetSession(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
  }),
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

import { POST } from "@/app/api/student/set-password/route";

function buildRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/student/set-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  access_token: "at-1",
  refresh_token: "rt-1",
  password: "correct-horse-battery-staple",
  confirmPassword: "correct-horse-battery-staple",
};

const activeStudent = {
  id: "student-1",
  supabaseUserId: "sb-user-1",
  status: "ACTIVE",
  activatedAt: null as Date | null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSetSession.mockResolvedValue({
    data: { session: { access_token: "at-1" }, user: { id: "sb-user-1" } },
    error: null,
  });
});

describe("POST /api/student/set-password", () => {
  it("sets activatedAt and succeeds when the student has never activated before", async () => {
    mockFindUniqueStudent.mockResolvedValue(activeStudent);
    mockUpdateUser.mockResolvedValue({ data: { user: {} }, error: null });

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: validBody.password });
    expect(mockUpdateStudent).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: { activatedAt: expect.any(Date) },
    });
  });

  it("does not overwrite an existing activatedAt on a later password reset", async () => {
    const firstActivation = new Date("2026-01-01T00:00:00Z");
    mockFindUniqueStudent.mockResolvedValue({ ...activeStudent, activatedAt: firstActivation });
    mockUpdateUser.mockResolvedValue({ data: { user: {} }, error: null });

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(200);
    expect(mockUpdateStudent).not.toHaveBeenCalled();
  });

  it("rejects an expired or already-used token without ever calling updateUser", async () => {
    mockSetSession.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Email link is invalid or has expired" },
    });

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_or_expired_link");
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockFindUniqueStudent).not.toHaveBeenCalled();
  });

  it("surfaces weak_password with reasons (leaked-password protection) instead of a generic failure", async () => {
    mockFindUniqueStudent.mockResolvedValue(activeStudent);
    mockUpdateUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Password is known to be weak", code: "weak_password", reasons: ["pwned"] },
    });

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("weak_password");
    expect(body.reasons).toEqual(["pwned"]);
    expect(mockUpdateStudent).not.toHaveBeenCalled();
  });

  it("blocks a deactivated student, signs them out, and never calls updateUser", async () => {
    mockFindUniqueStudent.mockResolvedValue({ ...activeStudent, status: "INACTIVE" });

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("account_inactive");
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("signs out and rejects when the session is valid but no StudentProfile matches (orphaned)", async () => {
    mockFindUniqueStudent.mockResolvedValue(null);

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("account_not_found");
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("rejects with 400 when password and confirmPassword don't match, before establishing any session", async () => {
    const res = await POST(buildRequest({ ...validBody, confirmPassword: "something-else" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("passwords_dont_match");
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("rejects a malformed request body", async () => {
    const res = await POST(buildRequest({ password: "short" }));

    expect(res.status).toBe(400);
    expect(mockSetSession).not.toHaveBeenCalled();
  });
});
