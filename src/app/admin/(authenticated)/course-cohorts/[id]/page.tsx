import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin/dal";
import { getAdminCohort } from "@/lib/courses/cohorts";
import { CohortScheduleForm } from "@/components/admin/cohort-forms";
import { Container } from "@/components/marketing/container";
export const dynamic = "force-dynamic";
export default async function CohortPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const cohort = await getAdminCohort((await params).id);
  if (!cohort) notFound();
  return <Container className="max-w-3xl space-y-6 py-10">
    <Link href="/admin/course-cohorts" className="text-primary hover:underline">← All cohorts</Link>
    <h1 className="font-heading text-3xl">{cohort.name}</h1>
    <p>{cohort.code} · {cohort.coursePlan.code} · {cohort.status}{cohort.archivedAt ? " · Archived" : ""}</p>
    <section aria-label="Seat state" className="grid grid-cols-2 gap-3 sm:grid-cols-4">{cohort.seats.map(s => <div key={s.id} className="rounded-lg border border-border p-3">Seat {s.position}<p className="text-sm">{s.currentEnrollmentId ? s.reservedUntil ? "Reserved" : "Assigned" : "Available"}</p></div>)}</section>
    <p className="text-sm text-muted-foreground">These are reusable capacity slots, not student membership history. Preparation never reserves them.</p>
    <CohortScheduleForm id={cohort.id} status={cohort.archivedAt ? "ARCHIVED" : cohort.status} schedule={{ weeklyDay: cohort.weeklyDay ?? "", localStartTime: cohort.localStartTime?.toISOString().slice(11,16) ?? "", durationMinutes: cohort.durationMinutes, timeZone: cohort.timeZone ?? "", courseStartDate: cohort.courseStartDate?.toISOString().slice(0,10) ?? "", courseEndDate: cohort.courseEndDate?.toISOString().slice(0,10) ?? "" }} />
  </Container>;
}
