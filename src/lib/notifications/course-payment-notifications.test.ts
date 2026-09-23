import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import am from "../../../messages/am.json";
vi.mock("server-only", () => ({}));
const send = vi.hoisted(() => vi.fn());
vi.mock("./email", () => ({ sendEmail: send }));
vi.mock("next-intl/server", () => ({ getTranslations: async ({ locale }: { locale: string }) => createTranslator({ locale, messages: locale === "am" ? am : en, namespace: "coursePaymentEmails" }) }));
import { notifyCoursePaymentRequired, notifyCoursePaymentProofReceived } from "./course-payment-notifications";
const base = { customerEmail: "payer@example.invalid", locale: "en", learnerName: "Learner", courseCode: "BEGINNER_GROUP", amountCents: 4500, currency: "USD", deadline: new Date("2026-10-08T10:00:00Z"), securePaymentUrl: "https://example.invalid/account/course-payments/payment" };
describe("course lifecycle email semantics", () => {
  beforeEach(() => { vi.clearAllMocks(); send.mockResolvedValue({ sent: true }); });
  it.each(["en", "am"])("required mail uses original deadline, authoritative amount and payer in %s", async locale => {
    await notifyCoursePaymentRequired({ ...base, locale });
    expect(send.mock.calls[0][0]).toMatchObject({ to: base.customerEmail, redactErrors: true });
    const html = send.mock.calls[0][0].html;
    expect(html).toContain("45.00"); expect(html).toContain("2026"); expect(html).toContain("UTC");
    expect(html).toContain(base.securePaymentUrl); expect(html).not.toContain("supabase");
  });
  it("proof receipt expressly does not confirm payment/access", async () => {
    await notifyCoursePaymentProofReceived(base);
    expect(send.mock.calls[0][0].html).toContain(en.coursePaymentEmails.receivedNotice);
    expect(send.mock.calls[0][0].subject).toBe(en.coursePaymentEmails.receivedSubject);
  });
  it.each(["javascript:alert(1)", "http://example.invalid/account/course-payments/payment", "https://example.invalid/account/course-payments/payment?token=fixture", "https://example.invalid/public"]) ("refuses unsafe payment destination %s", async securePaymentUrl => {
    expect((await notifyCoursePaymentRequired({ ...base, securePaymentUrl })).sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
