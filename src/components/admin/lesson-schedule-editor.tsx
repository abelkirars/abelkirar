"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lessonDraftSchema, lessonWeekdays } from "@/lib/courses/lesson-schedule-rules";
import { LESSON_TIME_ZONE, lessonTimeInput, lessonTimeMinute } from "@/lib/courses/lesson-schedule-presentation";
import type { AdminLessonScheduleEditor } from "@/lib/courses/lesson-schedule-views";

const selectClass = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-ring";
const errorCodes = ["invalid", "unavailable", "unauthorized", "teacher", "owner", "published", "incomplete", "conflict", "retry"] as const;

export function LessonScheduleEditor({ data }: { data: AdminLessonScheduleEditor }) {
  const t = useTranslations("lessonScheduling");
  const router = useRouter();
  const inFlight = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [includeSecond, setIncludeSecond] = useState(data.slots.some(s => s.ordinal === 2));
  const [days, setDays] = useState<string[]>([1, 2].map(ordinal => data.slots.find(s => s.ordinal === ordinal && s.timeZone === LESSON_TIME_ZONE)?.weekday ?? ""));
  const sameDay = includeSecond && !!days[0] && days[0] === days[1];
  const published = data.state === "PUBLISHED";
  const locked = busy || published || data.terminal;
  const first = data.slots.find(s => s.ordinal === 1);
  const teacherIds = new Set(data.slots.map(s => s.teacherAdminId));
  const teacherId = data.state !== "LEGACY" && teacherIds.size === 1 ? first?.teacherAdminId ?? "" : "";

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function send(body: unknown, success: string) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setFeedback("");
    try {
      const res = await fetch(`/api/admin/lesson-schedules/${data.owner.kind}/${encodeURIComponent(data.owner.id)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) {
        const code = errorCodes.find(code => code === result.error) ?? "unavailable";
        setError(t(`error.${code}`));
        return;
      }
      setFeedback(t(success));
      // Keep publication disabled until refresh returns the authoritative saved slots.
      setDirty(true); setConfirmed(false); router.refresh();
    } catch { setError(t("error.unavailable")); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const fields = new FormData(event.currentTarget);
    const text = (key: string) => String(fields.get(key) ?? "");
    const draft = lessonDraftSchema.safeParse({
      teacherAdminId: text("teacherAdminId"),
      slots: (includeSecond ? [1, 2] : [1]).map(ordinal => ({
        ordinal, weekday: text(`weekday${ordinal}`), localStartMinute: lessonTimeMinute(text(`time${ordinal}`)),
        durationMinutes: Number(text(`duration${ordinal}`)), timeZone: LESSON_TIME_ZONE,
        effectiveStartDate: text("startDate"), effectiveEndDate: text("endDate") || null,
      })),
    });
    if (!draft.success) { setError(t(sameDay ? "differentDays" : "error.invalid")); return; }
    await send({ action: "draft", draft: draft.data }, "saved");
  }

  return <div className="space-y-6">
    <section className="rounded-2xl border border-secondary/20 bg-secondary/5 p-5 sm:p-6" aria-label={t("status")}>
      <p className="text-sm font-semibold text-secondary">{t(`state.${data.state}`)}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(published ? "publishedNotice" : "draftNotice")}</p>
      {data.terminal && <p className="mt-2 text-sm font-medium">{t("terminalNotice")}</p>}
      {data.state === "LEGACY" && <div className="mt-4 rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">{t("legacyTitle")}</h2>
        <p className="mt-1 text-sm">{first ? `${t(`weekday.${first.weekday}`)} · ${lessonTimeInput(first.localStartMinute)} · ${t("minutes", { count: first.durationMinutes })} · ${first.timeZone}` : t("empty")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("legacyNotice")}</p>
      </div>}
      {!data.slots.length && data.legacy?.weekday && <p className="mt-3 text-sm text-muted-foreground">
        {t("legacyReference")}: {data.legacy.weekday} · {data.legacy.localStartTime} · {data.legacy.timeZone}
      </p>}
    </section>

    <form onSubmit={save} onChange={() => setDirty(true)} className="space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-6">
      {error && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring">{error}</div>}
      <fieldset disabled={locked} className="space-y-6">
        <legend className="mb-4 font-heading text-xl">{t("editorTitle")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2"><span className="block font-medium">{t("teacher")}</span>
            <select className={selectClass} name="teacherAdminId" required defaultValue={teacherId} aria-describedby="lesson-teacher-help">
              <option value="">{t("chooseTeacher")}</option>
              {teacherId && !data.teachers.some(teacher => teacher.id === teacherId) && <option value={teacherId} disabled>{t("inactiveTeacher")}</option>}
              {data.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.displayName}</option>)}
            </select>
            <span id="lesson-teacher-help" className="block text-sm text-muted-foreground">{t("teacherHelp")}</span>
          </label>
          <div className="space-y-2"><p className="font-medium">{t("timezone")}</p><p className="rounded-lg bg-muted/40 p-3 text-sm">{t("centralTime")} · {LESSON_TIME_ZONE}</p><p className="text-sm text-muted-foreground">{t("timezoneHelp")}</p></div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[1, 2].map(ordinal => {
            const slot = data.slots.find(s => s.ordinal === ordinal);
            // A legacy wall time in another zone must be deliberately re-entered.
            const compatible = slot?.timeZone === LESSON_TIME_ZONE ? slot : undefined;
            const enabled = ordinal === 1 || includeSecond;
            return <fieldset key={ordinal} className="min-w-0 space-y-4 rounded-xl border border-border p-4">
              <legend className="px-2 font-semibold">{t("lesson", { number: ordinal })}</legend>
              {ordinal === 2 && <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={includeSecond} onChange={e => { setIncludeSecond(e.target.checked); setDirty(true); }} className="size-4 accent-secondary" />{t("configureSecond")}</label>}
              <fieldset disabled={!enabled} className="space-y-4 disabled:opacity-50">
                <label className="block space-y-1"><span>{t("day")}</span><select name={`weekday${ordinal}`} className={selectClass} required={enabled} defaultValue={compatible?.weekday ?? ""}
                  aria-invalid={sameDay || undefined} aria-describedby={sameDay ? "lesson-day-error" : undefined}
                  onChange={e => setDays(current => { const next = [...current]; next[ordinal - 1] = e.target.value; return next; })}>
                  <option value="">{t("chooseDay")}</option>{lessonWeekdays.map(day => <option key={day} value={day}>{t(`weekday.${day}`)}</option>)}
                </select></label>
                <label className="block space-y-1"><span>{t("time")}</span><Input name={`time${ordinal}`} type="time" step={60} required={enabled} defaultValue={compatible ? lessonTimeInput(compatible.localStartMinute) : ""} className="min-h-11" /></label>
                <label className="block space-y-1"><span>{t("duration")}</span><Input name={`duration${ordinal}`} type="number" min={15} max={480} step={1} list="lesson-durations" required={enabled} defaultValue={compatible?.durationMinutes ?? ""} className="min-h-11" /></label>
              </fieldset>
              {!enabled && <p className="text-sm text-muted-foreground">{t("secondLater")}</p>}
            </fieldset>;
          })}
        </div>
        <datalist id="lesson-durations">{[30, 45, 60, 90].map(value => <option key={value} value={value} />)}</datalist>
        {sameDay && <p id="lesson-day-error" role="alert" className="text-sm text-destructive">{t("differentDays")}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1"><span>{t("startDate")}</span><Input name="startDate" type="date" required defaultValue={first?.effectiveStartDate ?? ""} className="min-h-11" /></label>
          <label className="space-y-1"><span>{t("endDate")}</span><Input name="endDate" type="date" defaultValue={first?.effectiveEndDate ?? ""} className="min-h-11" /></label>
        </div>
        <p className="text-sm text-muted-foreground">{t("dateHelp")}</p>
        <Button type="submit" disabled={sameDay || !data.teachers.length} className="min-h-11">{busy ? t("saving") : t("saveDraft")}</Button>
      </fieldset>
    </form>

    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-label={t("publication")}>
      <p className="text-sm text-muted-foreground">{t("publishHelp")}</p>
      <Button type="button" disabled={busy || dirty || data.terminal || data.state !== "DRAFT" || data.slots.length !== 2}
        onClick={() => void send({ action: "publish" }, "publishedSuccess")} className="min-h-11 bg-secondary text-secondary-foreground hover:bg-secondary/90">{t("publish")}</Button>
      {dirty && <p className="text-sm text-muted-foreground">{t("saveFirst")}</p>}
      {data.slots.length > 0 && <div className="space-y-3 border-t border-border pt-4">
        <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} className="mt-1 size-4 shrink-0 accent-secondary" />{t("archiveConfirm")}</label>
        <Button type="button" variant="outline" disabled={busy || !confirmed} onClick={() => void send({ action: "archive", confirmed: true }, "archivedSuccess")} className="min-h-11">{t("archive")}</Button>
      </div>}
    </section>
    {feedback && <p role="status" className="rounded-xl bg-secondary/10 p-4 text-sm text-secondary">{feedback}</p>}
  </div>;
}
