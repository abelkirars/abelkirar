import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), create: vi.fn(), notify: vi.fn() }));
vi.mock("@/lib/admin/dal", () => ({ requireAdminApi: mocks.auth }));
vi.mock("@/lib/courses/create-enrollment", () => ({ createEnrollmentAndInitialPayment: mocks.create }));
vi.mock("@/lib/courses/admin-response", () => ({ preparationErrorResponse: () => Response.json({ error: "Failed" }, { status: 409 }) }));
vi.mock("@/lib/notifications/course-payment-notifications", () => ({ notifyCoursePaymentRequired: mocks.notify }));
import { POST } from "./route";
const result = { idempotent: false, customer: { email: "payer@example.invalid", locale: "en" }, learner: { fullName: "Learner" }, course: { code: "BEGINNER_GROUP" }, payment: { id: "payment", finalAmountCents: 4500, currency: "USD", expiresAt: "2026-10-08T10:00:00Z" } };
const context = { params: Promise.resolve({ id: "application" }) };
const request = () => new Request("https://example.invalid/api/admin/course-applications/application/enroll", { method: "POST", body: "{}" });
describe("payment-required post-commit notification", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.invalid"); mocks.auth.mockResolvedValue({ session: { adminId: "admin" } }); mocks.create.mockResolvedValue(result); mocks.notify.mockResolvedValue({ sent: true }); vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  it("sends only after commit using returned values, never request-supplied financial fields", async () => {
    const order: string[] = [];
    mocks.create.mockImplementation(async () => { order.push("committed"); return result; });
    mocks.notify.mockImplementation(async () => { order.push("email"); return { sent: true }; });
    expect((await POST(request(), context)).status).toBe(200);
    expect(order).toEqual(["committed", "email"]);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ customerEmail: result.customer.email, amountCents: 4500, deadline: new Date(result.payment.expiresAt), securePaymentUrl: "https://example.invalid/account/course-payments/payment" }));
  });
  it("failed creation and idempotent replay send no email", async () => {
    mocks.create.mockRejectedValueOnce(new Error("No commit"));
    expect((await POST(request(), context)).status).toBe(409);
    mocks.create.mockResolvedValue({ ...result, idempotent: true });
    expect((await POST(request(), context)).status).toBe(200); expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("email failure preserves creation and logs no raw provider error", async () => {
    mocks.notify.mockRejectedValue(new Error("private provider payload"));
    expect((await POST(request(), context)).status).toBe(200);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private provider payload");
  });
});
