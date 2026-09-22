"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PreparationSummary } from "@/lib/courses/prepare-enrollment";

type Plan = { id: string; code: string; format: string };
type Cohort = { id: string; code: string; coursePlanId: string; courseStartDate: string };
const selectStyle = "w-full rounded-md border border-input bg-background p-2 text-sm";
export function PreparationSummaryView({ summary: s }: { summary: PreparationSummary }) {
  const fields = [
    ["Learner", `${s.learner.fullName} (${s.learner.id}) · ${s.learner.hasLogin ? "Learner login exists" : "No learner login"}`],
    ["Account / payer", `${s.customer.email} · Customer ${s.customer.id}`],
    ["Relationship", `${s.relationship} · ${s.relationshipState === "ACTIVE_EXISTING" ? "Existing active relation" : "Will be persisted in final transaction"}`],
    ["Course", `${s.plan.code} · ${s.plan.level} · ${s.plan.format === "GROUP" ? "Small Group · 3–4 students" : "1-to-1"}`],
    ["Monthly base price", new Intl.NumberFormat("en-US", { style: "currency", currency: s.plan.currency }).format(s.plan.monthlyPriceCents / 100) + ` ${s.plan.currency}`],
    ...(s.cohort ? [["Cohort", s.cohort.code], ["Weekly class", `${s.cohort.weeklyDay} · ${s.cohort.localStartTime} · ${s.cohort.timeZone} · ${s.cohort.durationMinutes} minutes`]] : []),
    [s.cohort ? "Cohort course start" : "Agreed lesson start", s.periodStart],
    ["First billing period [start, end)", `[${s.periodStart}, ${s.periodEnd})`],
    ["Payment deadline rule", s.paymentDeadlineRule],
  ];
  return <section className="space-y-5 rounded-xl border border-primary/30 bg-card p-5" aria-label="Preparation summary">
    <h2 className="font-heading text-2xl">Preparation summary</h2>
    <dl className="space-y-4">{fields.map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}</dl>
    <p className="text-sm">Base-price preview only. Promotions and the financial snapshot will be evaluated at payment creation. No legacy discounts are used.</p>
    <div className="rounded-lg border border-border p-4"><p className="mb-2">For this proposed enrollment:</p>{s.warnings.map(w => <p key={w} className="font-semibold">{w}</p>)}</div>
    <p className="text-sm text-muted-foreground">No seat is reserved. Existing portal entitlements are unchanged. This summary is not a saved draft; final creation must revalidate every fact.</p>
    <Button disabled aria-describedby="future-enrollment-action">Create Enrollment &amp; Payment</Button>
    <p id="future-enrollment-action" className="text-sm text-muted-foreground">Not available in this phase.</p>
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
  const group = plans.find(p => p.id === planId)?.format === "GROUP";
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(""); setSummary(null);
    const d = new FormData(e.currentTarget);
    try {
      const response = await fetch(`/api/admin/course-applications/${applicationId}/prepare`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        relationship: d.get("relationship"), supabaseUserId: d.get("supabaseUserId"), coursePlanId: planId,
        learner: mode === "NEW" ? { mode: "NEW", fullName: d.get("fullName") } : { mode: "EXISTING", studentId },
        cohortId: group ? d.get("cohortId") : null, agreedStartDate: group ? null : d.get("agreedStartDate"),
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSummary(result.summary); setStudentId(result.summary.learner.id); setMode("EXISTING");
    } catch (e) { setError(e instanceof Error ? e.message : "Preparation failed"); } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <form onSubmit={submit} onChange={() => setSummary(null)} className="space-y-5 rounded-xl border border-border bg-card p-5">
      <p className="text-sm">This action may create a verified Customer and an explicitly requested learner, and audit their application links. It does not enroll, charge, reserve a seat, or grant portal access.</p>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block">Account relationship<select name="relationship" className={selectStyle} defaultValue="" required><option value="" disabled>Choose explicitly</option><option value="SELF">SELF — learner is the account/payer</option><option value="GUARDIAN">GUARDIAN — account/payer manages the learner</option></select></label>
        <label className="block">Verified account’s Supabase user ID<Input name="supabaseUserId" required defaultValue={initial.supabaseUserId} placeholder="Supabase Auth user UUID — not an email" aria-describedby="account-help" /></label>
        <p id="account-help" className="text-sm text-muted-foreground">Use the account’s authoritative ID from Supabase Auth. Email confirmation is checked server-side. If setup is incomplete, finish the existing account setup first; this form never auto-confirms an email or sends a child a guardian’s login link.</p>
        <label className="block">Learner choice<select value={mode} onChange={e => setMode(e.target.value)} className={selectStyle}><option value="EXISTING">Select existing learner by ID</option><option value="NEW">Create new learner explicitly</option></select></label>
        {mode === "EXISTING" ? <label className="block">Learner ID<Input list="learner-options" value={studentId} onChange={e => setStudentId(e.target.value)} required /><datalist id="learner-options">{learners.map(l => <option key={l.id} value={l.id}>{l.fullName}</option>)}</datalist></label> : <label className="block">Actual learner full name<Input name="fullName" required maxLength={200} /><span className="text-sm text-muted-foreground">For GUARDIAN, the new learner receives no login identity or email.</span></label>}
        <label className="block">Course plan<select value={planId} onChange={e => setPlanId(e.target.value)} required className={selectStyle}><option value="" disabled>Choose course plan</option>{plans.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}</select></label>
        {group ? <label className="block">OPEN cohort<select key={planId} name="cohortId" className={selectStyle} defaultValue="" required><option value="" disabled>Choose eligible cohort</option>{cohorts.filter(c => c.coursePlanId === planId).map(c => <option key={c.id} value={c.id}>{c.code} · starts {c.courseStartDate}</option>)}</select></label> : <label className="block">Agreed lesson start date<Input name="agreedStartDate" type="date" required /></label>}
        <Button type="submit">{busy ? "Preparing…" : "Resolve identities & prepare summary"}</Button>
      </fieldset>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </form>
    <div aria-live="polite">{summary && <PreparationSummaryView summary={summary} />}</div>
  </div>;
}
