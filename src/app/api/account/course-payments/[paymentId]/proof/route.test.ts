import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  activeCustomer: vi.fn(),
  rateLimit: vi.fn(),
  configured: vi.fn(),
  parse: vi.fn(),
  validate: vi.fn(),
  submit: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock("@/lib/customer/dal", () => ({
  CustomerAuthenticationError: class CustomerAuthenticationError extends Error {},
  CustomerEmailNotVerifiedError: class CustomerEmailNotVerifiedError extends Error {},
}));
vi.mock("@/lib/courses/course-payment-access", () => ({
  CoursePaymentCustomerDeniedError: class CoursePaymentCustomerDeniedError extends Error {},
  requireActiveCourseCustomer: mocks.activeCustomer,
}));
vi.mock("@/lib/courses/course-payment-instructions", () => ({ isConfiguredCoursePaymentMethod: mocks.configured }));
vi.mock("@/lib/courses/course-payment-proof-input", () => ({
  InvalidCoursePaymentProofFieldsError: class InvalidCoursePaymentProofFieldsError extends Error {},
  parseCoursePaymentProofFields: mocks.parse,
}));
vi.mock("@/lib/courses/course-payment-proofs", () => ({
  InvalidCoursePaymentProofError: class InvalidCoursePaymentProofError extends Error {},
  validateCoursePaymentProof: mocks.validate,
}));
vi.mock("@/lib/courses/submit-course-payment-proof", () => ({
  CoursePaymentSubmissionError: class CoursePaymentSubmissionError extends Error {
    constructor(public problem: string, message: string) { super(message); }
  },
  submitCoursePaymentProofForCustomer: mocks.submit,
}));
vi.mock("@/lib/notifications/course-payment-notifications", () => ({ notifyCoursePaymentProofReceived: mocks.notify }));

import { CustomerAuthenticationError } from "@/lib/customer/dal";
import { CoursePaymentSubmissionError } from "@/lib/courses/submit-course-payment-proof";
import { POST } from "./route";

function request(origin = "https://abelkirar.example") {
  const form = new FormData();
  form.set("proof", new File([new Uint8Array([1])], "proof.png", { type: "image/png" }));
  return new Request("https://abelkirar.example/api/account/course-payments/payment-1/proof", {
    method: "POST",
    headers: { origin },
    body: form,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.activeCustomer.mockResolvedValue({ id: "customer-1" });
  mocks.rateLimit.mockResolvedValue(true);
  mocks.configured.mockReturnValue(true);
  mocks.parse.mockReturnValue({ method: "ZELLE" });
  mocks.validate.mockResolvedValue({ mimeType: "image/png" });
  mocks.submit.mockResolvedValue({
    idempotent: false,
    submission: { id: "submission-1", status: "SUBMITTED", submittedAt: new Date() },
    notification: {},
  });
  mocks.notify.mockResolvedValue({ sent: true });
});

describe("course payment proof route authorization", () => {
  it("rejects cross-site requests before authentication or parsing", async () => {
    const response = await POST(request("https://attacker.invalid"), { params: Promise.resolve({ paymentId: "payment-1" }) });
    expect(response.status).toBe(403);
    expect(mocks.activeCustomer).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("denies an unauthenticated Supabase user", async () => {
    mocks.activeCustomer.mockRejectedValue(new CustomerAuthenticationError("Authentication required"));
    const response = await POST(request(), { params: Promise.resolve({ paymentId: "payment-1" }) });
    expect(response.status).toBe(401);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("returns not found when the authenticated customer does not own the payment", async () => {
    mocks.submit.mockRejectedValue(new CoursePaymentSubmissionError("NOT_FOUND", "Course payment not found"));
    const response = await POST(request(), { params: Promise.resolve({ paymentId: "enumerated-payment" }) });
    expect(response.status).toBe(404);
    expect(mocks.submit).toHaveBeenCalledWith(
      "customer-1",
      "enumerated-payment",
      expect.anything(),
      expect.anything(),
    );
  });
});
