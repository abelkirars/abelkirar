import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireAdminPage } from "@/lib/admin/dal";
import { lessonOwnerSchema } from "@/lib/courses/lesson-schedule-rules";
import { getAdminLessonScheduleEditor } from "@/lib/courses/lesson-schedule-views";
import { LessonScheduleEditor } from "@/components/admin/lesson-schedule-editor";
import { Container } from "@/components/marketing/container";

export const dynamic = "force-dynamic";
export default async function LessonSchedulePage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  await requireAdminPage();
  const owner = lessonOwnerSchema.safeParse(await params);
  if (!owner.success) notFound();
  const [data, t] = await Promise.all([getAdminLessonScheduleEditor(owner.data), getTranslations("lessonScheduling")]);
  if (!data) notFound();
  return <Container className="max-w-4xl space-y-6 py-10">
    <Link href="/admin/lesson-schedules" className="inline-block min-h-11 py-3 text-secondary underline">{t("title")}</Link>
    <header className="space-y-2"><p className="text-sm font-medium text-secondary">{t(data.owner.kind === "cohort" ? "groups" : "private")}</p>
      <h1 className="font-heading text-3xl">{data.name}</h1>
      <p className="text-sm text-muted-foreground">{t(`plan.${data.plan}`)} · {data.ownerStatus}</p>
      {data.owner.kind === "cohort" && <Link href={`/admin/course-cohorts/${data.owner.id}`} className="inline-block min-h-11 py-3 text-sm text-secondary underline">{data.code}</Link>}
    </header>
    <LessonScheduleEditor key={`${data.owner.id}:${data.revision}:${data.terminal}`} data={data} />
  </Container>;
}
