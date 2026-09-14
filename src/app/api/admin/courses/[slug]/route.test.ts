import { beforeEach, expect, it, vi } from "vitest";

// Authentication is covered with the real guard in course-pricing.test.ts
// and by local HTTP checks. Here an authenticated boundary lets us exercise
// the real route's validation, preview, persistence payload and invalidation.
const boundary = vi.hoisted(() => ({ write: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/dal", () => ({ requireAdminApi: async () => ({ session: { adminId: "test-admin" } }) }));
vi.mock("@/lib/db", () => ({ prisma: { coursePrice: { upsert: boundary.write } } }));
vi.mock("next/cache", () => ({ revalidatePath: boundary.revalidate }));

import { POST, PUT } from "./route";

const context = { params: Promise.resolve({ slug: "beginner" }) };
const input = { priceCents: "7000", discountType: "PERCENT", discountValue: "30", discountActive: true };
function request(body: unknown) {
  return new Request("http://localhost/api/admin/courses/beginner", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.clearAllMocks(); boundary.write.mockResolvedValue(undefined); });

it.each([
  { ...input, discountValue: 101 },
  { ...input, discountType: "FIXED", discountValue: 7000 },
  { ...input, discountType: "FIXED", discountValue: 7001 },
  { ...input, priceCents: "" },
  { ...input, discountValue: "" },
  { ...input, priceCents: -10 },
])("rejects invalid input without writing %j", async (body) => {
  const response = await PUT(request(body), context);
  expect(response.status).toBe(400);
  expect((await response.json()).error).toMatch(/^invalid(Price|Discount)$/);
  expect(boundary.write).not.toHaveBeenCalled();
});

it("preview and save use identical server pricing; only save writes and revalidates", async () => {
  const preview = await POST(request(input), context);
  expect(preview.status).toBe(200);
  expect(boundary.write).not.toHaveBeenCalled();
  expect(boundary.revalidate).not.toHaveBeenCalled();
  const saved = await PUT(request({ ...input, finalPriceCents: 1 }), context);
  const result = await saved.json();
  expect(result).toEqual(await preview.json());
  expect(result.pricing.finalPriceCents).toBe(4900);
  expect(boundary.write).toHaveBeenCalledWith({
    where: { slug: "beginner" },
    create: { slug: "beginner", priceCents: 7000, discountType: "PERCENT", discountValue: 30, discountActive: true },
    update: { priceCents: 7000, discountType: "PERCENT", discountValue: 30, discountActive: true },
  });
  expect(boundary.revalidate.mock.calls).toEqual([["/courses"], ["/courses/beginner"], ["/admin/courses"]]);
});

it("reports a failed write without revalidating", async () => {
  boundary.write.mockRejectedValueOnce(new Error("Unavailable"));
  const response = await PUT(request(input), context);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "saveFailed" });
  expect(boundary.revalidate).not.toHaveBeenCalled();
});

it("refuses slugs outside courses-data.ts", async () => {
  const response = await PUT(request(input), { params: Promise.resolve({ slug: "other" }) });
  expect(response.status).toBe(404);
  expect(boundary.write).not.toHaveBeenCalled();
});
