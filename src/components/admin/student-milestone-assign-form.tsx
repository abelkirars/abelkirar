"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function StudentMilestoneAssignForm({
  studentId,
  availableMilestones,
}: {
  studentId: string;
  availableMilestones: { id: string; label: string }[];
}) {
  const router = useRouter();
  const uid = useId();
  const [milestoneId, setMilestoneId] = useState(availableMilestones[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (availableMilestones.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No unassigned milestones at this student&apos;s level. Add more from the{" "}
        <a href="/admin/milestones" className="underline">
          Milestones
        </a>{" "}
        catalog.
      </p>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!milestoneId) return;
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set("milestoneId", milestoneId);

    try {
      const res = await fetch(`/api/admin/students/${studentId}/milestones`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.refresh();
    } catch (err) {
      console.error("[StudentMilestoneAssignForm] submit failed:", err);
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <Field orientation="responsive" className="min-w-64 flex-1">
        <FieldLabel htmlFor={`${uid}-milestoneId`}>Milestone</FieldLabel>
        <Select value={milestoneId} onValueChange={(value) => setMilestoneId(value as string)}>
          <SelectTrigger id={`${uid}-milestoneId`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableMilestones.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Assigning…" : "Assign"}
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}
