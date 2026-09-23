import "server-only";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import am from "../../../messages/am.json";
import { defaultLocale, isLocale } from "@/i18n/locale";
import { formatPaymentDeadline } from "@/lib/courses/payment-deadline";

export type CourseEmailSnapshot = {
  recipientEmailSnapshot: string;
  subjectSnapshot: string;
  htmlSnapshot: string;
};

type Common = {
  customerEmail: string;
  locale: string | null | undefined;
  learnerName: string;
  courseCode: string;
};

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

type CourseEmailNamespace = "coursePaymentEmails" | "coursePaymentReviewEmails" | "courseExpirationEmail" | "coursePaymentReminderEmails" | "courseMonthlyPaymentEmails";

function translator<N extends CourseEmailNamespace>(localeValue: string | null | undefined, namespace: N) {
  const locale = isLocale(localeValue || "") ? localeValue! : defaultLocale;
  return { locale, t: createTranslator({ locale, messages: locale === "am" ? am : en, namespace }) };
}

function safeSiteBase() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return url;
  } catch { /* Missing links never prevent durable enqueue. */ }
  return null;
}

function paymentLink(paymentId: string) {
  const base = safeSiteBase();
  return base ? new URL(`/account/course-payments/${encodeURIComponent(paymentId)}`, base).toString() : null;
}

function paragraphs(values: string[]) {
  return values.map(value => `<p>${escapeHtml(value)}</p>`).join("\n");
}

export function paymentRequiredEmail(data: Common & { paymentId: string; amountCents: number; currency: string; deadline: Date }): CourseEmailSnapshot {
  const { locale, t } = translator(data.locale, "coursePaymentEmails");
  const amount = new Intl.NumberFormat(locale, { style: "currency", currency: data.currency }).format(data.amountCents / 100);
  const deadline = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(data.deadline);
  const link = paymentLink(data.paymentId);
  return {
    recipientEmailSnapshot: data.customerEmail,
    subjectSnapshot: t("requiredSubject"),
    htmlSnapshot: paragraphs([
      t("requiredGreeting"),
      t("requiredBody", { learner: data.learnerName, course: data.courseCode.replaceAll("_", " "), amount, deadline }),
    ]) + (link ? `<p><a href="${escapeHtml(link)}">${escapeHtml(t("requiredAction"))}</a></p>` : "")
      + paragraphs([t("requiredSecurity")]),
  };
}

export function proofReceivedEmail(data: Common & { amountCents: number; currency: string }): CourseEmailSnapshot {
  const { locale, t } = translator(data.locale, "coursePaymentEmails");
  const amount = new Intl.NumberFormat(locale, { style: "currency", currency: data.currency }).format(data.amountCents / 100);
  return {
    recipientEmailSnapshot: data.customerEmail,
    subjectSnapshot: t("receivedSubject"),
    htmlSnapshot: paragraphs([
      t("receivedGreeting"),
      t("receivedBody", { learner: data.learnerName, course: data.courseCode.replaceAll("_", " "), amount }),
    ]) + `<p><strong>${escapeHtml(t("receivedNotice"))}</strong></p>`,
  };
}

export function paymentReviewedEmail(data: Common & {
  paymentId: string; amountCents: number; currency: string; deadline: Date;
  result: "VERIFIED" | "PENDING" | "EXPIRED"; reason: string | null;
  selfPayer: boolean; hasLearnerLogin: boolean;
}): CourseEmailSnapshot {
  const { locale, t } = translator(data.locale, "coursePaymentReviewEmails");
  const verified = data.result === "VERIFIED";
  const values = [t("summary", {
    learner: data.learnerName,
    course: data.courseCode.replaceAll("_", " "),
    amount: new Intl.NumberFormat(locale, { style: "currency", currency: data.currency }).format(data.amountCents / 100),
  })];
  if (verified) values.push(t(data.selfPayer && data.hasLearnerLogin ? "verifiedLogin" : "verifiedLoginless"));
  else {
    values.push(t("reason", { reason: data.reason || "" }));
    values.push(data.result === "EXPIRED" ? t("expired") : t("resubmit", { deadline: formatPaymentDeadline(locale, data.deadline) }));
  }
  const base = safeSiteBase();
  const path = verified && data.selfPayer && data.hasLearnerLogin
    ? "/student/dashboard" : `/account/course-payments/${encodeURIComponent(data.paymentId)}`;
  const link = base ? `<p><a href="${escapeHtml(new URL(path, base).toString())}">${escapeHtml(t("openAccount"))}</a></p>` : "";
  return {
    recipientEmailSnapshot: data.customerEmail,
    subjectSnapshot: t(verified ? "verifiedSubject" : "rejectedSubject"),
    htmlSnapshot: paragraphs(values) + link,
  };
}

export function paymentExpiredEmail(data: Common): CourseEmailSnapshot {
  const { t } = translator(data.locale, "courseExpirationEmail");
  return {
    recipientEmailSnapshot: data.customerEmail,
    subjectSnapshot: t("subject"),
    htmlSnapshot: paragraphs([
      t("body", { learner: data.learnerName, course: data.courseCode.replaceAll("_", " ") }),
      t("next"),
    ]),
  };
}

export function paymentReminderEmail(data: Common & {
  paymentId: string; amountCents: number; currency: string; deadline: Date; hours: 48 | 24;
}): CourseEmailSnapshot {
  const { locale, t } = translator(data.locale, "coursePaymentReminderEmails");
  const link = paymentLink(data.paymentId);
  return {
    recipientEmailSnapshot: data.customerEmail,
    subjectSnapshot: t(data.hours === 48 ? "subject48" : "subject24"),
    htmlSnapshot: paragraphs([
      t("body", {
        learner: data.learnerName,
        course: data.courseCode.replaceAll("_", " "),
        amount: new Intl.NumberFormat(locale, { style: "currency", currency: data.currency }).format(data.amountCents / 100),
        deadline: formatPaymentDeadline(locale, data.deadline),
      }),
      t("notice"),
    ]) + (link ? `<p><a href="${escapeHtml(link)}">${escapeHtml(t("action"))}</a></p>` : ""),
  };
}

function monthlyCommon(data: Common & { amountCents: number; currency: string }) {
  const { locale, t } = translator(data.locale, "courseMonthlyPaymentEmails");
  return { locale, t, amount: new Intl.NumberFormat(locale, { style: "currency", currency: data.currency }).format(data.amountCents / 100) };
}

export function monthlyPaymentRequiredEmail(data: Common & { paymentId: string; amountCents: number; currency: string; dueAt: Date }): CourseEmailSnapshot {
  const { locale, t, amount } = monthlyCommon(data);
  const link = paymentLink(data.paymentId);
  return { recipientEmailSnapshot: data.customerEmail, subjectSnapshot: t("requiredSubject"), htmlSnapshot: paragraphs([
    t("summary", { learner: data.learnerName, course: data.courseCode.replaceAll("_", " "), amount }),
    t("required", { due: formatPaymentDeadline(locale, data.dueAt) }),
  ]) + (link ? `<p><a href="${escapeHtml(link)}">${escapeHtml(t("action"))}</a></p>` : "") };
}

export function monthlyProofReceivedEmail(data: Common & { amountCents: number; currency: string }): CourseEmailSnapshot {
  const { t, amount } = monthlyCommon(data);
  return { recipientEmailSnapshot: data.customerEmail, subjectSnapshot: t("receivedSubject"), htmlSnapshot: paragraphs([
    t("summary", { learner: data.learnerName, course: data.courseCode.replaceAll("_", " "), amount }), t("received"),
  ]) };
}

export function monthlyPaymentReviewedEmail(data: Common & { paymentId: string; amountCents: number; currency: string; result: "VERIFIED" | "PENDING" | "PAST_DUE"; reason: string | null }): CourseEmailSnapshot {
  const { t, amount } = monthlyCommon(data);
  const link = paymentLink(data.paymentId);
  return { recipientEmailSnapshot: data.customerEmail, subjectSnapshot: t(data.result === "VERIFIED" ? "verifiedSubject" : "rejectedSubject"), htmlSnapshot: paragraphs([
    t("summary", { learner: data.learnerName, course: data.courseCode.replaceAll("_", " "), amount }),
    data.result === "VERIFIED" ? t("verified") : t("rejected", { reason: data.reason || "" }),
  ]) + (link ? `<p><a href="${escapeHtml(link)}">${escapeHtml(t("action"))}</a></p>` : "") };
}

export function monthlyReminderEmail(data: Common & { paymentId: string; amountCents: number; currency: string; dueAt: Date; hours: 72 | 24 }): CourseEmailSnapshot {
  const { locale, t, amount } = monthlyCommon(data);
  const link = paymentLink(data.paymentId);
  return { recipientEmailSnapshot: data.customerEmail, subjectSnapshot: t(data.hours === 72 ? "reminder72Subject" : "reminder24Subject"), htmlSnapshot: paragraphs([
    t("summary", { learner: data.learnerName, course: data.courseCode.replaceAll("_", " "), amount }),
    t("reminder", { due: formatPaymentDeadline(locale, data.dueAt) }),
  ]) + (link ? `<p><a href="${escapeHtml(link)}">${escapeHtml(t("action"))}</a></p>` : "") };
}

export function monthlyPastDueEmail(data: Common & { paymentId: string; amountCents: number; currency: string; expiresAt: Date }): CourseEmailSnapshot {
  const { locale, t, amount } = monthlyCommon(data);
  const link = paymentLink(data.paymentId);
  return { recipientEmailSnapshot: data.customerEmail, subjectSnapshot: t("pastDueSubject"), htmlSnapshot: paragraphs([
    t("summary", { learner: data.learnerName, course: data.courseCode.replaceAll("_", " "), amount }),
    t("pastDue", { expires: formatPaymentDeadline(locale, data.expiresAt) }), t("accessUnaffected"),
  ]) + (link ? `<p><a href="${escapeHtml(link)}">${escapeHtml(t("action"))}</a></p>` : "") };
}
