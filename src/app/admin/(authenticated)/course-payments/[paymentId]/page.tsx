import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin/dal";
import { getAdminCoursePayment } from "@/lib/courses/admin-payments";
import { formatPaymentDeadline } from "@/lib/courses/payment-deadline";
import { dateKey, nextMonthlyPeriod } from "@/lib/courses/monthly-billing-calendar";
import { CoursePaymentReviewForm } from "@/components/admin/course-payment-review-form";
import { Container } from "@/components/marketing/container";

export const dynamic = "force-dynamic";
export default async function AdminCoursePaymentPage({ params }: { params: Promise<{ paymentId: string }> }) {
  await requireAdminPage();
  const payment = await getAdminCoursePayment((await params).paymentId);
  if (!payment) notFound();
  const e = payment.enrollment;
  const cohort = e.cohort;
  const current = payment.submissions.find(s => s.status === "SUBMITTED");
  const initial = e.payments.find(item => item.kind === "INITIAL_ENROLLMENT");
  const latest = e.payments[0];
  let nextBillingPeriod = "Unavailable";
  if (initial && latest) {
    try {
      const next = nextMonthlyPeriod(dateKey(initial.periodStart), dateKey(latest.periodStart));
      nextBillingPeriod = `${next.periodStart} – ${next.periodEnd}`;
    } catch { /* Historical/manual periods remain visible without breaking admin review. */ }
  }
  const money = (cents: number) => new Intl.NumberFormat("en", { style: "currency", currency: payment.currency }).format(cents / 100);
  const facts = [
    ["Payment", payment.id], ["Status", payment.status], ["Kind", payment.kind], ["Learner", e.student.fullName],
    ["Payer", e.customer.email], ["Relationship", payment.relationship?.type ?? "Missing"],
    ["Plan snapshot", e.planCodeSnapshot], ["Level / format", `${e.levelSnapshot} / ${e.formatSnapshot}`],
    ["Enrollment", `${e.id} · ${e.status}`], ["Course access", e.portalAccess?.status ?? "Not active"],
    ["Billing period", `${payment.periodStart.toISOString().slice(0, 10)} – ${payment.periodEnd.toISOString().slice(0, 10)}`],
    ["Base tuition", money(payment.baseAmountCents)], ["Promotion", payment.promotionNameSnapshot ?? "None"],
    ["Promotion rule snapshot", payment.discountTypeSnapshot ? `${payment.discountTypeSnapshot} · ${payment.discountValueSnapshot}` : "None"],
    ["Pricing rule / revision", `${payment.pricingRuleVersion} / ${payment.revision}`],
    ["Discount", money(payment.discountAmountCents)], ["Final amount", `${money(payment.finalAmountCents)} ${payment.currency}`],
    ["Created", formatPaymentDeadline("en", payment.createdAt)], ["Original deadline", formatPaymentDeadline("en", payment.expiresAt)],
    ["Due", payment.dueAt ? formatPaymentDeadline("en", payment.dueAt) : "Initial enrollment window"],
    ["Derived next billing period", nextBillingPeriod],
    ["Verified", payment.verifiedAt ? `${formatPaymentDeadline("en", payment.verifiedAt)} · ${payment.verifiedByAdmin?.displayName}` : "Not verified"],
  ];
  return <Container className="max-w-5xl space-y-6 py-10">
    <Link href="/admin/course-payments" className="text-primary hover:underline">← Course payments</Link>
    <h1 className="text-3xl font-semibold">Payment review · {e.student.fullName}</h1>
    <dl className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">{facts.map(([label, value]) => <div key={label}>
      <dt className="text-sm text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd>
    </div>)}</dl>
    {!e.student.supabaseUserId && <p className="rounded-lg bg-muted p-4">This learner has no login. Verification can activate enrollment and course access, but does not create a child login or let the guardian enter the student portal as the child.</p>}
    {cohort && <section className="rounded-xl border border-border p-5">
      <h2 className="text-xl">{cohort.name} · {cohort.code}</h2>
      <p>{cohort.weeklyDay} · {cohort.localStartTime?.toISOString().slice(11, 16)} · {cohort.timeZone}</p>
      <p>{cohort.courseStartDate?.toISOString().slice(0, 10)} – {cohort.courseEndDate?.toISOString().slice(0, 10) ?? "No end date"}</p>
      <p>Seat {e.currentCohortSeat?.position ?? "missing"} · {e.currentCohortSeat?.reservedUntil ? `Reserved until ${formatPaymentDeadline("en", e.currentCohortSeat.reservedUntil)}` : e.currentCohortSeat ? "Occupied" : "Not assigned"}</p>
    </section>}
    <section className="space-y-4" aria-label="Submission history">
      <h2 className="text-2xl">Proof submission history</h2>
      {!payment.submissions.length && <p>No proofs have been submitted.</p>}
      {payment.submissions.map(s => <article key={s.id} className="space-y-2 rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Attempt {s.attemptNumber} · {s.status === "ACCEPTED" ? "ACCEPTED (verified proof)" : s.status}</h3>
        <p>{formatPaymentDeadline("en", s.submittedAt)} · {s.method}</p>
        <p>Reported sent: {money(s.amountSentCents)} · Sender: {s.senderName ?? "Not supplied"}</p>
        {s.amountSentCents !== payment.finalAmountCents && <p className="text-destructive">Reported amount differs from the required amount. Check actual funds received.</p>}
        <p>Sent at: {s.sentAt?.toISOString() ?? "Not supplied"} · Reference: {s.transactionReference ?? "Not supplied"}</p>
        <p className="break-all text-sm">{s.originalFileName} · {s.mimeType} · {s.fileSizeBytes} bytes</p>
        <a href={`/api/admin/course-payments/${payment.id}/proof/${s.id}`} target="_blank" rel="noopener noreferrer" className="inline-block min-h-11 py-3 text-primary underline">Download private proof (new tab)</a>
        {s.reviewedAt && <p>Reviewed: {formatPaymentDeadline("en", s.reviewedAt)} · {s.reviewedByAdmin?.displayName}</p>}
        {s.rejectionReason && <p>Reason shared with payer: {s.rejectionReason}</p>}
      </article>)}
    </section>
    <section className="space-y-3"><h2 className="text-2xl">Enrollment payment history</h2>{e.payments.map(item => <Link key={item.id} href={`/admin/course-payments/${item.id}`} className="block rounded-lg border p-3"><strong>{item.kind} · {item.status}</strong><br />{item.periodStart.toISOString().slice(0,10)} – {item.periodEnd.toISOString().slice(0,10)} · {money(item.finalAmountCents)}</Link>)}</section>
    {payment.status === "PROOF_SUBMITTED" && current && !e.archivedAt
      && ((payment.kind === "INITIAL_ENROLLMENT" && e.status === "PENDING_PAYMENT" && !e.portalAccess)
        || (payment.kind === "MONTHLY" && e.status === "ACTIVE" && Boolean(e.portalAccess)))
      ? <CoursePaymentReviewForm key={current.id} paymentId={payment.id} submissionId={current.id} afterDeadline={payment.expiresAt <= new Date()} kind={payment.kind} />
      : <p className="rounded-lg bg-muted p-4">This payment is not currently eligible for review.</p>}
  </Container>;
}
