import "server-only";
import { getTranslations } from "next-intl/server";
import { defaultLocale, isLocale } from "@/i18n/locale";
import type { CoursePaymentReviewResult } from "@/lib/courses/review-course-payment";
import { formatPaymentDeadline } from "@/lib/courses/payment-deadline";
import { sendEmail } from "./email";

function escape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Called only after the review transaction has committed. No proof paths in email. */
export async function notifyCoursePaymentReviewed(result: CoursePaymentReviewResult) {
  const locale = isLocale(result.locale) ? result.locale : defaultLocale;
  const t = await getTranslations({ locale, namespace: "coursePaymentReviewEmails" });
  const verified = result.status === "VERIFIED";
  const paragraphs = [t("summary", {
    learner: result.learnerName, course: result.courseCode.replaceAll("_", " "),
    amount: new Intl.NumberFormat(locale, { style: "currency", currency: result.currency }).format(result.amountCents / 100),
  })];
  if (verified) paragraphs.push(t(result.selfPayer && result.hasLearnerLogin ? "verifiedLogin" : "verifiedLoginless"));
  else {
    paragraphs.push(t("reason", { reason: result.reason || "" }));
    paragraphs.push(result.status === "EXPIRED" ? t("expired") : t("resubmit", { deadline: formatPaymentDeadline(locale, result.deadline) }));
  }
  let link = "";
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) {
    try {
      const base = new URL(site);
      if (!base.username && !base.password && (base.protocol === "https:" || (base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname)))) {
        const path = verified && result.selfPayer && result.hasLearnerLogin ? "/student/dashboard" : `/account/course-payments/${encodeURIComponent(result.paymentId)}`;
        link = `<p><a href="${escape(new URL(path, base).toString())}">${escape(t("openAccount"))}</a></p>`;
      }
    } catch { /* A misconfigured link must not block the result notification. */ }
  }
  return sendEmail({ to: result.customerEmail, subject: t(verified ? "verifiedSubject" : "rejectedSubject"), html: paragraphs.map(p => `<p>${escape(p)}</p>`).join("\n") + link, redactErrors: true });
}
