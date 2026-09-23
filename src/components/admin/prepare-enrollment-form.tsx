"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PreparationSummary } from "@/lib/courses/prepare-enrollment";
import type { EnrollmentCreationResult } from "@/lib/courses/create-enrollment";
import type { PreparationInput } from "@/lib/courses/preparation-rules";

type Plan = { id: string; code: string; format: string };
type Cohort = { id: string; code: string; coursePlanId: string; courseStartDate: string };
const selectStyle = "w-full rounded-md border border-input bg-background p-2 text-sm";
export function PreparationSummaryView({ summary: s, onCreate, busy }: {
  summary: PreparationSummary;
  onCreate: () => Promise<void>;
  busy: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const fields = [
    ["Learner", `${s.learner.fullName} (${s.learner.id}) · ${s.learner.hasLogin ? "Learner login exists" : "No learner login"}`],
    ["Account / payer", `${s.customer.email} · Customer ${s.customer.id}`],
    ["Relationship", `${s.relationship} · ${s.relationshipState === "ACTIVE_EXISTING" ? "Existing active relation" : "Will be persisted in final transaction"}`],
    ["Course", `${s.plan.code} · ${s.plan.level} · ${s.plan.format === "GROUP" ? "Small Group · 3–4 students" : "1-to-1"}`],
    ["Monthly base price", new Intl.NumberFormat("en-US", { style: "currency", currency: s.plan.currency }).format(s.plan.monthlyPriceCents / 100) + ` ${s.plan.currency}`],
    ...(s.cohort ? [["Cohort", s.cohort.code], ["Weekly class", `${s.cohort.weeklyDay} · ${s.cohort.localStartTime} · ${s.cohort.timeZone} · ${s.cohort.durationMinutes} minutes`]] : []),
    [s.cohort ? "Cohort course start" : "Agreed lesson start", s.periodStart],
    ["Billing timezone", s.billingTimeZone],
    ["First billing period [start, end)", `[${s.periodStart}, ${s.periodEnd})`],
    ["Payment deadline rule", s.paymentDeadlineRule],
  ];
  return <section className="space-y-5 rounded-xl border border-primary/30 bg-card p-5" aria-label="Preparation summary">
    <h2 className="font-heading text-2xl">Preparation summary</h2>
    <dl className="space-y-4">{fields.map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}</dl>
    <p className="text-sm">Base-price preview only. Promotions and the financial snapshot will be evaluated at payment creation. No legacy discounts are used.</p>
    <div className="rounded-lg border border-border p-4"><p className="mb-2">For this proposed enrollment:</p>{s.warnings.map(w => <p key={w} className="font-semibold">{w}</p>)}</div>
    <p className="text-sm text-muted-foreground">No seat is reserved. Existing portal entitlements are unchanged. This summary is not a saved draft; final creation must revalidate every fact.</p>
    <label className="flex items-start gap-3 rounded-lg border border-border p-4">
      <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-4" />
      <span>I confirm these authoritative details and want to create the enrollment, reserve a group seat when applicable, and create the initial payment obligation.</span>
    </label>
    <Button disabled={!confirmed || busy} onClick={() => void onCreate()} aria-describedby="create-enrollment-help">
      {busy ? "Creating enrollment…" : "Create Enrollment & Payment"}
    </Button>
    <p id="create-enrollment-help" className="text-sm text-muted-foreground">This financial action is atomic. It still does not verify payment or activate portal access.</p>
  </section>;
}

export function EnrollmentCreationView({ result }: { result: EnrollmentCreationResult }) {
  const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: result.payment.currency }).format(cents / 100);
  return <section className="space-y-5 rounded-xl border border-primary bg-card p-5" aria-label="Enrollment creation result">
    <h2 className="font-heading text-2xl">Enrollment and initial payment created</h2>
    {result.idempotent && <p className="rounded-lg border border-border p-3">This application was already converted. No duplicate enrollment or payment was created.</p>}
    <dl className="grid gap-4 sm:grid-cols-2">
      <div><dt className="text-sm text-muted-foreground">Learner</dt><dd className="font-medium">{result.learner.fullName}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Relationship</dt><dd className="font-medium">{result.relationship}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Course</dt><dd className="font-medium">{result.course.code} · {result.course.format}</dd></div>
      {result.cohort && <div><dt className="text-sm text-muted-foreground">Cohort / seat</dt><dd className="font-medium">{result.cohort.code} · Seat {result.cohort.seatPosition}</dd></div>}
      <div><dt className="text-sm text-muted-foreground">Start date</dt><dd className="font-medium">{result.enrollment.startsAt}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Billing period</dt><dd className="font-medium">[{result.payment.periodStart}, {result.payment.periodEnd})</dd></div>
      <div><dt className="text-sm text-muted-foreground">Base amount</dt><dd className="font-medium">{money(result.payment.baseAmountCents)}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Discount</dt><dd className="font-medium">{money(result.payment.discountAmountCents)}{result.payment.promotionName ? ` · ${result.payment.promotionName}` : ""}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Final amount</dt><dd className="font-medium">{money(result.payment.finalAmountCents)} {result.payment.currency}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Payment expiration</dt><dd className="font-medium">{new Date(result.payment.expiresAt).toLocaleString()}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Enrollment status</dt><dd className="font-medium">{result.enrollment.status}</dd></div>
      <div><dt className="text-sm text-muted-foreground">Payment status</dt><dd className="font-medium">{result.payment.status}</dd></div>
    </dl>
    <div className="rounded-lg border border-border p-4">{result.warnings.map(warning => <p key={warning} className="font-semibold">{warning}</p>)}</div>
  </section>;
}
export function PrepareEnrollmentForm({ applicationId, plans, cohorts, learners, initial }: {
  applicationId: string; plans: Plan[]; cohorts: Cohort[];
  learners: { id: string; fullName: string }[];
  initial: { coursePlanId: string; supabaseUserId: string; studentId: string };
}) {
  const [planId, setPlanId] = useState(initial.coursePlanId);
  const [mode, setMode] = useState("EXISTING");
  const [studentId, setStudentId] = useState(initial.studentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<PreparationSummary | null>(null);
  const [preparedInput, setPreparedInput] = useState<PreparationInput | null>(null);
  const [result, setResult] = useState<EnrollmentCreationResult | null>(null);
  const group = plans.find(p => p.id === planId)?.format === "GROUP";
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(""); setSummary(null);
    const d = new FormData(e.currentTarget);
    try {
      const payload = {
        relationship: d.get("relationship"), supabaseUserId: d.get("supabaseUserId"), coursePlanId: planId,
        learner: mode === "NEW" ? { mode: "NEW", fullName: d.get("fullName") } : { mode: "EXISTING", studentId },
        cohortId: group ? d.get("cohortId") : null, agreedStartDate: group ? null : d.get("agreedStartDate"),
        billingTimeZone: group ? null : d.get("billingTimeZone"),
      };
      const response = await fetch(`/api/admin/course-applications/${applicationId}/prepare`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSummary(result.summary); setStudentId(result.summary.learner.id); setMode("EXISTING");
      setPreparedInput({ ...payload, relationship: result.summary.relationship, learner: { mode: "EXISTING", studentId: result.summary.learner.id } } as PreparationInput);
    } catch (e) { setError(e instanceof Error ? e.message : "Preparation failed"); } finally { setBusy(false); }
  }
  async function createEnrollment() {
    if (!preparedInput) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch(`/api/admin/course-applications/${applicationId}/enroll`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...preparedInput, confirmation: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setResult(body.result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enrollment creation failed");
    } finally {
      setBusy(false);
    }
  }
  return <div className="space-y-6">
    <form onSubmit={submit} onChange={() => { setSummary(null); setPreparedInput(null); setResult(null); }} className="space-y-5 rounded-xl border border-border bg-card p-5">
      <p className="text-sm">This action may create a verified Customer and an explicitly requested learner, and audit their application links. It does not enroll, charge, reserve a seat, or grant portal access.</p>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block">Account relationship<select name="relationship" className={selectStyle} defaultValue="" required><option value="" disabled>Choose explicitly</option><option value="SELF">SELF — learner is the account/payer</option><option value="GUARDIAN">GUARDIAN — account/payer manages the learner</option></select></label>
        <label className="block">Verified account’s Supabase user ID<Input name="supabaseUserId" required defaultValue={initial.supabaseUserId} placeholder="Supabase Auth user UUID — not an email" aria-describedby="account-help" /></label>
        <p id="account-help" className="text-sm text-muted-foreground">Use the account’s authoritative ID from Supabase Auth. Email confirmation is checked server-side. If setup is incomplete, finish the existing account setup first; this form never auto-confirms an email or sends a child a guardian’s login link.</p>
        <label className="block">Learner choice<select value={mode} onChange={e => setMode(e.target.value)} className={selectStyle}><option value="EXISTING">Select existing learner by ID</option><option value="NEW">Create new learner explicitly</option></select></label>
        {mode === "EXISTING" ? <label className="block">Learner ID<Input list="learner-options" value={studentId} onChange={e => setStudentId(e.target.value)} required /><datalist id="learner-options">{learners.map(l => <option key={l.id} value={l.id}>{l.fullName}</option>)}</datalist></label> : <label className="block">Actual learner full name<Input name="fullName" required maxLength={200} /><span className="text-sm text-muted-foreground">For GUARDIAN, the new learner receives no login identity or email.</span></label>}
        <label className="block">Course plan<select value={planId} onChange={e => setPlanId(e.target.value)} required className={selectStyle}><option value="" disabled>Choose course plan</option>{plans.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}</select></label>
        {group ? <label className="block">OPEN cohort<select key={planId} name="cohortId" className={selectStyle} defaultValue="" required><option value="" disabled>Choose eligible cohort</option>{cohorts.filter(c => c.coursePlanId === planId).map(c => <option key={c.id} value={c.id}>{c.code} · starts {c.courseStartDate}</option>)}</select></label> : <div className="grid gap-4 sm:grid-cols-2"><label className="block">Agreed lesson start date<Input name="agreedStartDate" type="date" required /></label><label className="block">Billing IANA timezone<Input name="billingTimeZone" required placeholder="America/New_York" /></label></div>}
        <Button type="submit">{busy ? "Preparing…" : "Resolve identities & prepare summary"}</Button>
      </fieldset>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </form>
    <div aria-live="polite">
      {summary && !result && <PreparationSummaryView summary={summary} onCreate={createEnrollment} busy={busy} />}
      {result && <EnrollmentCreationView result={result} />}
    </div>
  </div>;
}
