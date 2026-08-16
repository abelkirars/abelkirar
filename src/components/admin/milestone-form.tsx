"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { Milestone } from "@prisma/client";
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
import { MILESTONE_LEVELS } from "@/lib/validations/milestone";

const LEVEL_LABELS: Record<(typeof MILESTONE_LEVELS)[number], string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function MilestoneForm({
  milestone,
  onDone,
}: {
  milestone?: Milestone;
  onDone?: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const [level, setLevel] = useState<string>(milestone?.level ?? "BEGINNER");
  const [active, setActive] = useState(milestone?.active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("level", level);
    formData.set("active", String(active));

    try {
      const res = await fetch(
        milestone ? `/api/admin/milestones/${milestone.id}` : "/api/admin/milestones",
        { method: milestone ? "PATCH" : "POST", body: formData }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.refresh();
      if (!milestone) {
        form.reset();
        setLevel("BEGINNER");
        setActive(true);
      }
      onDone?.();
    } catch (err) {
      console.error("[MilestoneForm] submit failed:", err);
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field orientation="responsive">
        <FieldLabel htmlFor={`${uid}-level`}>Level</FieldLabel>
        <Select value={level} onValueChange={(value) => setLevel(value as string)}>
          <SelectTrigger id={`${uid}-level`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MILESTONE_LEVELS.map((l) => (
              <SelectItem key={l} value={l}>
                {LEVEL_LABELS[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field orientation="responsive">
        <FieldLabel htmlFor={`${uid}-label`}>Label (student-facing)</FieldLabel>
        <Input
          id={`${uid}-label`}
          name="label"
          defaultValue={milestone?.label ?? ""}
          required
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${uid}-description`}>Description (student-facing)</FieldLabel>
        <Textarea
          id={`${uid}-description`}
          name="description"
          defaultValue={milestone?.description ?? ""}
        />
      </Field>

      <Field orientation="responsive">
        <FieldLabel htmlFor={`${uid}-sortOrder`}>Sort order</FieldLabel>
        <Input
          id={`${uid}-sortOrder`}
          name="sortOrder"
          type="number"
          defaultValue={milestone?.sortOrder ?? 1}
          required
        />
      </Field>

      <Field orientation="responsive">
        <FieldLabel htmlFor={`${uid}-effectiveFrom`}>
          Effective from (optional — defaults to now)
        </FieldLabel>
        <Input
          id={`${uid}-effectiveFrom`}
          name="effectiveFrom"
          type="date"
          defaultValue={milestone ? toDateOnly(milestone.effectiveFrom) : ""}
        />
      </Field>
      <p className="-mt-2 text-xs text-muted-foreground">
        Controls whether this milestone joins an existing student&apos;s progress
        denominator. See the schema comment on Milestone.effectiveFrom for the full
        mechanism.
      </p>

      <Field orientation="horizontal">
        <input
          id={`${uid}-active`}
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="size-4 rounded border-input"
        />
        <FieldLabel htmlFor={`${uid}-active`} className="font-normal">
          Active
        </FieldLabel>
      </Field>

      <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
        <p className="text-sm font-medium">Internal — never shown to the student</p>
        <Field>
          <FieldLabel htmlFor={`${uid}-internalCriteria`}>
            Internal pass criteria (optional)
          </FieldLabel>
          <Textarea
            id={`${uid}-internalCriteria`}
            name="internalCriteria"
            defaultValue={milestone?.internalCriteria ?? ""}
          />
        </Field>
      </div>

      <FieldError>{error}</FieldError>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : milestone ? "Save changes" : "Create milestone"}
        </Button>
        {milestone && onDone && (
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
