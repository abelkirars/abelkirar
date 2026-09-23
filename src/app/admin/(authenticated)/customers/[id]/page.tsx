import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/lib/admin/dal";
import { getAdminCustomerOverview } from "@/lib/customer/admin-overview";
import { Container } from "@/components/marketing/container";

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const detail = await getAdminCustomerOverview((await params).id);
  if (!detail) notFound();
  const [t, locale] = await Promise.all([getTranslations("customer360"), getLocale()]);
  const { customer } = detail;
  const money = (amount: number, currency: string) => new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount / 100);
  return <Container className="max-w-5xl space-y-8 py-10">
    <Link href="/admin/customers" className="underline">{t("title")}</Link><h1 className="font-heading text-3xl">{customer.fullName ?? customer.email}</h1><p>{customer.email} · {customer.status}{customer.archivedAt && ` · ${t("archived")}`}</p><p className="text-sm text-muted-foreground">{t("identityNotice")}</p>
    <section><h2 className="mb-3 font-heading text-xl">{t("learners")}</h2>{customer.studentRelations.map(relation => <p key={relation.id}><Link className="underline" href={`/admin/students/${relation.student.id}`}>{relation.student.fullName}</Link> · {relation.type} · {t(relation.endedAt || relation.archivedAt ? "ended" : "current")}</p>)}</section>
    <section><h2 className="mb-3 font-heading text-xl">{t("applications")}</h2>{customer.applications.map(application => <p key={application.id}><Link className="underline" href={`/admin/course-applications/${application.id}`}>{application.fullName}</Link> · {application.status}</p>)}</section>
    <section><h2 className="mb-3 font-heading text-xl">{t("enrollments")}</h2>{customer.enrollments.map(enrollment => <p key={enrollment.id}>{enrollment.student.fullName} · {enrollment.planCodeSnapshot} · {enrollment.status}</p>)}</section>
    <section className="space-y-3"><h2 className="font-heading text-xl">{t("payments")}</h2>{detail.payments.map(payment => <article key={payment.id} className="rounded-xl border p-4"><Link className="underline" href={`/admin/course-payments/${payment.id}`}>{payment.kind} · {payment.periodStart.toISOString().slice(0, 10)} · {money(payment.finalAmountCents, payment.currency)} · {payment.status}</Link><ul className="mt-2 text-sm">{payment.submissions.map(submission => <li key={submission.id}>{submission.submittedAt.toISOString()} · {submission.method} · {submission.status}</li>)}</ul></article>)}</section>
    <section><h2 className="mb-3 font-heading text-xl">{t("orders")}</h2>{customer.orders.map(order => <p key={order.id}><Link className="underline" href={`/admin/orders/${order.id}`}>{order.orderNumber ?? order.id}</Link> · {money(order.total, order.currency)} · {order.paymentStatus}</p>)}</section>
    <section className="rounded-xl border p-5"><h2 className="mb-3 font-heading text-xl">{t("revenue")}</h2><p>{t("verifiedCourse")}: {detail.verifiedCourse.map(row => money(row._sum.finalAmountCents ?? 0, row.currency)).join(" · ") || "—"}</p><p>{t("paidStore")}: {detail.paidStore.map(row => money(row._sum.total ?? 0, row.currency)).join(" · ") || "—"}</p><p className="mt-2 text-sm text-muted-foreground">{t("revenueNotice")}</p></section>
    <p className="text-sm text-muted-foreground">{t("limits")}</p>
  </Container>;
}
