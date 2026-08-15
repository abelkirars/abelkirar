"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { StudentNote } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export function StudentNoteForm({
  studentId,
  note,
  onDone,
}: {
  studentId: string;
  note?: StudentNote;
  onDone?: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const [body, setBody] = useState(note?.body ?? "");
  const [visibleToStudent, setVisibleToStudent] = useState(note?.visibleToStudent ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set("body", body);
    formData.set("visibleToStudent", String(visibleToStudent));

    try {
      const res = await fetch(
        note
          ? `/api/admin/students/${studentId}/notes/${note.id}`
          : `/api/admin/students/${studentId}/notes`,
        { method: note ? "PATCH" : "POST", body: formData }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.refresh();
      if (!note) {
        setBody("");
        setVisibleToStudent(true);
      }
      onDone?.();
    } catch (err) {
      console.error("[StudentNoteForm] submit failed:", err);
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field>
        <FieldLabel htmlFor={`${uid}-body`}>Note</FieldLabel>
        <Textarea
          id={`${uid}-body`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
        />
      </Field>

      {/* Deliberately two large, labeled, colored buttons — not a checkbox.
          The visibility state must be unmistakable, not a subtle toggle
          someone could set without noticing. */}
      <Field>
        <FieldLabel>Visibility</FieldLabel>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setVisibleToStudent(true)}
            aria-pressed={visibleToStudent}
            className={cn(
              "flex-1 rounded-lg border-2 px-3 py-2 text-left text-sm font-medium transition-colors",
              visibleToStudent
                ? "border-primary bg-primary/10 text-primary"
                : "border-input text-muted-foreground hover:border-ring"
            )}
          >
            👁 Visible to student
            <span className="block text-xs font-normal opacity-80">
              Shows up on the student dashboard
            </span>
          </button>
          <button
            type="button"
            onClick={() => setVisibleToStudent(false)}
            aria-pressed={!visibleToStudent}
            className={cn(
              "flex-1 rounded-lg border-2 px-3 py-2 text-left text-sm font-medium transition-colors",
              !visibleToStudent
                ? "border-destructive bg-destructive/10 text-destructive"
                : "border-input text-muted-foreground hover:border-ring"
            )}
          >
            🔒 Private — teacher only
            <span className="block text-xs font-normal opacity-80">
              Never shown to the student, by any path
            </span>
          </button>
        </div>
      </Field>

      <FieldError>{error}</FieldError>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : note ? "Save changes" : "Add note"}
        </Button>
        {note && onDone && (
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
