import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/dal";
import { listAdminCoursePayments, PAYMENT_QUEUE_FILTERS, paymentQueueFilter } from "@/lib/courses/admin-payments";
import { Container } from "@/components/marketing/container";

export const dynamic = "force-dynamic";
export default async function CoursePaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  await requireAdminPage();
  const query = await searchParams;
  const status = paymentQueueFilter(query.status);
  const rawPage = Number(query.page || 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 10000) : 1;
  const { payments, count } = await listAdminCoursePayments(status, page);
  return <Container className="max-w-6xl space-y-6 py-10">
    <h1 className="text-3xl font-semibold">Course payments</h1>
    <p>Review submitted tuition proofs against actual payment account activity.</p>
    <nav aria-label="Payment status filters" className="flex flex-wrap gap-2">{PAYMENT_QUEUE_FILTERS.map(filter =>
      <Link key={filter} href={`/admin/course-payments?status=${filter}`} aria-current={filter === status ? "page" : undefined}
        className={`rounded-lg border px-3 py-3 text-sm ${filter === status ? "border-primary bg-secondary text-secondary-foreground" : "border-border bg-card"}`}>{filter.replaceAll("_", " ")}</Link>
    )}</nav>
    <p className="text-sm text-muted-foreground">{count} payments · Page {page}</p>
    {!payments.length && <p>No payments in this view.</p>}
    <div className="grid gap-4 md:grid-cols-2">{payments.map(p => <Link key={p.id} href={`/admin/course-payments/${p.id}`} className="space-y-2 rounded-xl border border-border bg-card p-5 hover:border-primary">
      <h2 className="text-lg font-semibold">{p.enrollment.student.fullName}</h2>
      <p className="break-all text-sm">Payer: {p.enrollment.customer.email} · {p.relationship?.type ?? "Relationship missing"}</p>
      <p>{p.enrollment.levelSnapshot} · {p.enrollment.formatSnapshot.replaceAll("_", " ")}{p.enrollment.cohort ? ` · ${p.enrollment.cohort.code}` : ""}</p>
      <p className="font-semibold">{new Intl.NumberFormat("en", { style: "currency", currency: p.currency }).format(p.finalAmountCents / 100)} {p.currency} · {p.status}</p>
      <p className="text-sm">{p.kind} · {p.periodStart.toISOString().slice(0, 10)} – {p.periodEnd.toISOString().slice(0, 10)}</p>
      <p className="text-sm text-muted-foreground">{p.submissions[0] ? `Latest proof: ${p.submissions[0].status} · ${p.submissions[0].submittedAt.toISOString()}` : "No proof submitted"}</p>
    </Link>)}</div>
    <nav className="flex gap-5" aria-label="Payment pages">
      {page > 1 && <Link href={`/admin/course-payments?status=${status}&page=${page - 1}`}>Previous</Link>}
      {page * 50 < count && <Link href={`/admin/course-payments?status=${status}&page=${page + 1}`}>Next</Link>}
    </nav>
  </Container>;
}
