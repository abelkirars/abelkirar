import { describe, it, expect, vi, beforeEach } from "vitest";

const mockReadAdminSessionFromCookies = vi.fn();
vi.mock("@/lib/admin/session", () => ({
  readAdminSessionFromCookies: () => mockReadAdminSessionFromCookies(),
}));

const mockFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    admin: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

import { verifyAdminSession } from "@/lib/admin/dal";

const baseSession = {
  adminId: "admin-1",
  username: "abel",
  displayName: "Abel",
};

const baseAdmin = {
  id: "admin-1",
  username: "abel",
  displayName: "Abel",
  isActive: true,
  passwordChangedAt: null as Date | null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("verifyAdminSession", () => {
  it("returns null and never queries the database when there is no session cookie", async () => {
    mockReadAdminSessionFromCookies.mockResolvedValue(null);

    const result = await verifyAdminSession();

    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when the admin no longer exists", async () => {
    mockReadAdminSessionFromCookies.mockResolvedValue({ ...baseSession, issuedAt: 1000 });
    mockFindUnique.mockResolvedValue(null);

    expect(await verifyAdminSession()).toBeNull();
  });

  it("returns null when the admin has been deactivated", async () => {
    mockReadAdminSessionFromCookies.mockResolvedValue({ ...baseSession, issuedAt: 1000 });
    mockFindUnique.mockResolvedValue({ ...baseAdmin, isActive: false });

    expect(await verifyAdminSession()).toBeNull();
  });

  it("returns the session when passwordChangedAt has never been set", async () => {
    mockReadAdminSessionFromCookies.mockResolvedValue({ ...baseSession, issuedAt: 1000 });
    mockFindUnique.mockResolvedValue({ ...baseAdmin, passwordChangedAt: null });

    const result = await verifyAdminSession();

    expect(result).toEqual({ ...baseSession, issuedAt: 1000 });
  });

  it("rejects a token issued before the last password change (a stolen/other-device session)", async () => {
    const passwordChangedAt = new Date("2026-01-01T00:00:10.000Z");
    const issuedAt = Math.floor(new Date("2026-01-01T00:00:05.000Z").getTime() / 1000); // 5s earlier
    mockReadAdminSessionFromCookies.mockResolvedValue({ ...baseSession, issuedAt });
    mockFindUnique.mockResolvedValue({ ...baseAdmin, passwordChangedAt });

    expect(await verifyAdminSession()).toBeNull();
  });

  it("accepts a token issued in the exact same second as the password change (the just-reissued current session)", async () => {
    const secondBoundary = Math.floor(new Date("2026-01-01T00:00:10.000Z").getTime() / 1000);
    const passwordChangedAt = new Date(secondBoundary * 1000);
    mockReadAdminSessionFromCookies.mockResolvedValue({ ...baseSession, issuedAt: secondBoundary });
    mockFindUnique.mockResolvedValue({ ...baseAdmin, passwordChangedAt });

    const result = await verifyAdminSession();

    expect(result).not.toBeNull();
  });

  it("accepts a token issued after the password change", async () => {
    const passwordChangedAt = new Date("2026-01-01T00:00:10.000Z");
    const issuedAt = Math.floor(new Date("2026-01-01T00:05:00.000Z").getTime() / 1000);
    mockReadAdminSessionFromCookies.mockResolvedValue({ ...baseSession, issuedAt });
    mockFindUnique.mockResolvedValue({ ...baseAdmin, passwordChangedAt });

    const result = await verifyAdminSession();

    expect(result).not.toBeNull();
  });
});
