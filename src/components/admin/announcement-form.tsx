"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Announcement } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export function AnnouncementForm({
  announcement,
  onDone,
}: {
  announcement?: Announcement;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    // Checkboxes only appear in FormData when checked, so unchecking
    // "published" must still be sent explicitly as "false".
    const publishedInput = form.elements.namedItem("published") as HTMLInputElement;
    formData.set("published", String(publishedInput.checked));

    try {
      const res = await fetch(
        announcement ? `/api/admin/announcements/${announcement.id}` : "/api/admin/announcements",
        { method: announcement ? "PATCH" : "POST", body: formData }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.refresh();
      if (!announcement) form.reset();
      onDone?.();
    } catch (err) {
      console.error("[AnnouncementForm] submit failed:", err);
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field>
        <FieldLabel htmlFor="title">Title</FieldLabel>
        <Input id="title" name="title" defaultValue={announcement?.title} required />
      </Field>

      <Field>
        <FieldLabel htmlFor="description">Description</FieldLabel>
        <Textarea
          id="description"
          name="description"
          defaultValue={announcement?.description}
          required
        />
      </Field>

      <Field orientation="responsive">
        <FieldLabel htmlFor="eventDate">Event date (optional)</FieldLabel>
        <Input
          id="eventDate"
          name="eventDate"
          type="date"
          defaultValue={toDateInputValue(announcement?.eventDate ?? null)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="image">
          {announcement ? "Replace image (optional)" : "Image (optional)"}
        </FieldLabel>
        <Input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" />
      </Field>

      <Field orientation="horizontal">
        <input
          id="published"
          name="published"
          type="checkbox"
          defaultChecked={announcement?.published ?? true}
          className="size-4 rounded border-input"
        />
        <FieldLabel htmlFor="published" className="font-normal">
          Published (visible on the public Community page)
        </FieldLabel>
      </Field>

      <FieldError>{error}</FieldError>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : announcement ? "Save changes" : "Add announcement"}
        </Button>
        {announcement && onDone && (
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
