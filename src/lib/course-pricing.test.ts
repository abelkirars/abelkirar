import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the external storage and request-cookie boundaries are substituted.
// The actual page, route, JWT/session guard, validation and pricing execute.
const boundary = vi.hoisted(() => ({
  read: vi.fn(), write: vi.fn(), admin: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/db", () => ({ prisma: {
  coursePrice: { findUnique: boundary.read, upsert: boundary.write },
  admin: { findUnique: boundary.admin },
} }));

beforeEach(() => {
  vi.clearAllMocks();
  boundary.read.mockResolvedValue(null);
});

describe("course pricing acceptance", () => {
  it("non-admin cannot load the admin course pricing page", async () => {
    const { default: Page } = await import("@/app/admin/(authenticated)/courses/page");
    await expect(Page()).rejects.toThrow("NEXT_REDIRECT");
    expect(boundary.read).not.toHaveBeenCalled();
  }, 20000);

  it("non-admin cannot call the pricing mutation directly", async () => {
    const { PUT } = await import("@/app/api/admin/courses/[slug]/route");
    const response = await PUT(new Request("http://localhost/api/admin/courses/beginner", {
      method: "PUT", body: JSON.stringify({ priceCents: 1 }),
    }), { params: Promise.resolve({ slug: "beginner" }) });
    expect(response.status).toBe(401);
    expect(boundary.write).not.toHaveBeenCalled();
    expect(boundary.read).not.toHaveBeenCalled();
  });

  it("PERCENT 101 is rejected", async () => {
    const { coursePriceSchema } = await import("@/lib/validations/course-price");
    expect(coursePriceSchema.safeParse({ priceCents: 7000, discountType: "PERCENT", discountValue: 101, discountActive: true }).success).toBe(false);
  });

  it("FIXED equal to or above the base price is rejected", async () => {
    const { coursePriceSchema } = await import("@/lib/validations/course-price");
    for (const discountValue of [7000, 7001]) {
      expect(coursePriceSchema.safeParse({ priceCents: 7000, discountType: "FIXED", discountValue, discountActive: true }).success).toBe(false);
    }
  });

  it("inactive discount leaves the base price unchanged", async () => {
    boundary.read.mockResolvedValue({ priceCents: 8500, discountType: "PERCENT", discountValue: 50, discountActive: false });
    const { getCoursePricing } = await import("@/lib/course-pricing");
    expect(await getCoursePricing("intermediate")).toEqual({ basePriceCents: 8500, finalPriceCents: 8500, discountAmountCents: 0, percentOff: 0, isDiscounted: false });
  });

  it("missing CoursePrice row falls back to the hardcoded course price", async () => {
    const { getCoursePricing } = await import("@/lib/course-pricing");
    expect((await getCoursePricing("beginner")).finalPriceCents).toBe(7000);
    expect(boundary.read).toHaveBeenCalledWith({ where: { slug: "beginner" } });
  });
});

describe("course pricing edge cases", () => {
  it.each([
    [7000, "PERCENT", 30, 4900, 2100, 30],
    [8500, "PERCENT", 50, 4250, 4250, 50],
    [101, "PERCENT", 50, 50, 51, 50],
    [10000, "PERCENT", 100, 0, 10000, 100],
    [7000, "FIXED", 1234, 5766, 1234, 17],
    [7000, "FIXED", 6999, 1, 6999, 99],
    [7000, "FIXED", 1, 6999, 1, 0],
    [2147483647, "PERCENT", 99, 21474836, 2126008811, 99],
  ])("calculates %i cents with %s %i", async (priceCents, discountType, discountValue, finalPriceCents, discountAmountCents, percentOff) => {
    boundary.read.mockResolvedValue({ priceCents, discountType, discountValue, discountActive: true });
    const { getCoursePricing } = await import("@/lib/course-pricing");
    expect(await getCoursePricing("beginner")).toEqual({ basePriceCents: priceCents, finalPriceCents, discountAmountCents, percentOff, isDiscounted: true });
  });

  it("null discount type never applies a discount", async () => {
    boundary.read.mockResolvedValue({ priceCents: 7000, discountType: null, discountValue: null, discountActive: true });
    const { getCoursePricing } = await import("@/lib/course-pricing");
    expect((await getCoursePricing("beginner")).isDiscounted).toBe(false);
  });

  it("does not cache a previously read price", async () => {
    const { getCoursePricing } = await import("@/lib/course-pricing");
    expect((await getCoursePricing("beginner")).basePriceCents).toBe(7000);
    boundary.read.mockResolvedValue({ priceCents: 9000, discountType: null, discountValue: null, discountActive: false });
    expect((await getCoursePricing("beginner")).basePriceCents).toBe(9000);
  });

  it("does not substitute a fallback price for a database outage", async () => {
    boundary.read.mockRejectedValueOnce(new Error("Database unavailable"));
    const { getCoursePricing } = await import("@/lib/course-pricing");
    await expect(getCoursePricing("beginner")).rejects.toThrow("Database unavailable");
  });

  it("rejects unknown slugs before a database read", async () => {
    const { getCoursePricing } = await import("@/lib/course-pricing");
    await expect(getCoursePricing("other")).rejects.toThrow("Unknown course slug");
    expect(boundary.read).not.toHaveBeenCalled();
  });

  it.each(["", " ", "abc", -1, 0, 1.5, "1.5", "1e2", true, null, 2147483648])("rejects invalid cents %s", async (priceCents) => {
    const { coursePriceSchema } = await import("@/lib/validations/course-price");
    expect(coursePriceSchema.safeParse({ priceCents, discountType: null, discountValue: null, discountActive: false }).success).toBe(false);
  });

  it.each(["", "abc", -1, 0, 1.5, true, null])("rejects invalid discount %s even when inactive", async (discountValue) => {
    const { coursePriceSchema } = await import("@/lib/validations/course-price");
    for (const discountType of ["PERCENT", "FIXED"]) {
      expect(coursePriceSchema.safeParse({ priceCents: 7000, discountType, discountValue, discountActive: false }).success).toBe(false);
    }
  });
});
