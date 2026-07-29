import { describe, it, expect, vi, beforeEach } from "vitest";

const mockReadStudentAuthUser = vi.fn();
vi.mock("@/lib/student/session", () => ({
  readStudentAuthUser: () => mockReadStudentAuthUser(),
}));

const mockFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    studentProfile: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

const mockSignOut = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signOut: mockSignOut } }),
}));

// next/navigation's real redirect() throws internally (NEXT_REDIRECT) to
// unwind the render — mimic that so requireStudentPage's control flow (and
// its "did it redirect, and to where" assertions) behaves like production.
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => mockRedirect(url),
}));

import { requireStudentPage, requireStudentApi } from "@/lib/student/dal";

const activeProfile = {
  id: "student-1",
  supabaseUserId: "sb-user-1",
  email: "alice@example.com",
  fullName: "Alice",
  status: "ACTIVE",
  locale: "en",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireStudentApi", () => {
  it("rejects with 401 when there is no Supabase session", async () => {
    mockReadStudentAuthUser.mockResolvedValue(null);

    const result = await requireStudentApi();

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(401);
    }
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("rejects with 401 and a distinct body when the session is valid but no StudentProfile matches (orphaned)", async () => {
    mockReadStudentAuthUser.mockResolvedValue({
      supabaseUserId: "sb-user-1",
      email: "alice@example.com",
    });
    mockFindUnique.mockResolvedValue(null);

    const result = await requireStudentApi();

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(401);
      const body = await result.response.json();
      expect(body.error).toBe("Account not found");
    }
  });

  it("rejects with 401 and a distinct generic body when the StudentProfile is INACTIVE", async () => {
    mockReadStudentAuthUser.mockResolvedValue({
      supabaseUserId: "sb-user-1",
      email: "alice@example.com",
    });
    mockFindUnique.mockResolvedValue({ ...activeProfile, status: "INACTIVE" });

    const result = await requireStudentApi();

    expect("response" in result).toBe(true);
    if ("response" in result) {
      expect(result.response.status).toBe(401);
      const body = await result.response.json();
      expect(body.error).toBe("Account inactive");
    }
  });

  it("returns only that student's id when the profile is ACTIVE", async () => {
    mockReadStudentAuthUser.mockResolvedValue({
      supabaseUserId: "sb-user-1",
      email: "alice@example.com",
    });
    mockFindUnique.mockResolvedValue(activeProfile);

    const result = await requireStudentApi();

    expect("session" in result).toBe(true);
    if ("session" in result) {
      expect(result.session.studentId).toBe("student-1");
      expect(result.session.email).toBe("alice@example.com");
      expect(result.session.fullName).toBe("Alice");
    }
  });

  it("scopes the profile lookup strictly to the authenticated user's own supabaseUserId", async () => {
    mockReadStudentAuthUser.mockResolvedValue({
      supabaseUserId: "sb-user-2",
      email: "bob@example.com",
    });
    mockFindUnique.mockResolvedValue({
      id: "student-2",
      supabaseUserId: "sb-user-2",
      email: "bob@example.com",
      fullName: "Bob",
      status: "ACTIVE",
      locale: "en",
    });

    const result = await requireStudentApi();

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { supabaseUserId: "sb-user-2" },
    });
    if ("session" in result) {
      expect(result.session.studentId).toBe("student-2");
      expect(result.session.studentId).not.toBe("student-1");
    }
  });
});

describe("requireStudentPage", () => {
  it("redirects to /student/login with no error param when there is no session, and does not sign out", async () => {
    mockReadStudentAuthUser.mockResolvedValue(null);

    // Exact match (not a substring check) — this must be distinguishable
    // from the inactive/orphaned redirects below, which append ?error=...
    await expect(requireStudentPage()).rejects.toThrow(/^REDIRECT:\/student\/login$/);
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("signs out and redirects with error=account-inactive when the StudentProfile is INACTIVE", async () => {
    mockReadStudentAuthUser.mockResolvedValue({
      supabaseUserId: "sb-user-1",
      email: "alice@example.com",
    });
    mockFindUnique.mockResolvedValue({ ...activeProfile, status: "INACTIVE" });

    await expect(requireStudentPage()).rejects.toThrow(
      "REDIRECT:/student/login?error=account-inactive"
    );
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("signs out and redirects with error=account-not-found when orphaned (valid session, no StudentProfile)", async () => {
    mockReadStudentAuthUser.mockResolvedValue({
      supabaseUserId: "sb-user-1",
      email: "alice@example.com",
    });
    mockFindUnique.mockResolvedValue(null);

    await expect(requireStudentPage()).rejects.toThrow(
      "REDIRECT:/student/login?error=account-not-found"
    );
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("returns the session, with the correct studentId, when ACTIVE", async () => {
    mockReadStudentAuthUser.mockResolvedValue({
      supabaseUserId: "sb-user-1",
      email: "alice@example.com",
    });
    mockFindUnique.mockResolvedValue(activeProfile);

    const session = await requireStudentPage();

    expect(session.studentId).toBe("student-1");
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
