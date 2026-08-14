"use client";

import { useState } from "react";
import type { WeeklyPractice } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WeeklyPracticeForm } from "@/components/admin/weekly-practice-form";

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  REVIEWED: "Reviewed",
  COMPLETED: "Completed",
  MISSED: "Missed",
};

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function WeeklyPracticeRow({
  studentId,
  weeklyPractice,
}: {
  studentId: string;
  weeklyPractice: WeeklyPractice;
}) {
  const [editing, setEditing] = useState(false);

  const isScheduled = weeklyPractice.weekStartDate > new Date();

  if (editing) {
    return (
      <div className="rounded-lg border border-border p-4">
        <WeeklyPracticeForm
          studentId={studentId}
          weeklyPractice={weeklyPractice}
          onDone={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">{weeklyPractice.weekTitle}</h3>
          <Badge variant="outline">{STATUS_LABELS[weeklyPractice.status]}</Badge>
          {isScheduled && (
            <Badge variant="outline" className="text-muted-foreground">
              Scheduled
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {toDateOnly(weeklyPractice.weekStartDate)} – {toDateOnly(weeklyPractice.weekEndDate)}
        </p>
        {weeklyPractice.instructions && (
          <p className="mt-1 text-sm text-muted-foreground">{weeklyPractice.instructions}</p>
        )}
      </div>
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
        Edit
      </Button>
    </div>
  );
}
