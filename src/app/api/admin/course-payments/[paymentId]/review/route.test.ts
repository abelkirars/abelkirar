import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), review: vi.fn(), notify: vi.fn() }));
vi.mock("@/lib/admin/dal", () => ({ requireAdminApi: mocks.auth }));
vi.mock("@/lib/courses/review-course-payment", () => ({ reviewCoursePayment: mocks.review, CoursePaymentReviewError: class extends Error {} }));
vi.mock("@/lib/courses/admin-service", () => ({ CoursePreparationError: class extends Error {} }));
vi.mock("@/lib/notifications/course-payment-reviewed", () => ({ notifyCoursePaymentReviewed: mocks.notify }));
import { POST } from "./route";
import { CoursePaymentReviewError } from "@/lib/courses/review-course-payment";
const context = { params: Promise.resolve({ paymentId: "payment" }) };
const request = (origin = "https://example.invalid", body = JSON.stringify({ action: "VERIFY", submissionId: "proof", confirmation: true })) => new Request("https://example.invalid/api/admin/course-payments/payment/review", { method: "POST", headers: { origin, "content-type": "application/json" }, body });
describe("admin payment review route", () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.auth.mockResolvedValue({ adminId: "admin" });
    mocks.review.mockResolvedValue({ paymentId: "payment", status: "VERIFIED", idempotent: false });
    mocks.notify.mockResolvedValue({ sent: true });
  });
  it.each([401, 403])("rejects unauthorized/non-admin with %s before review", async status => {
    mocks.auth.mockResolvedValue({ response: new Response(null, { status }) });
    expect((await POST(request(), context)).status).toBe(status);
    expect(mocks.review).not.toHaveBeenCalled(); expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("requires same origin and valid JSON", async () => {
    expect((await POST(request("https://attacker.invalid"), context)).status).toBe(403);
    expect((await POST(request("https://example.invalid", "{"), context)).status).toBe(400);
    expect(mocks.review).not.toHaveBeenCalled();
  });
  it("only notifies after the committed review result resolves", async () => {
    const order: string[] = [];
    mocks.review.mockImplementation(async () => { order.push("committed"); return { status: "PENDING", paymentId: "payment", idempotent: false }; });
    mocks.notify.mockImplementation(async () => { order.push("email"); return { sent: true }; });
    const response = await POST(request(), context);
    expect(await response.json()).toMatchObject({ ok: true, status: "PENDING", emailSent: true });
    expect(order).toEqual(["committed", "email"]);
  });
  it("does not notify on failed/conflicting review", async () => {
    mocks.review.mockRejectedValue(new CoursePaymentReviewError("Reload before reviewing"));
    expect((await POST(request(), context)).status).toBe(409);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("email failure does not undo the successful result or retry the transaction", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.notify.mockRejectedValue(new Error("email unavailable"));
    expect(await (await POST(request(), context)).json()).toMatchObject({ ok: true, status: "VERIFIED", emailSent: false });
    expect(mocks.review).toHaveBeenCalledTimes(1); warning.mockRestore();
  });
  it("idempotent replay neither emails nor exposes private result fields", async () => {
    mocks.review.mockResolvedValue({ status: "VERIFIED", idempotent: true, customerEmail: "private@example.invalid", paymentId: "payment" });
    expect(await (await POST(request(), context)).json()).toEqual({ ok: true, status: "VERIFIED", idempotent: true, emailSent: null });
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
