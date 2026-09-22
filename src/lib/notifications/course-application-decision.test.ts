import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mockSendEmail = vi.fn();
vi.mock("@/lib/notifications/email", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: { name?: string }) =>
    values?.name ? `${key}:${values.name}` : key,
}));

import { notifyApplicantOfCourseApplicationDecision } from "@/lib/notifications/course-application-decision";

const base = {
  applicationId: "application-1",
  fullName: "Applicant",
  email: "applicant@example.com",
  locale: "en" as const,
  isUnder15: false,
  guardianName: null,
  status: "APPROVED" as const,
  decisionReason: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmail.mockResolvedValue({ sent: true });
});

describe("course application decision email", () => {
  it.each([
    ["APPROVED", "approvedSubject", "approvedBody"],
    ["WAITLISTED", "waitlistedSubject", "waitlistedBody"],
    ["DECLINED", "declinedSubject", "declinedBody"],
  ] as const)("sends the %s wording", async (status, subject, body) => {
    await notifyApplicantOfCourseApplicationDecision({ ...base, status });
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject, html: expect.stringContaining(body) })
    );
  });

  it("approval says only that enrollment and payment guidance comes next", async () => {
    await notifyApplicantOfCourseApplicationDecision(base);
    const html = mockSendEmail.mock.calls[0][0].html;
    expect(html).toContain("approvedBody");
    expect(html).not.toContain("enrolled");
    expect(html).not.toContain("payment verified");
    expect(html).not.toContain("portal access");
  });

  it("escapes applicant-visible decision reasons", async () => {
    await notifyApplicantOfCourseApplicationDecision({
      ...base,
      status: "DECLINED",
      decisionReason: "<script>unsafe</script>",
    });
    const html = mockSendEmail.mock.calls[0][0].html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("reports delivery failure without throwing", async () => {
    mockSendEmail.mockResolvedValue({ sent: false, error: "Email unavailable" });
    await expect(notifyApplicantOfCourseApplicationDecision(base)).resolves.toEqual({
      sent: false,
      error: "Email unavailable",
    });
  });
});
