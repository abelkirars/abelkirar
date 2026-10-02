import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays, BookOpen } from "lucide-react";
import { readMyLessonSchedules } from "@/lib/courses/lesson-schedule-views";
import { formatLessonDate, formatLessonTime, LESSON_TIME_ZONE, type MyLessonSchedule } from "@/lib/courses/lesson-schedule-presentation";

export async function MyLessons() {
  const [schedules, locale, t] = await Promise.all([readMyLessonSchedules(), getLocale(), getTranslations("lessonScheduling")]);
  return <MyLessonsView schedules={schedules} locale={locale} t={t} />;
}

export function MyLessonsView({ schedules, locale, t }: {
  schedules: MyLessonSchedule[]; locale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return <section id="my-lessons" aria-labelledby="my-lessons-title" className="mt-6 space-y-5 rounded-3xl border border-secondary/20 bg-card p-5 shadow-sm sm:p-6 lg:mt-8">
    <header className="flex items-start gap-3">
      <span className="rounded-xl bg-secondary/10 p-3 text-secondary"><CalendarDays className="size-5" aria-hidden="true" /></span>
      <div><h2 id="my-lessons-title" className="font-heading text-2xl">{t("myLessons")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("liveDescription")}</p></div>
    </header>
    {schedules.length === 0 ? <p className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-sm leading-6 text-muted-foreground">{t("empty")}</p>
      : schedules.map(schedule => <article key={schedule.enrollmentId} className="space-y-4">
        <h3 className="font-semibold">{t(`plan.${schedule.plan}`)}{schedule.cohortName && <span className="font-normal"> · {schedule.cohortName}</span>}</h3>
        <p className="text-sm font-medium text-secondary">{t(schedule.startsLater ? "startsLater" : "twoLive")}</p>
        <div className="grid gap-3 sm:grid-cols-2">{schedule.slots.map(slot => <div key={slot.ordinal} className="rounded-2xl border border-secondary/20 bg-secondary/5 p-5">
          <p className="text-sm font-medium text-muted-foreground">{t("lesson", { number: slot.ordinal })}</p>
          <p className="mt-2 font-heading text-xl">{t(`weekday.${slot.weekday}`)}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatLessonTime(slot.localStartMinute, locale)}</p>
          <p className="mt-2 text-sm">{t("minutes", { count: slot.durationMinutes })}</p>
          <p className="mt-3 text-sm text-muted-foreground">{t("effectiveFrom", { date: formatLessonDate(slot.effectiveStartDate, locale) })}{slot.effectiveEndDate && <> · {t("effectiveThrough", { date: formatLessonDate(slot.effectiveEndDate, locale) })}</>}</p>
        </div>)}</div>
        <p className="text-sm text-muted-foreground">{t("centralTime")} · {LESSON_TIME_ZONE}. {t("timezoneHelp")}</p>
      </article>)}
    <div className="flex items-start gap-3 border-t border-border pt-4">
      <BookOpen aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
      <div><h3 className="font-semibold">{t("guidedPractice")}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{t("guidedDescription")}</p><a href="#weekly-practice" className="mt-1 inline-block min-h-11 py-3 text-sm font-medium text-secondary underline">{t("viewPractice")}</a></div>
    </div>
  </section>;
}
