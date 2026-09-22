"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WEEKDAYS } from "@/lib/courses/preparation-rules";

const selectStyle = "w-full rounded-md border border-input bg-background p-2 text-sm";
type Plan = { id: string; code: string };
export function CohortCreateForm({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const res = await fetch("/api/admin/course-cohorts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      router.push(`/admin/course-cohorts/${result.cohort.id}`); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create cohort"); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5">
    <h2 className="font-heading text-xl">Create draft cohort</h2>
    <label className="block space-y-1">Group plan<select className={selectStyle} name="coursePlanId" required defaultValue=""><option value="" disabled>Choose a group plan</option>{plans.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}</select></label>
    <label className="block space-y-1">Unique code<Input name="code" required maxLength={60} pattern="[A-Za-z0-9_-]+" placeholder="BEGINNER-GROUP-A" /></label>
    <label className="block space-y-1">Cohort name<Input name="name" required maxLength={150} placeholder="Beginner Group A" /></label>
    <p className="text-sm text-muted-foreground">Creates four empty seats. No applicant is enrolled or reserved.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <Button disabled={busy || plans.length === 0}>{busy ? "Creating…" : "Create draft"}</Button>
  </form>;
}
export type ScheduleView = { weeklyDay: string; localStartTime: string; durationMinutes: number | null; timeZone: string; courseStartDate: string; courseEndDate: string };
export function CohortScheduleForm({ id, status, schedule }: { id: string; status: string; schedule: ScheduleView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function send(body: unknown) {
    setBusy(true); setFeedback("");
    try {
      const response = await fetch(`/api/admin/course-cohorts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setFeedback("Saved. No seats were reserved."); router.refresh();
    } catch (e) { setFeedback(e instanceof Error ? e.message : "Could not save cohort"); } finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-xl border border-border bg-card p-5">
    <h2 className="font-heading text-xl">Weekly schedule</h2>
    <p className="text-sm text-muted-foreground">Times belong to the explicitly selected IANA timezone, not a fixed UTC offset. Save before opening the cohort. Only drafts can be edited here.</p>
    <form onSubmit={e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)); void send({ ...d, durationMinutes: Number(d.durationMinutes), courseEndDate: d.courseEndDate || null }); }}>
      <fieldset disabled={busy || status !== "DRAFT"} className="grid gap-4 sm:grid-cols-2">
        <label>Weekly day<select name="weeklyDay" className={selectStyle} defaultValue={schedule.weeklyDay} required><option value="" disabled>Choose weekday</option>{WEEKDAYS.map(day => <option key={day}>{day}</option>)}</select></label>
        <label>Local class time<Input name="localStartTime" type="time" required defaultValue={schedule.localStartTime} /></label>
        <label>Duration (minutes)<Input name="durationMinutes" type="number" min={15} max={480} required defaultValue={schedule.durationMinutes ?? ""} /></label>
        <label>IANA timezone<Input name="timeZone" required placeholder="America/New_York" defaultValue={schedule.timeZone} /></label>
        <label>Course start date<Input name="courseStartDate" type="date" required defaultValue={schedule.courseStartDate} /></label>
        <label>Course end date (optional)<Input name="courseEndDate" type="date" defaultValue={schedule.courseEndDate} /></label>
        <Button type="submit">{busy ? "Saving…" : "Save draft schedule"}</Button>
      </fieldset>
    </form>
    {status === "DRAFT" && <Button variant="outline" disabled={busy} onClick={() => void send({ action: "OPEN" })}>Open saved cohort</Button>}
    {feedback && <p role="status">{feedback}</p>}
  </section>;
}
