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

const mockFindUniqueAdmin = vi.fn();
const mockUpdateAdmin = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    admin: {
      findUnique: (...args: unknown[]) => mockFindUniqueAdmin(...args),
      update: (...args: unknown[]) => mockUpdateAdmin(...args),
    },
  },
}));

const mockVerifyPassword = vi.fn();
const mockHashPassword = vi.fn();
vi.mock("@/lib/admin/password", () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
  hashPassword: (...args: unknown[]) => mockHashPassword(...args),
}));

const mockCreateAdminSession = vi.fn();
vi.mock("@/lib/admin/session", () => ({
  createAdminSession: (...args: unknown[]) => mockCreateAdminSession(...args),
}));

import { POST } from "@/app/api/admin/settings/password/route";

function buildRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/admin/settings/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  currentPassword: "current-password-123",
  newPassword: "brand-new-password-456",
  confirmPassword: "brand-new-password-456",
};

const sessionAdmin = {
  adminId: "admin-1",
  username: "abel",
  displayName: "Abel",
};

const dbAdmin = {
  id: "admin-1",
  username: "abel",
  displayName: "Abel",
  passwordHash: "$2b$12$existinghash",
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdminApi.mockResolvedValue({ session: sessionAdmin });
  mockCheckRateLimit.mockResolvedValue(true);
  mockFindUniqueAdmin.mockResolvedValue(dbAdmin);
  mockHashPassword.mockResolvedValue("$2b$12$newhash");
});

describe("POST /api/admin/settings/password", () => {
  it("rejects a non-admin caller before any password comparison happens", async () => {
    mockRequireAdminApi.mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(401);
    expect(mockVerifyPassword).not.toHaveBeenCalled();
    expect(mockUpdateAdmin).not.toHaveBeenCalled();
  });

  it("updates the hash and reissues the session when the current password is correct", async () => {
    mockVerifyPassword.mockResolvedValue(true);

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.otherSessionsInvalidated).toBe(true);
    expect(mockVerifyPassword).toHaveBeenCalledWith("current-password-123", dbAdmin.passwordHash);
    expect(mockUpdateAdmin).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      data: {
        passwordHash: "$2b$12$newhash",
        passwordChangedAt: expect.any(Date),
      },
    });
    expect(mockCreateAdminSession).toHaveBeenCalledWith({
      adminId: "admin-1",
      username: "abel",
      displayName: "Abel",
    });
  });

  it("only ever touches passwordHash and passwordChangedAt — never username, displayName, isActive, or lastLoginAt", async () => {
    mockVerifyPassword.mockResolvedValue(true);

    await POST(buildRequest(validBody));

    const updateCall = mockUpdateAdmin.mock.calls[0][0];
    expect(Object.keys(updateCall.data).sort()).toEqual(["passwordChangedAt", "passwordHash"]);
  });

  it("rejects with 401 and writes nothing when the current password is wrong", async () => {
    mockVerifyPassword.mockResolvedValue(false);

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(401);
    expect(mockUpdateAdmin).not.toHaveBeenCalled();
    expect(mockCreateAdminSession).not.toHaveBeenCalled();
  });

  it("rejects a new password shorter than 12 characters, before touching the database", async () => {
    const res = await POST(
      buildRequest({ ...validBody, newPassword: "short1", confirmPassword: "short1" })
    );

    expect(res.status).toBe(400);
    expect(mockFindUniqueAdmin).not.toHaveBeenCalled();
    expect(mockVerifyPassword).not.toHaveBeenCalled();
  });

  it("rejects a new password identical to the current password", async () => {
    const res = await POST(
      buildRequest({
        ...validBody,
        newPassword: "current-password-123",
        confirmPassword: "current-password-123",
      })
    );

    expect(res.status).toBe(400);
    expect(mockUpdateAdmin).not.toHaveBeenCalled();
  });

  it("rejects when the confirm field does not match the new password", async () => {
    const res = await POST(
      buildRequest({ ...validBody, confirmPassword: "something-else-entirely" })
    );

    expect(res.status).toBe(400);
    expect(mockFindUniqueAdmin).not.toHaveBeenCalled();
    expect(mockUpdateAdmin).not.toHaveBeenCalled();
  });

  it("derives identity from the session only — an admin id or username in the body cannot redirect the update to another row", async () => {
    mockVerifyPassword.mockResolvedValue(true);

    const res = await POST(
      buildRequest({
        ...validBody,
        adminId: "someone-elses-id",
        username: "someone-else",
      })
    );

    expect(res.status).toBe(200);
    expect(mockFindUniqueAdmin).toHaveBeenCalledWith({ where: { id: "admin-1" } });
    expect(mockUpdateAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "admin-1" } })
    );
  });

  it("returns 429 without touching the database when the rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue(false);

    const res = await POST(buildRequest(validBody));

    expect(res.status).toBe(429);
    expect(mockFindUniqueAdmin).not.toHaveBeenCalled();
  });
});
