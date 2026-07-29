import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => mockCookieGet(name) }),
}));

const mockResolveStudentSession = vi.fn();
vi.mock("@/lib/student/dal", () => ({
  resolveStudentSession: () => mockResolveStudentSession(),
}));

const mockSetLocale = vi.fn();
vi.mock("@/app/actions/set-locale", () => ({
  setLocale: (...args: unknown[]) => mockSetLocale(...args),
}));

import { syncStudentLocaleOnFirstLogin } from "@/app/actions/sync-student-locale";

const activeSession = {
  kind: "active" as const,
  session: {
    studentId: "student-1",
    supabaseUserId: "sb-user-1",
    email: "amine@example.com",
    fullName: "amine",
    locale: "am",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("syncStudentLocaleOnFirstLogin", () => {
  it("sets NEXT_LOCALE from StudentProfile.locale when no cookie exists yet (first login)", async () => {
    mockCookieGet.mockReturnValue(undefined);
    mockResolveStudentSession.mockResolvedValue(activeSession);

    await syncStudentLocaleOnFirstLogin();

    expect(mockSetLocale).toHaveBeenCalledWith("am");
  });

  it("does not overwrite an existing NEXT_LOCALE cookie (returning student with a manual preference)", async () => {
    mockCookieGet.mockReturnValue({ value: "en" });
    mockResolveStudentSession.mockResolvedValue(activeSession);

    await syncStudentLocaleOnFirstLogin();

    expect(mockSetLocale).not.toHaveBeenCalled();
    // Confirms the check short-circuits before even resolving the session —
    // a returning student's cookie should be enough to skip this entirely.
    expect(mockResolveStudentSession).not.toHaveBeenCalled();
  });

  it("does nothing when the session isn't active (e.g. inactive/orphaned)", async () => {
    mockCookieGet.mockReturnValue(undefined);
    mockResolveStudentSession.mockResolvedValue({ kind: "inactive" });

    await syncStudentLocaleOnFirstLogin();

    expect(mockSetLocale).not.toHaveBeenCalled();
  });

  it("does nothing when there is no session at all", async () => {
    mockCookieGet.mockReturnValue(undefined);
    mockResolveStudentSession.mockResolvedValue({ kind: "unauthenticated" });

    await syncStudentLocaleOnFirstLogin();

    expect(mockSetLocale).not.toHaveBeenCalled();
  });
});
