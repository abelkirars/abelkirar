import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    coursePlan: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

import {
  COURSE_PLAN_CODES,
  getActiveCoursePlanByCode,
  listActiveCoursePlans,
} from "@/lib/courses/plans";

beforeEach(() => vi.clearAllMocks());

describe("CoursePlan read service", () => {
  it("returns only active, unarchived canonical plans", async () => {
    mockFindMany.mockResolvedValue([]);

    await listActiveCoursePlans();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          code: { in: [...COURSE_PLAN_CODES] },
          active: true,
          archivedAt: null,
        },
      })
    );
  });

  it("returns authoritative price fields selected from the database", async () => {
    mockFindMany.mockResolvedValue([
      {
        code: "BEGINNER_GROUP",
        monthlyPriceCents: 5000,
        currency: "USD",
      },
    ]);

    const plans = await listActiveCoursePlans();

    expect(plans[0]).toMatchObject({ monthlyPriceCents: 5000, currency: "USD" });
    const operation = mockFindMany.mock.calls[0][0];
    expect(operation.select.monthlyPriceCents).toBe(true);
    expect(operation.select.currency).toBe(true);
  });

  it("excludes inactive or archived rows from a code lookup", async () => {
    mockFindFirst.mockResolvedValue(null);

    await getActiveCoursePlanByCode("ADVANCED_ONE_TO_ONE");

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          code: "ADVANCED_ONE_TO_ONE",
          active: true,
          archivedAt: null,
        },
      })
    );
  });
});
