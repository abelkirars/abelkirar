import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/admin/dal", () => ({ requireAdminApi: mocks.auth }));
vi.mock("@/lib/courses/expiration-job", () => ({ runInitialPaymentExpirationJob: mocks.run }));
import { POST } from "./route";
const request = (body: unknown = { confirmation: true }, origin = "https://example.invalid") => new Request("https://example.invalid/api/admin/course-payments/expire-overdue", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
describe("manual admin expiration fallback", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ session: { adminId: "admin" } }); mocks.run.mockResolvedValue({ failed: 0 }); });
  it("requires admin auth before doing work", async () => {
    mocks.auth.mockResolvedValue({ response: new Response(null, { status: 401 }) });
    expect((await POST(request())).status).toBe(401); expect(mocks.run).not.toHaveBeenCalled();
  });
  it("requires same origin and explicit confirmation with no arbitrary inputs", async () => {
    expect((await POST(request({}, "https://attacker.invalid"))).status).toBe(403);
    expect((await POST(request({ confirmation: false }))).status).toBe(400);
    expect((await POST(request({ confirmation: true, paymentId: "another" }))).status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("runs the identical bounded domain job", async () => {
    expect((await POST(request())).status).toBe(200); expect(mocks.run).toHaveBeenCalledWith();
  });
});
