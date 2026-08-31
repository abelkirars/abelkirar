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

const validInput: CreateCourseApplicationInput = {
  fullName: "Jane Doe",
  email: "Jane@Example.com",
  phone: undefined,
  requestedLevel: undefined,
  applicantMessage: undefined,
};

function p2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createCourseApplication", () => {
  it("lower-cases the email before the Prisma create call", async () => {
    mockCreateCourseApplication.mockResolvedValue({ id: "app-1" });

    await createCourseApplication(validInput, "en");

    expect(mockCreateCourseApplication).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: "jane@example.com" }),
    });
  });

  it("creates exactly one nested event with toStatus PENDING, fromStatus and actorAdminId omitted", async () => {
    mockCreateCourseApplication.mockResolvedValue({ id: "app-1" });

    await createCourseApplication(validInput, "en");

    const callArg = mockCreateCourseApplication.mock.calls[0]![0];
    expect(callArg.data.events).toEqual({ create: { toStatus: "PENDING" } });
    expect(callArg.data.status).toBe("PENDING");
    expect(callArg.data.locale).toBe("en");
  });

  it("maps every field explicitly — no unrelated key reaches the create call", async () => {
    mockCreateCourseApplication.mockResolvedValue({ id: "app-1" });

    await createCourseApplication(validInput, "en");

    const callArg = mockCreateCourseApplication.mock.calls[0]![0];
    expect(Object.keys(callArg.data).sort()).toEqual(
      ["applicantMessage", "email", "events", "fullName", "locale", "phone", "requestedLevel", "status"].sort()
    );
  });

  it("returns null on a genuine Prisma P2002, and does not retry", async () => {
    mockCreateCourseApplication.mockRejectedValue(p2002Error());

    const result = await createCourseApplication(validInput, "en");

    expect(result).toBeNull();
    expect(mockCreateCourseApplication).toHaveBeenCalledTimes(1);
  });

  it("rethrows any error that is not a P2002 PrismaClientKnownRequestError", async () => {
    mockCreateCourseApplication.mockRejectedValue(new Error("connection reset"));

    await expect(createCourseApplication(validInput, "en")).rejects.toThrow("connection reset");
  });

  it("rethrows a PrismaClientKnownRequestError with a different code", async () => {
    const otherError = new Prisma.PrismaClientKnownRequestError("Not found", {
      code: "P2025",
      clientVersion: "test",
    });
    mockCreateCourseApplication.mockRejectedValue(otherError);

    await expect(createCourseApplication(validInput, "en")).rejects.toBe(otherError);
  });
});
