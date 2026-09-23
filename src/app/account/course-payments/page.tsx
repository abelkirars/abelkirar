import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Container } from "@/components/marketing/container";
import { CoursePaymentCustomerDeniedError, CustomerAuthenticationError, CustomerEmailNotVerifiedError, listCurrentCustomerCoursePayments } from "@/lib/courses/course-payment-access";
import { formatPaymentDeadline } from "@/lib/courses/payment-deadline";

export const dynamic = "force-dynamic";

export default async function CoursePaymentHistoryPage() {
  const [locale, t, paymentText] = await Promise.all([getLocale(), getTranslations("courseMonthlyPaymentEmails"), getTranslations("coursePayment")]);
  let payments;
  try { payments = await listCurrentCustomerCoursePayments(); }
  catch (error) {
    if (error instanceof CustomerAuthenticationError || error instanceof CustomerEmailNotVerifiedError) redirect("/account/login?next=/account/course-payments");
    if (error instanceof CoursePaymentCustomerDeniedError) notFound();
    throw error;
  }
  const now = new Date();
  const localDate = (value: Date, timeZone: string) => new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value);
  const state = (payment: typeof payments[number]) => {
    if (payment.status === "PROOF_SUBMITTED") return t("reviewState");
    if (["PENDING", "PAST_DUE"].includes(payment.status) && payment.submissions[0]?.status === "REJECTED") return t("rejectedState");
    if (payment.status === "VERIFIED") return paymentText("status.verified");
    if (payment.status === "CANCELLED") return paymentText("status.cancelled");
    if (payment.status === "EXPIRED") return paymentText("status.expired");
    if (payment.status === "PAST_DUE") return t("pastDueState");
    if (!payment.dueAt) return paymentText("status.pending");
    if (payment.enrollment.billingTimeZone
      && localDate(payment.dueAt, payment.enrollment.billingTimeZone) === localDate(now, payment.enrollment.billingTimeZone)) return t("dueToday");
    return payment.dueAt <= now ? t("pastDueState") : t("upcoming");
  };
  return <Container className="max-w-4xl space-y-6 py-12"><div><h1 className="font-heading text-3xl font-semibold">{t("historyTitle")}</h1><p className="mt-2 text-muted-foreground">{t("historyDescription")}</p></div>
    {!payments.length && <p>{t("empty")}</p>}
    <div className="space-y-3">{payments.map(payment => <Link key={payment.id} href={`/account/course-payments/${payment.id}`} className="block rounded-xl border border-border bg-card p-5 hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"><div className="flex flex-wrap justify-between gap-2"><strong>{payment.enrollment.student.fullName} · {payment.enrollment.planCodeSnapshot.replaceAll("_", " ")}</strong><span>{state(payment)}</span></div><p className="mt-2">{new Intl.NumberFormat(locale, { style: "currency", currency: payment.currency }).format(payment.finalAmountCents / 100)} · {payment.periodStart.toISOString().slice(0,10)} – {payment.periodEnd.toISOString().slice(0,10)}</p>{payment.dueAt && <p className="mt-1 text-sm text-muted-foreground">{t("dueLabel", { date: formatPaymentDeadline(locale, payment.dueAt) })}</p>}</Link>)}</div>
  </Container>;
}
