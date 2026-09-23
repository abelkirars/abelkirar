import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  monthlyPastDueEmail,
  monthlyProofReceivedEmail,
  monthlyPaymentRequiredEmail,
  monthlyPaymentReviewedEmail,
  monthlyReminderEmail,
  paymentExpiredEmail,
  paymentReminderEmail,
  paymentRequiredEmail,
  paymentReviewedEmail,
  proofReceivedEmail,
} from "./course-payment-content";

const common = {
  customerEmail: "payer@example.invalid",
  learnerName: "Learner <Name>",
  courseCode: "BEGINNER_GROUP",
  amountCents: 5000,
  currency: "USD",
};

afterEach(() => vi.unstubAllEnvs());

describe("course notification snapshot content", () => {
  it.each(["en", "am"])("renders complete safe payment-required content in %s", locale => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://abelkirar.example");
    const result = paymentRequiredEmail({ ...common, locale, paymentId: "pay/1", deadline: new Date("2026-10-08T12:00:00Z") });
    expect(result.recipientEmailSnapshot).toBe(common.customerEmail);
    expect(result.subjectSnapshot).not.toBe("");
    expect(result.htmlSnapshot).toContain("https://abelkirar.example/account/course-payments/pay%2F1");
    expect(result.htmlSnapshot).toContain("Learner &lt;Name&gt;");
    expect(result.htmlSnapshot).not.toContain("Learner <Name>");
  });

  it("renders monthly events without activation, cancellation, or suspension claims", () => {
    const dueAt = new Date("2026-10-15T04:00:00Z");
    const snapshots = [
      monthlyPaymentRequiredEmail({ ...common, locale: "en", paymentId: "monthly", dueAt }),
      monthlyProofReceivedEmail({ ...common, locale: "am" }),
      monthlyPaymentReviewedEmail({ ...common, locale: "en", paymentId: "monthly", result: "VERIFIED", reason: null }),
      monthlyPaymentReviewedEmail({ ...common, locale: "am", paymentId: "monthly", result: "PAST_DUE", reason: "Try again" }),
      monthlyReminderEmail({ ...common, locale: "en", paymentId: "monthly", dueAt, hours: 72 }),
      monthlyReminderEmail({ ...common, locale: "am", paymentId: "monthly", dueAt, hours: 24 }),
      monthlyPastDueEmail({ ...common, locale: "en", paymentId: "monthly", expiresAt: new Date("2026-10-22T04:00:00Z") }),
    ];
    for (const snapshot of snapshots) {
      expect(snapshot.subjectSnapshot.length).toBeGreaterThan(3);
      expect(snapshot.htmlSnapshot).not.toMatch(/activate your enrollment|cancel(?:led)? your enrollment|course access (?:is|will be) suspended/i);
      expect(snapshot.htmlSnapshot).not.toMatch(/proofStoragePath|transactionReference|RESEND_API_KEY/i);
    }
  });

  it("renders every initial event from bounded authoritative fields", () => {
    const deadline = new Date("2026-10-08T12:00:00Z");
    const snapshots = [
      proofReceivedEmail({ ...common, locale: "en" }),
      paymentReviewedEmail({ ...common, locale: "en", paymentId: "payment", deadline, result: "VERIFIED", reason: null, selfPayer: true, hasLearnerLogin: true }),
      paymentReviewedEmail({ ...common, locale: "am", paymentId: "payment", deadline, result: "PENDING", reason: "Try again", selfPayer: false, hasLearnerLogin: false }),
      paymentExpiredEmail({ ...common, locale: "en" }),
      paymentReminderEmail({ ...common, locale: "am", paymentId: "payment", deadline, hours: 48 }),
      paymentReminderEmail({ ...common, locale: "en", paymentId: "payment", deadline, hours: 24 }),
    ];
    for (const snapshot of snapshots) {
      expect(snapshot.recipientEmailSnapshot).toBe(common.customerEmail);
      expect(snapshot.subjectSnapshot.length).toBeGreaterThan(3);
      expect(snapshot.htmlSnapshot).not.toMatch(/proofStoragePath|transactionReference|RESEND_API_KEY/i);
    }
  });

  it("omits an unsafe configured link without blocking durable content", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://user:password@example.invalid/path?token=secret");
    const result = paymentReminderEmail({ ...common, locale: "en", paymentId: "payment", deadline: new Date(), hours: 24 });
    expect(result.htmlSnapshot).not.toContain("password");
    expect(result.htmlSnapshot).not.toContain("token=");
  });
});
