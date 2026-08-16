"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";

const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  ACHIEVED: "Achieved",
};

export function StudentMilestoneRow({
  studentId,
  studentMilestone,
}: {
  studentId: string;
  studentMilestone: {
    id: string;
    status: string;
    achievedAt: Date | null;
    teacherComment: string | null;
    milestone: { label: string; description: string | null };
  };
}) {
  const router = useRouter();
  const uid = useId();
  const [approving, setApproving] = useState(false);
  const [teacherComment, setTeacherComment] = useState(studentMilestone.teacherComment ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const achieved = studentMilestone.status === "ACHIEVED";

  async function approve(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set("teacherComment", teacherComment);

    try {
      const res = await fetch(
        `/api/admin/students/${studentId}/milestones/${studentMilestone.id}`,
        { method: "PATCH", body: formData }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.refresh();
      setApproving(false);
    } catch (err) {
      console.error("[StudentMilestoneRow] approve failed:", err);
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{studentMilestone.milestone.label}</h3>
            <Badge variant={achieved ? "default" : "outline"}>
              {STATUS_LABELS[studentMilestone.status] ?? studentMilestone.status}
            </Badge>
          </div>
          {studentMilestone.milestone.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {studentMilestone.milestone.description}
            </p>
          )}
          {achieved && studentMilestone.achievedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Achieved {studentMilestone.achievedAt.toLocaleDateString()}
            </p>
          )}
          {studentMilestone.teacherComment && (
            <p className="mt-1 text-sm text-foreground">{studentMilestone.teacherComment}</p>
          )}
        </div>
        {!achieved && !approving && (
          <Button size="sm" variant="outline" onClick={() => setApproving(true)}>
            Approve
          </Button>
        )}
      </div>

      {approving && (
        <form onSubmit={approve} className="mt-4 space-y-3 border-t border-border/60 pt-3">
          <Field>
            <FieldLabel htmlFor={`${uid}-teacherComment`}>
              Comment shown to the student (optional)
            </FieldLabel>
            <Textarea
              id={`${uid}-teacherComment`}
              value={teacherComment}
              onChange={(e) => setTeacherComment(e.target.value)}
            />
          </Field>
          <FieldError>{error}</FieldError>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Approving…" : "Mark achieved"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setApproving(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
