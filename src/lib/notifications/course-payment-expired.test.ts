import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import am from "../../../messages/am.json";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ find: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { coursePayment: { findUnique: mocks.find } } }));
vi.mock("./email", () => ({ sendEmail: mocks.send }));
vi.mock("next-intl/server", () => ({ getTranslations: async ({ locale }: { locale: string }) => createTranslator({ locale, messages: locale === "am" ? am : en, namespace: "courseExpirationEmail" }) }));
import { notifyCoursePaymentExpired } from "./course-payment-expired";
const payment = { kind: "INITIAL_ENROLLMENT", status: "EXPIRED", enrollment: {
  status: "CANCELLED", cancellationReason: "INITIAL_PAYMENT_EXPIRED", portalAccess: null,
  customer: { email: "payer@example.invalid", locale: "en" }, student: { fullName: "<Learner>" }, planCodeSnapshot: "BEGINNER_GROUP",
} };
describe("expiration email", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.find.mockResolvedValue(payment); mocks.send.mockResolvedValue({ sent: true }); });
  it.each(["en", "am"])("renders %s with the real authoritative state, correct payer and no seat details", async locale => {
    mocks.find.mockResolvedValue({ ...payment, enrollment: { ...payment.enrollment, application: { locale } } });
    await notifyCoursePaymentExpired("payment");
    expect(mocks.send.mock.calls[0][0]).toMatchObject({ to: "payer@example.invalid", redactErrors: true, subject: (locale === "am" ? am : en).courseExpirationEmail.subject });
    const html = mocks.send.mock.calls[0][0].html;
    expect(html).toContain("&lt;Learner&gt;"); expect(html).not.toContain("<Learner>"); expect(html).not.toContain("seat");
  });
  it.each(["VERIFIED", "PENDING", "PROOF_SUBMITTED"])("does not email for %s", async status => {
    mocks.find.mockResolvedValue({ ...payment, status });
    expect(await notifyCoursePaymentExpired("payment")).toEqual({ sent: false }); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not claim cancellation when enrollment/access is active", async () => {
    mocks.find.mockResolvedValue({ ...payment, enrollment: { ...payment.enrollment, status: "ACTIVE" } });
    await notifyCoursePaymentExpired("payment"); expect(mocks.send).not.toHaveBeenCalled();
  });
});
