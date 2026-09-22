import "server-only";

import { getTranslations } from "next-intl/server";
import { isLocale, defaultLocale } from "@/i18n/locale";
import { sendEmail, type SendEmailResult } from "@/lib/notifications/email";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function localeOf(value: string) {
  return isLocale(value) ? value : defaultLocale;
}

export async function notifyCoursePaymentRequired(data: {
  customerEmail: string;
  locale: string;
  learnerName: string;
  courseCode: string;
  amountCents: number;
  currency: string;
  deadline: Date;
  securePaymentUrl: string;
}): Promise<SendEmailResult> {
  const locale = localeOf(data.locale);
  const t = await getTranslations({ locale, namespace: "coursePaymentEmails" });
  const amount = new Intl.NumberFormat(locale, { style: "currency", currency: data.currency }).format(data.amountCents / 100);
  const deadline = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(data.deadline);
  const html = [
    `<p>${escapeHtml(t("requiredGreeting"))}</p>`,
    `<p>${escapeHtml(t("requiredBody", { learner: data.learnerName, course: data.courseCode.replaceAll("_", " "), amount, deadline }))}</p>`,
    `<p><a href="${escapeHtml(data.securePaymentUrl)}">${escapeHtml(t("requiredAction"))}</a></p>`,
    `<p>${escapeHtml(t("requiredSecurity"))}</p>`,
  ].join("\n");
  return sendEmail({ to: data.customerEmail, subject: t("requiredSubject"), html });
}

export async function notifyCoursePaymentProofReceived(data: {
  customerEmail: string;
  locale: string;
  learnerName: string;
  courseCode: string;
  amountCents: number;
  currency: string;
}): Promise<SendEmailResult> {
  const locale = localeOf(data.locale);
  const t = await getTranslations({ locale, namespace: "coursePaymentEmails" });
  const amount = new Intl.NumberFormat(locale, { style: "currency", currency: data.currency }).format(data.amountCents / 100);
  const html = [
    `<p>${escapeHtml(t("receivedGreeting"))}</p>`,
    `<p>${escapeHtml(t("receivedBody", { learner: data.learnerName, course: data.courseCode.replaceAll("_", " "), amount }))}</p>`,
    `<p><strong>${escapeHtml(t("receivedNotice"))}</strong></p>`,
  ].join("\n");
  return sendEmail({ to: data.customerEmail, subject: t("receivedSubject"), html });
}
