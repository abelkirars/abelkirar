import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/lib/admin/dal";
import { listAdminLessonScheduleOwners } from "@/lib/courses/lesson-schedule-views";
import { Container } from "@/components/marketing/container";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export default async function LessonSchedulesPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requireAdminPage();
  const query = (await searchParams).q;
  const q = typeof query === "string" ? query.slice(0, 80) : "";
  const [owners, t] = await Promise.all([listAdminLessonScheduleOwners(q), getTranslations("lessonScheduling")]);
  return <Container className="max-w-5xl space-y-8 py-10">
    <header><h1 className="font-heading text-3xl">{t("title")}</h1><p className="mt-2 max-w-2xl text-muted-foreground">{t("indexHelp")}</p></header>
    <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex-1 space-y-2"><span>{t("searchLabel")}</span><Input name="q" maxLength={80} defaultValue={q} className="min-h-11" /></label>
      <Button type="submit" className="min-h-11">{t("search")}</Button>
    </form>
    <p className="text-sm text-muted-foreground">{t("listLimit")}</p>
    <section className="space-y-3"><h2 className="font-heading text-2xl">{t("groups")}</h2>
      {!owners.cohorts.length && <p className="rounded-xl bg-muted/30 p-4">{t("noOwners")}</p>}
      {owners.cohorts.map(cohort => <Link key={cohort.id} href={`/admin/lesson-schedules/cohort/${cohort.id}`} className="block rounded-2xl border border-border bg-card p-5 hover:border-secondary focus-visible:outline-2 focus-visible:outline-ring">
        <h3 className="font-semibold">{cohort.name}</h3><p className="mt-1 text-sm text-muted-foreground">{cohort.code} · {t(`plan.${cohort.coursePlan.code}`)} · {cohort.status}{cohort.archivedAt ? ` · ${t("archived")}` : ""}</p>
      </Link>)}
    </section>
    <section className="space-y-3"><h2 className="font-heading text-2xl">{t("private")}</h2>
      {!owners.enrollments.length && <p className="rounded-xl bg-muted/30 p-4">{t("noOwners")}</p>}
      {owners.enrollments.map(enrollment => <Link key={enrollment.id} href={`/admin/lesson-schedules/enrollment/${enrollment.id}`} className="block rounded-2xl border border-border bg-card p-5 hover:border-secondary focus-visible:outline-2 focus-visible:outline-ring">
        <h3 className="font-semibold">{enrollment.student.fullName}</h3><p className="mt-1 text-sm text-muted-foreground">{t(`plan.${enrollment.planCodeSnapshot}`)} · {enrollment.status}{enrollment.archivedAt ? ` · ${t("archived")}` : ""}</p>
      </Link>)}
    </section>
  </Container>;
}
