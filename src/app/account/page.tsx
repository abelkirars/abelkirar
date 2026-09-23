import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Container } from "@/components/marketing/container";
import { AccountNavigation } from "@/components/account/account-navigation";
import { getCurrentAccountOverview } from "@/lib/customer/account";
import { CustomerAuthenticationError, CustomerEmailNotVerifiedError } from "@/lib/customer/dal";
import { CoursePaymentCustomerDeniedError } from "@/lib/courses/course-payment-access";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  let account;
  try { account = await getCurrentAccountOverview(); }
  catch (error) {
    if (error instanceof CustomerAuthenticationError || error instanceof CustomerEmailNotVerifiedError) redirect("/account/login");
    if (error instanceof CoursePaymentCustomerDeniedError) notFound();
    throw error;
  }
  const [t, locale] = await Promise.all([getTranslations("accountArea"), getLocale()]);
  return <Container className="max-w-5xl py-12">
    <h1 className="mb-6 font-heading text-3xl font-semibold">{t("title")}</h1>
    <AccountNavigation showManagedLearners={account.learners.length > 0} />
    <div className="grid gap-8 md:grid-cols-2">
      <section id="courses" className="scroll-mt-24 space-y-4 rounded-2xl border border-border bg-card p-6 md:col-span-2">
        <h2 className="font-heading text-2xl">{t("courses")}</h2>
        {!account.enrollments.length && <p>{t("emptyCourses")}</p>}
        {account.enrollments.map(enrollment => <article key={enrollment.id} className="rounded-lg border border-border p-4">
          <h3 className="font-semibold">{enrollment.student.fullName} · {enrollment.planCodeSnapshot.replaceAll("_", " ")}</h3>
          <p className="mt-2">{t(`enrollmentStatus.${enrollment.status}`)}</p>
          {enrollment.cohort && <p className="text-sm text-muted-foreground">{enrollment.cohort.name}{enrollment.cohort.weeklyDay && <> · {t(`weekday.${enrollment.cohort.weeklyDay}`)}</>} · {enrollment.cohort.localStartTime?.toISOString().slice(11, 16)} · {enrollment.cohort.timeZone}</p>}
        </article>)}
        <Link className="inline-block font-medium underline underline-offset-4" href="/account/course-payments">{t("payments")}</Link>
        <p className="text-sm text-muted-foreground">{t("accessNotice")}</p>
      </section>
      {account.learners.length > 0 && <section id="learners" className="scroll-mt-24 space-y-3 rounded-2xl border border-border bg-card p-6">
        <h2 className="font-heading text-2xl">{t("learners")}</h2>
        {!account.learners.length && <p>{t("emptyLearners")}</p>}
        {account.learners.map(relation => <p key={relation.id} className="font-medium">{relation.student.fullName}</p>)}
        <p className="text-sm text-muted-foreground">{t("guardianNotice")}</p>
      </section>}
      <section id="profile" className="scroll-mt-24 space-y-3 rounded-2xl border border-border bg-card p-6">
        <h2 className="font-heading text-2xl">{t("profile")}</h2>
        {account.profile.fullName && <p>{account.profile.fullName}</p>}
        <p className="break-all">{account.profile.email}</p><p className="text-sm text-muted-foreground">{t("verifiedEmail")}</p>
      </section>
      <section id="orders" className="scroll-mt-24 space-y-4 rounded-2xl border border-border bg-card p-6 md:col-span-2">
        <h2 className="font-heading text-2xl">{t("orders")}</h2><p className="text-sm text-muted-foreground">{t("orderNotice")}</p>
        {!account.orders.length && <p>{t("emptyOrders")}</p>}
        {account.orders.map(order => <article key={order.id} className="flex flex-wrap justify-between gap-3 rounded-lg border border-border p-4">
          <span>{order.orderNumber ?? order.id} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(order.createdAt)}</span>
          <span>{new Intl.NumberFormat(locale, { style: "currency", currency: order.currency }).format(order.total / 100)} · {t(`paymentStatus.${order.paymentStatus}`)}</span>
        </article>)}
      </section>
    </div><p className="mt-6 text-sm text-muted-foreground">{t("limitNotice")}</p>
  </Container>;
}
