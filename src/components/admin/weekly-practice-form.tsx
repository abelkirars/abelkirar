"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { WeeklyPractice } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WEEKLY_PRACTICE_ADMIN_STATUSES } from "@/lib/validations/weekly-practice";

const STATUS_LABELS: Record<(typeof WEEKLY_PRACTICE_ADMIN_STATUSES)[number], string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  MISSED: "Missed",
};

const ADMIN_EDITABLE_STATUSES: readonly string[] = WEEKLY_PRACTICE_ADMIN_STATUSES;

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Snaps any "YYYY-MM-DD" string to the Monday of its own (UTC) week. */
function mondayOfWeek(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const day = date.getUTCDay(); // 0 (Sun) .. 6 (Sat)
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return toDateOnly(date);
}

// There is no "publish" action anywhere in this form. weekStartDate is the
// only visibility control — src/lib/student/queries.ts's
// getCurrentAssignment filters on weekStartDate <= now(). The indicator
// below mirrors that exact comparison so the UI's claim and the real query
// can never disagree.
export function WeeklyPracticeForm({
  studentId,
  weeklyPractice,
  onDone,
}: {
  studentId: string;
  weeklyPractice?: WeeklyPractice;
  onDone?: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const [weekStartDate, setWeekStartDate] = useState(() =>
    mondayOfWeek(toDateOnly(weeklyPractice?.weekStartDate ?? new Date()))
  );
  const [status, setStatus] = useState<string>(weeklyPractice?.status ?? "NOT_STARTED");
  const [recordingRequired, setRecordingRequired] = useState(
    weeklyPractice?.recordingRequired ?? false
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusIsAdminEditable = ADMIN_EDITABLE_STATUSES.includes(status);
  const isScheduled = new Date(`${weekStartDate}T00:00:00Z`) > new Date();
  const weekEndDate = toDateOnly(
    new Date(new Date(`${weekStartDate}T00:00:00Z`).getTime() + 6 * 86400000)
  );

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.value) return;
    setWeekStartDate(mondayOfWeek(e.target.value));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("weekStartDate", weekStartDate);
    formData.set("recordingRequired", String(recordingRequired));
    if (weeklyPractice) formData.set("status", status);

    try {
      const res = await fetch(
        weeklyPractice
          ? `/api/admin/students/${studentId}/weekly-practice/${weeklyPractice.id}`
          : `/api/admin/students/${studentId}/weekly-practice`,
        { method: weeklyPractice ? "PATCH" : "POST", body: formData }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.refresh();
      if (!weeklyPractice) {
        form.reset();
        setWeekStartDate(mondayOfWeek(toDateOnly(new Date())));
        setRecordingRequired(false);
      }
      onDone?.();
    } catch (err) {
      console.error("[WeeklyPracticeForm] submit failed:", err);
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field orientation="responsive">
        <FieldLabel htmlFor={`${uid}-weekTitle`}>Title</FieldLabel>
        <Input
          id={`${uid}-weekTitle`}
          name="weekTitle"
          defaultValue={weeklyPractice?.weekTitle ?? `Week of ${weekStartDate}`}
          required
        />
      </Field>

      <Field orientation="responsive">
        <FieldLabel htmlFor={`${uid}-weekStartDate`}>Week start date</FieldLabel>
        <Input
          id={`${uid}-weekStartDate`}
          type="date"
          value={weekStartDate}
          onChange={handleDateChange}
          required
        />
      </Field>
      <p className="-mt-2 text-xs text-muted-foreground">
        Assignments always start on a Monday — the date snaps automatically. Runs{" "}
        {weekStartDate} through {weekEndDate}.
      </p>
      <p className="-mt-2 text-xs">
        {isScheduled ? (
          <span className="text-muted-foreground">
            ● Scheduled — becomes visible to the student on {weekStartDate}
          </span>
        ) : (
          <span className="text-accent">● Visible to the student now</span>
        )}
      </p>

      <Field>
        <FieldLabel htmlFor={`${uid}-instructions`}>Instructions (student-facing)</FieldLabel>
        <Textarea
          id={`${uid}-instructions`}
          name="instructions"
          defaultValue={weeklyPractice?.instructions ?? ""}
        />
      </Field>

      <Field orientation="responsive">
        <FieldLabel htmlFor={`${uid}-goals`}>Target (optional, student-facing)</FieldLabel>
        <Input id={`${uid}-goals`} name="goals" defaultValue={weeklyPractice?.goals ?? ""} />
      </Field>

      <Field orientation="horizontal">
        <input
          id={`${uid}-recordingRequired`}
          type="checkbox"
          checked={recordingRequired}
          onChange={(e) => setRecordingRequired(e.target.checked)}
          className="size-4 rounded border-input"
        />
        <FieldLabel htmlFor={`${uid}-recordingRequired`} className="font-normal">
          Recording required
        </FieldLabel>
      </Field>

      {weeklyPractice && (
        <Field orientation="responsive">
          <FieldLabel htmlFor={`${uid}-status`}>Status</FieldLabel>
          {statusIsAdminEditable ? (
            <Select value={status} onValueChange={(value) => setStatus(value as string)}>
              <SelectTrigger id={`${uid}-status`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKLY_PRACTICE_ADMIN_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">
              {status} — managed automatically once the student submits; not editable here.
            </p>
          )}
        </Field>
      )}

      <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
        <p className="text-sm font-medium">Internal — never shown to the student</p>
        <Field orientation="responsive">
          <FieldLabel htmlFor={`${uid}-internalCurriculumRef`}>
            Internal curriculum reference (optional)
          </FieldLabel>
          <Input
            id={`${uid}-internalCurriculumRef`}
            name="internalCurriculumRef"
            defaultValue={weeklyPractice?.internalCurriculumRef ?? ""}
          />
        </Field>
        <Field orientation="responsive">
          <FieldLabel htmlFor={`${uid}-currentTechnique`}>
            Current technique reference (optional)
          </FieldLabel>
          <Input
            id={`${uid}-currentTechnique`}
            name="currentTechnique"
            defaultValue={weeklyPractice?.currentTechnique ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${uid}-teacherNotes`}>
            Private teaching rationale (optional)
          </FieldLabel>
          <Textarea
            id={`${uid}-teacherNotes`}
            name="teacherNotes"
            defaultValue={weeklyPractice?.teacherNotes ?? ""}
          />
        </Field>
      </div>

      <FieldError>{error}</FieldError>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : weeklyPractice ? "Save changes" : "Create assignment"}
        </Button>
        {weeklyPractice && onDone && (
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
