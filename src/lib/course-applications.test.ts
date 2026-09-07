import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreateCourseApplication = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    courseApplication: {
      create: (...args: unknown[]) => mockCreateCourseApplication(...args),
    },
  },
}));

import { Prisma } from "@prisma/client";
import { createCourseApplication } from "@/lib/course-applications";
import type { CreateCourseApplicationInput } from "@/lib/validations/course-application";

const adultInput: CreateCourseApplicationInput = {
  fullName: "Jane Doe",
  country: "Ethiopia",
  isUnder15: false,
  email: "Jane@Example.com",
  phone: "+251900000000",
  lessonLanguage: "AM",
  requestedLevel: "BEGINNER",
  kirarModel: "FIVE_STRING",
  applicantMessage: undefined,
  guardianName: undefined,
  guardianRelationship: undefined,
  guardianPhone: undefined,
  guardianConsent: undefined,
};

const childInput: CreateCourseApplicationInput = {
  ...adultInput,
  fullName: "Young Student",
  isUnder15: true,
  phone: undefined,
  guardianName: "Parent Name",
  guardianRelationship: "Parent",
  guardianPhone: "+251911111111",
  guardianConsent: true,
};

function p2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

function dataOf() {
  return mockCreateCourseApplication.mock.calls[0]![0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateCourseApplication.mockResolvedValue({ id: "app-1" });
});

describe("createCourseApplication", () => {
  it("lower-cases the email before the Prisma create call", async () => {
    await createCourseApplication(adultInput, "en");
    expect(dataOf().email).toBe("jane@example.com");
  });

  it("creates exactly one nested event with toStatus PENDING, fromStatus and actorAdminId omitted", async () => {
    await createCourseApplication(adultInput, "en");
    expect(dataOf().events).toEqual({ create: { toStatus: "PENDING" } });
    expect(dataOf().status).toBe("PENDING");
    expect(dataOf().locale).toBe("en");
  });

  it("maps every field explicitly — no unrelated key reaches the create call", async () => {
    await createCourseApplication(adultInput, "en");
    expect(Object.keys(dataOf()).sort()).toEqual(
      [
        "applicantMessage",
        "country",
        "email",
        "events",
        "fullName",
        "guardianConsentAt",
        "guardianName",
        "guardianPhone",
        "guardianRelationship",
        "isUnder15",
        "kirarModel",
        "lessonLanguage",
        "locale",
        "phone",
        "requestedLevel",
        "status",
      ].sort()
    );
  });

  describe("requestedLevel mapping", () => {
    it("stores null when the applicant chose UNSURE — never BEGINNER", async () => {
      await createCourseApplication({ ...adultInput, requestedLevel: "UNSURE" }, "en");
      expect(dataOf().requestedLevel).toBeNull();
    });

    it.each(["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const)(
      "passes %s through unchanged",
      async (level) => {
        await createCourseApplication({ ...adultInput, requestedLevel: level }, "en");
        expect(dataOf().requestedLevel).toBe(level);
      }
    );
  });

  describe("guardian fields", () => {
    it("writes all four guardian columns for an under-15 applicant", async () => {
      await createCourseApplication(childInput, "en");
      expect(dataOf().isUnder15).toBe(true);
      expect(dataOf().guardianName).toBe("Parent Name");
      expect(dataOf().guardianRelationship).toBe("Parent");
      expect(dataOf().guardianPhone).toBe("+251911111111");
      expect(dataOf().guardianConsentAt).toBeInstanceOf(Date);
    });

    it("generates guardianConsentAt on the server and never reads it from input", async () => {
      const before = Date.now();
      await createCourseApplication(childInput, "en");
      const consentAt = dataOf().guardianConsentAt as Date;
      expect(consentAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(consentAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("forces every guardian column to null for an applicant 15 or over, even if guardian keys were sent", async () => {
      await createCourseApplication(
        {
          ...adultInput,
          guardianName: "Stale Name",
          guardianRelationship: "Parent",
          guardianPhone: "+251999999999",
          guardianConsent: true,
        },
        "en"
      );
      expect(dataOf().guardianName).toBeNull();
      expect(dataOf().guardianRelationship).toBeNull();
      expect(dataOf().guardianPhone).toBeNull();
      expect(dataOf().guardianConsentAt).toBeNull();
    });

    it("does not store an applicant phone for an under-15 applicant — guardianPhone is the number of record", async () => {
      await createCourseApplication({ ...childInput, phone: "+251900000000" }, "en");
      expect(dataOf().phone).toBeNull();
    });
  });

  it("returns null on a genuine Prisma P2002, and does not retry", async () => {
    mockCreateCourseApplication.mockRejectedValue(p2002Error());

    const result = await createCourseApplication(adultInput, "en");

    expect(result).toBeNull();
    expect(mockCreateCourseApplication).toHaveBeenCalledTimes(1);
  });

  it("rethrows any error that is not a P2002 PrismaClientKnownRequestError", async () => {
    mockCreateCourseApplication.mockRejectedValue(new Error("connection reset"));

    await expect(createCourseApplication(adultInput, "en")).rejects.toThrow("connection reset");
  });

  it("rethrows a PrismaClientKnownRequestError with a different code", async () => {
    const otherError = new Prisma.PrismaClientKnownRequestError("Not found", {
      code: "P2025",
      clientVersion: "test",
    });
    mockCreateCourseApplication.mockRejectedValue(otherError);

    await expect(createCourseApplication(adultInput, "en")).rejects.toBe(otherError);
  });
});
