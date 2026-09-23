import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), cancel: vi.fn() }));
vi.mock("@/lib/admin/dal", () => ({ requireAdminApi: mocks.auth }));
vi.mock("@/lib/courses/promotions", () => ({ createPromotion: mocks.create, cancelPromotion: mocks.cancel, PromotionConflictError: class extends Error {} }));
import { POST } from "./route";
import { PromotionConflictError } from "@/lib/courses/promotions";
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ session: { adminId: "a" } }); mocks.create.mockResolvedValue({ id: "promotion" }); });
const request = (origin = "https://academy.invalid") => new Request("https://academy.invalid/api/admin/course-promotions", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", promotion: { name: "offer" } }) });
it("denies absent admin and foreign origin before writes", async () => {
  mocks.auth.mockResolvedValue({ response: new Response(null, { status: 401 }) });
  expect((await POST(request())).status).toBe(401);
  mocks.auth.mockResolvedValue({ session: {} });
  expect((await POST(request("https://attacker.invalid"))).status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("reports overlap without exposing database details", async () => {
  mocks.create.mockRejectedValue(new PromotionConflictError("private database details"));
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "overlap" });
});
