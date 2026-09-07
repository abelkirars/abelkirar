import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSendEmail = vi.fn();
const mockAdminRecipients = vi.fn();
vi.mock("@/lib/notifications/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  adminEmailRecipients: () => mockAdminRecipients(),
}));

// Translations resolve to their own key, so assertions name the message key
// rather than wording Abel may still revise.
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));

import {
  notifyAdminOfApplication,
  notifyApplicantOfApplication,
  sendCourseApplicationNotifications,
  type CourseApplicationNotificationData,
} from "@/lib/notifications/course-application-notifications";

const adult: CourseApplicationNotificationData = {
  id: "app-1",
  fullName: "Jane Doe",
  email: "jane@example.com",
  country: "Ethiopia",
  phone: "+251900000000",
  lessonLanguage: "AM",
  requestedLevel: "BEGINNER",
  kirarModel: "FIVE_STRING",
  applicantMessage: "I have played for two years.",
  isUnder15: false,
  guardianName: null,
  guardianRelationship: null,
  guardianPhone: null,
  locale: "en",
};

const child: CourseApplicationNotificationData = {
  ...adult,
  fullName: "Young Student",
  phone: null,
  isUnder15: true,
  guardianName: "Parent Name",
  guardianRelationship: "Parent",
  guardianPhone: "+251911111111",
};

function lastEmail() {
  return mockSendEmail.mock.calls.at(-1)![0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminRecipients.mockReturnValue(["abel@example.com"]);
  mockSendEmail.mockResolvedValue({ sent: true });
});

describe("notifyAdminOfApplication", () => {
  it("sends to the configured admin recipients", async () => {
    await notifyAdminOfApplication(adult);
    expect(lastEmail().to).toEqual(["abel@example.com"]);
  });

  it("includes every field the teacher needs to place the student", async () => {
    await notifyAdminOfApplication(adult);
    const html = lastEmail().html;
    expect(html).toContain("Jane Doe");
    expect(html).toContain("jane@example.com");
    expect(html).toContain("Ethiopia");
    expect(html).toContain("+251900000000");
    expect(html).toContain("levelBeginner");
    expect(html).toContain("modelFiveString");
    expect(html).toContain("languageAmharic");
    expect(html).toContain("I have played for two years.");
  });

  it("shows the guardian's phone, name and relationship for an under-15 application", async () => {
    await notifyAdminOfApplication(child);
    const html = lastEmail().html;
    expect(html).toContain("+251911111111");
    expect(html).toContain("Parent Name");
    expect(html).toContain("guardianYes");
  });

  it("says a guardian did NOT complete it when the applicant is 15 or over", async () => {
    await notifyAdminOfApplication(adult);
    expect(lastEmail().html).toContain("guardianNo");
  });

  it("treats an unknown isUnder15 as 'not completed by a guardian', never as a child", async () => {
    // Legacy rows predate the question. Truthiness would silently read null as
    // false anyway; this asserts the explicit comparison stays explicit.
    await notifyAdminOfApplication({ ...adult, isUnder15: null });
    expect(lastEmail().html).toContain("guardianNo");
  });

  it("renders a null level as 'not sure yet', never as a guessed level", async () => {
    await notifyAdminOfApplication({ ...adult, requestedLevel: null });
    const html = lastEmail().html;
    expect(html).toContain("levelNotSure");
    expect(html).not.toContain("levelBeginner");
  });

  it("renders missing optional values as an explicit 'not provided'", async () => {
    await notifyAdminOfApplication({ ...adult, country: null, applicantMessage: null });
    expect(lastEmail().html).toContain("valueNotProvided");
  });

  it("escapes applicant-supplied HTML rather than rendering it", async () => {
    await notifyAdminOfApplication({ ...adult, fullName: "<script>alert(1)</script>" });
    const html = lastEmail().html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("does not send at all, and reports why, when no admin recipient is configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockAdminRecipients.mockReturnValue([]);

    const result = await notifyAdminOfApplication(adult);

    expect(result.sent).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("notifyApplicantOfApplication", () => {
  it("sends to the single collected address", async () => {
    await notifyApplicantOfApplication(adult);
    expect(lastEmail().to).toBe("jane@example.com");
  });

  it("addresses the guardian by name for an under-15 application", async () => {
    await notifyApplicantOfApplication(child);
    const html = lastEmail().html;
    expect(html).toContain("Parent Name");
    expect(html).not.toContain("Young Student");
  });

  it("addresses the applicant by name when they are 15 or over", async () => {
    await notifyApplicantOfApplication(adult);
    expect(lastEmail().html).toContain("Jane Doe");
  });

  it("confirms receipt, that applying is free, and when to expect a reply", async () => {
    await notifyApplicantOfApplication(adult);
    const html = lastEmail().html;
    expect(html).toContain("applicantReceived");
    expect(html).toContain("applicantNoPayment");
    expect(html).toContain("applicantWhenToExpect");
  });

  it("never quotes the applicant's own experience notes back to them", async () => {
    // schema.prisma states applicantMessage is admin-visible only.
    await notifyApplicantOfApplication(adult);
    expect(lastEmail().html).not.toContain("I have played for two years.");
  });

  it("escapes the addressee name", async () => {
    await notifyApplicantOfApplication({ ...adult, fullName: '"><b>x</b>' });
    expect(lastEmail().html).not.toContain("<b>x</b>");
  });
});

describe("sendCourseApplicationNotifications", () => {
  it("sends exactly two emails and reports both outcomes", async () => {
    const result = await sendCourseApplicationNotifications(adult);

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(result.admin.sent).toBe(true);
    expect(result.applicant.sent).toBe(true);
  });

  it("never rejects when a send fails — it reports the failure instead", async () => {
    mockSendEmail.mockResolvedValue({ sent: false, error: "Email is not configured" });

    const result = await sendCourseApplicationNotifications(adult);

    expect(result.admin.sent).toBe(false);
    expect(result.applicant.sent).toBe(false);
  });

  it("still reports the other channel when only one fails", async () => {
    // Keyed on the recipient, not on call order: both notifications run
    // concurrently under Promise.all and the admin one awaits an extra
    // getTranslations, so the applicant's send can reach the mock first.
    mockSendEmail.mockImplementation((args: { to: string | string[] }) =>
      Array.isArray(args.to) ? { sent: false, error: "admin failed" } : { sent: true }
    );

    const result = await sendCourseApplicationNotifications(adult);

    expect(result.admin.sent).toBe(false);
    expect(result.applicant.sent).toBe(true);
  });
});
