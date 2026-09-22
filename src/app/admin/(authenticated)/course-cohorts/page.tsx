import Link from "next/link";
import { requireAdminPage } from "@/lib/admin/dal";
import { listAdminCohorts } from "@/lib/courses/cohorts";
import { listActiveCoursePlans } from "@/lib/courses/plans";
import { CohortCreateForm } from "@/components/admin/cohort-forms";
import { Container } from "@/components/marketing/container";
export const dynamic = "force-dynamic";
export default async function CohortsPage() {
  await requireAdminPage();
  const [cohorts, plans] = await Promise.all([listAdminCohorts(), listActiveCoursePlans()]);
  return <Container className="max-w-5xl space-y-6 py-10">
    <h1 className="font-heading text-3xl">Course cohorts</h1>
    <p>Small Group · 3–4 students. Maximum four; only OPEN cohorts can be selected for preparation.</p>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-3" aria-label="Existing cohorts">
        {cohorts.length === 0 && <p className="text-muted-foreground">No cohorts yet. Create a draft to configure a weekly schedule.</p>}
        {cohorts.map(c => <Link key={c.id} href={`/admin/course-cohorts/${c.id}`} className="block rounded-xl border border-border bg-card p-5 hover:border-primary">
          <h2 className="font-semibold">{c.name} · {c.code}</h2>
          <p>{c.status}{c.archivedAt ? " · Archived" : ""} · {c.seats.filter(s => s.currentEnrollmentId).length} / 4 assigned or reserved</p>
          <p className="text-sm text-muted-foreground">{c.coursePlan.code} · {c.weeklyDay ?? "Schedule needed"} {c.localStartTime?.toISOString().slice(11,16)} {c.timeZone}</p>
        </Link>)}
      </section>
      <CohortCreateForm plans={plans.filter(p => p.format === "GROUP")} />
    </div>
  </Container>;
}
