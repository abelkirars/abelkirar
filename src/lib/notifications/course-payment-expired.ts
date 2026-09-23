import "server-only";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { defaultLocale, isLocale } from "@/i18n/locale";
import { sendEmail } from "./email";

/** Invoked only by the process that committed EXPIRED, never by scanning
 * historical expired rows. Database recheck keeps messages tied to real state. */
export async function notifyCoursePaymentExpired(paymentId: string) {
  const payment = await prisma.coursePayment.findUnique({ where: { id: paymentId }, include: {
    enrollment: { include: { customer: true, student: true, application: true, portalAccess: true } },
  } });
  if (!payment || payment.kind !== "INITIAL_ENROLLMENT" || payment.status !== "EXPIRED"
    || payment.enrollment.status !== "CANCELLED" || payment.enrollment.cancellationReason !== "INITIAL_PAYMENT_EXPIRED"
    || payment.enrollment.portalAccess) return { sent: false };
  const e = payment.enrollment;
  const candidateLocale = e.application?.locale || e.customer.locale || defaultLocale;
  const locale = isLocale(candidateLocale) ? candidateLocale : defaultLocale;
  const t = await getTranslations({ locale, namespace: "courseExpirationEmail" });
  const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  return sendEmail({
    to: e.customer.email, subject: t("subject"), redactErrors: true,
    html: `<p>${escape(t("body", { learner: e.student.fullName, course: e.planCodeSnapshot.replaceAll("_", " ") }))}</p><p>${escape(t("next"))}</p>`,
  });
}
