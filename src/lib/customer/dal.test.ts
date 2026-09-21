import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

const mockCustomerFindUnique = vi.fn();
const mockCustomerUpsert = vi.fn();
const mockRelationFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    customer: {
      findUnique: (...args: unknown[]) => mockCustomerFindUnique(...args),
      upsert: (...args: unknown[]) => mockCustomerUpsert(...args),
    },
    customerStudentRelation: {
      findUnique: (...args: unknown[]) => mockRelationFindUnique(...args),
    },
  },
}));

import {
  CustomerEmailNotVerifiedError,
  getCurrentAuthenticatedCustomer,
  getCurrentCustomerStudentRelation,
  getOrCreateCurrentCustomer,
  normalizeCustomerEmail,
} from "@/lib/customer/dal";

function verifiedUser(id = "11111111-1111-1111-1111-111111111111") {
  return {
    data: {
      user: {
        id,
        email: "  Alice@Example.COM ",
        email_confirmed_at: "2026-09-20T10:00:00.000Z",
      },
    },
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue(verifiedUser());
});

describe("customer identity DAL", () => {
  it("normalizes email for lookup/display without making it identity", () => {
    expect(normalizeCustomerEmail("  UsEr@Example.COM ")).toBe("user@example.com");
  });

  it("resolves a Customer only by authoritative supabaseUserId", async () => {
    mockCustomerFindUnique.mockResolvedValue(null);

    await getCurrentAuthenticatedCustomer();

    expect(mockCustomerFindUnique).toHaveBeenCalledWith({
      where: { supabaseUserId: "11111111-1111-1111-1111-111111111111" },
    });
  });

  it("does not link an account merely because its email matches", async () => {
    mockCustomerFindUnique.mockResolvedValue(null);

    await getCurrentAuthenticatedCustomer();

    const lookup = mockCustomerFindUnique.mock.calls[0][0];
    expect(lookup.where).not.toHaveProperty("email");
    expect(lookup.where).not.toHaveProperty("emailNormalized");
  });

  it("requires Supabase to report the email as verified", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "alice@example.com" } },
      error: null,
    });

    await expect(getOrCreateCurrentCustomer()).rejects.toBeInstanceOf(
      CustomerEmailNotVerifiedError
    );
    expect(mockCustomerUpsert).not.toHaveBeenCalled();
  });

  it("uses one supabaseUserId upsert for race-safe, idempotent creation", async () => {
    mockCustomerUpsert.mockResolvedValue({ id: "customer-1" });

    await getOrCreateCurrentCustomer();

    expect(mockCustomerUpsert).toHaveBeenCalledTimes(1);
    const operation = mockCustomerUpsert.mock.calls[0][0];
    expect(operation.where).toEqual({
      supabaseUserId: "11111111-1111-1111-1111-111111111111",
    });
    expect(operation.create.emailNormalized).toBe("alice@example.com");
    expect(operation.update.emailNormalized).toBe("alice@example.com");
  });

  it("scopes a student relationship lookup through the current Customer", async () => {
    mockCustomerFindUnique.mockResolvedValue({
      id: "customer-1",
      status: "ACTIVE",
      archivedAt: null,
    });
    mockRelationFindUnique.mockResolvedValue({ id: "relation-1" });

    await getCurrentCustomerStudentRelation("student-1");

    expect(mockRelationFindUnique).toHaveBeenCalledWith({
      where: {
        customerId_studentId: {
          customerId: "customer-1",
          studentId: "student-1",
        },
      },
    });
  });
});
