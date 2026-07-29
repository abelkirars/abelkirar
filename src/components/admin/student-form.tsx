"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StudentProfile } from "@prisma/client";
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
import { STUDENT_LEVELS } from "@/lib/validations/student";
import { locales, type Locale } from "@/i18n/locale";

const LEVEL_LABELS: Record<(typeof STUDENT_LEVELS)[number], string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

// Plain English labels here, same as everything else in this form — the
// language being SELECTED (for the student's own emails) is unrelated to
// what language this admin UI itself is rendered in (always English).
const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  am: "Amharic",
};

function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function StudentForm({
  student,
  onDone,
}: {
  student?: StudentProfile;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [level, setLevel] = useState<string>(student?.level ?? "");
  const [status, setStatus] = useState<string>(student?.status ?? "ACTIVE");
  const [locale, setLocale] = useState<string>(student?.locale ?? "en");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [successIsDegraded, setSuccessIsDegraded] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setSuccessIsDegraded(false);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("level", level);
    formData.set("status", status);
    formData.set("locale", locale);

    try {
      const res = await fetch(
        student ? `/api/admin/students/${student.id}` : "/api/admin/students",
        { method: student ? "PATCH" : "POST", body: formData }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.refresh();
      if (!student) {
        form.reset();
        setLevel("");
        setStatus("ACTIVE");
        setLocale("en");
        if (data.emailSent) {
          setSuccessIsDegraded(false);
          setSuccess("Student added — an invite email has been sent.");
        } else {
          setSuccessIsDegraded(true);
          setSuccess(
            `Student created, but the invite email could not be sent${data.emailError ? `: ${data.emailError}` : "."} Use "Resend invite" from the student's profile once this is resolved.`
          );
        }
      }
      onDone?.();
    } catch (err) {
      console.error("[StudentForm] submit failed:", err);
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field orientation="responsive">
        <FieldLabel htmlFor="fullName">Full name</FieldLabel>
        <Input id="fullName" name="fullName" defaultValue={student?.fullName} required />
      </Field>

      <Field orientation="responsive">
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={student?.email}
          required
          disabled={!!student}
        />
        {student && (
          <p className="text-xs text-muted-foreground">
            Email can&apos;t be changed here — it&apos;s linked to the student&apos;s login.
          </p>
        )}
      </Field>

      <Field orientation="responsive">
        <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
        <Input id="phone" name="phone" type="tel" defaultValue={student?.phone ?? ""} />
      </Field>

      <Field orientation="responsive">
        <FieldLabel htmlFor="level">Level (optional)</FieldLabel>
        <Select value={level} onValueChange={(value) => setLevel(value as string)}>
          <SelectTrigger id="level" className="w-full">
            <SelectValue placeholder="No level set" />
          </SelectTrigger>
          <SelectContent>
            {STUDENT_LEVELS.map((lvl) => (
              <SelectItem key={lvl} value={lvl}>
                {LEVEL_LABELS[lvl]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field orientation="responsive">
        <FieldLabel htmlFor="enrollmentDate">Enrollment date</FieldLabel>
        <Input
          id="enrollmentDate"
          name="enrollmentDate"
          type="date"
          defaultValue={toDateInputValue(student?.enrollmentDate)}
          required
        />
      </Field>

      <Field orientation="responsive">
        <FieldLabel htmlFor="status">Status</FieldLabel>
        <Select value={status} onValueChange={(value) => setStatus(value as string)}>
          <SelectTrigger id="status" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="INACTIVE">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field orientation="responsive">
        <FieldLabel htmlFor="locale">Invite email language</FieldLabel>
        <Select value={locale} onValueChange={(value) => setLocale(value as string)}>
          <SelectTrigger id="locale" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {locales.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {LOCALE_LABELS[loc]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field>
        <FieldLabel htmlFor="notes">Notes (optional)</FieldLabel>
        <Textarea id="notes" name="notes" defaultValue={student?.notes ?? ""} />
      </Field>

      <FieldError>{error}</FieldError>
      {success && (
        <p
          className={`text-sm ${successIsDegraded ? "text-amber-600 dark:text-amber-500" : "text-accent"}`}
        >
          {success}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : student ? "Save changes" : "Add student"}
        </Button>
        {student && onDone && (
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
