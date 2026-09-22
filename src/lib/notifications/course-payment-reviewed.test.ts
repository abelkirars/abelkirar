import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import am from "../../../messages/am.json";
import type { CoursePaymentReviewResult } from "@/lib/courses/review-course-payment";
vi.mock("server-only", () => ({}));
const send = vi.hoisted(() => vi.fn());
vi.mock("./email", () => ({ sendEmail: send }));
vi.mock("next-intl/server", () => ({ getTranslations: async ({ locale }: { locale: string }) => createTranslator({ locale, messages: locale === "am" ? am : en, namespace: "coursePaymentReviewEmails" }) }));
import { notifyCoursePaymentReviewed } from "./course-payment-reviewed";
const base: CoursePaymentReviewResult = {
  idempotent: false, paymentId: "payment", submissionId: "proof", status: "VERIFIED",
  customerEmail: "payer@example.invalid", locale: "en", learnerName: "Learner", hasLearnerLogin: true, selfPayer: true,
  courseCode: "BEGINNER_GROUP", amountCents: 5000, currency: "USD", deadline: new Date("2026-09-08T10:00:00Z"), reason: null,
};
describe("payment review notification", () => {
  beforeEach(() => { vi.clearAllMocks(); send.mockResolvedValue({ sent: true }); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.invalid"); });
  afterEach(() => vi.unstubAllEnvs());
  it.each(["en", "am"])("renders actual %s messages, not translation keys", async locale => {
    await notifyCoursePaymentReviewed({ ...base, locale });
    const message = send.mock.calls[0][0];
    expect(message.subject).toBe((locale === "am" ? am : en).coursePaymentReviewEmails.verifiedSubject);
    expect(message.html).toContain("Learner"); expect(message.html).toContain("/student/dashboard");
    expect(message.html).not.toContain("proof/");
  });
  it("guardian loginless activation never promises a child login", async () => {
    await notifyCoursePaymentReviewed({ ...base, selfPayer: false, hasLearnerLogin: false });
    expect(send.mock.calls[0][0].html).toContain(en.coursePaymentReviewEmails.verifiedLoginless.replaceAll("'", "&#39;"));
    expect(send.mock.calls[0][0].html).toContain("/account/course-payments/payment");
    expect(send.mock.calls[0][0].html).not.toContain("/student/dashboard");
  });
  it("rejection uses the original deadline and escapes the public reason", async () => {
    await notifyCoursePaymentReviewed({ ...base, status: "PENDING", reason: "<script>not found</script>" });
    const html = send.mock.calls[0][0].html;
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
    expect(html).toContain("2026"); expect(html).toContain("UTC"); expect(html).toContain("10:00");
    expect(send.mock.calls[0][0].subject).toBe(en.coursePaymentReviewEmails.rejectedSubject);
  });
  it("expired rejection gives no new window or resubmission invitation", async () => {
    await notifyCoursePaymentReviewed({ ...base, status: "EXPIRED", reason: "Not found" });
    expect(send.mock.calls[0][0].html).toContain(en.coursePaymentReviewEmails.expired);
    expect(send.mock.calls[0][0].html).not.toContain("10:00");
  });
  it("unsafe destination is omitted", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "javascript:alert(1)");
    await notifyCoursePaymentReviewed(base); expect(send.mock.calls[0][0].html).not.toContain("href=");
  });
});
