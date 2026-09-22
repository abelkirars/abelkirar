import "server-only";

import { getTranslations } from "next-intl/server";
import { sendEmail, type SendEmailResult } from "@/lib/notifications/email";
import type { Locale } from "@/i18n/locale";

export interface CourseApplicationDecisionNotification {
  applicationId: string;
  fullName: string;
  email: string;
  locale: Locale;
  isUnder15: boolean | null;
  guardianName: string | null;
  status: "APPROVED" | "WAITLISTED" | "DECLINED";
  decisionReason: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const statusKeys = {
  APPROVED: { subject: "approvedSubject", body: "approvedBody" },
  WAITLISTED: { subject: "waitlistedSubject", body: "waitlistedBody" },
  DECLINED: { subject: "declinedSubject", body: "declinedBody" },
} as const;

export async function notifyApplicantOfCourseApplicationDecision(
  data: CourseApplicationDecisionNotification
): Promise<SendEmailResult> {
  const t = await getTranslations({
    locale: data.locale,
    namespace: "courseApplicationDecisionEmails",
  });
  const keys = statusKeys[data.status];
  const addressee =
    data.isUnder15 === true && data.guardianName ? data.guardianName : data.fullName;

  const html = [
    `<p>${escapeHtml(t("greeting", { name: addressee }))}</p>`,
    `<p>${escapeHtml(t(keys.body))}</p>`,
    data.decisionReason
      ? `<p><strong>${escapeHtml(t("reasonLabel"))}:</strong> ${escapeHtml(data.decisionReason)}</p>`
      : "",
    `<p>${escapeHtml(t("signoff"))}</p>`,
  ]
    .filter(Boolean)
    .join("\n");

  return sendEmail({
    to: data.email,
    subject: t(keys.subject),
    html,
  });
}
