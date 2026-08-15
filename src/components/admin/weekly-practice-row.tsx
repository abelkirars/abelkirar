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

// Only what the player needs — never storagePath. See the query comment in
// students/[studentId]/page.tsx for why this is select-restricted even
// though the rest of that page's admin queries aren't.
type WeeklyPracticeWithRecording = WeeklyPractice & {
  attachments: { id: string; mimeType: string }[];
};

export function WeeklyPracticeRow({
  studentId,
  weeklyPractice,
}: {
  studentId: string;
  weeklyPractice: WeeklyPracticeWithRecording;
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
        {/* attachments[0] carries only id + mimeType (see the query comment
            in students/[studentId]/page.tsx) — no storagePath ever reaches
            this client component. The signed URL is minted on demand by the
            existing admin route when the browser requests this src; nothing
            is embedded here. Same sizing rule as the student player: dual
            max-width/max-height with auto width/height lets the browser
            satisfy both constraints while preserving whatever aspect ratio
            the recording actually has — no orientation detection needed. */}
        {weeklyPractice.attachments[0] && (
          <div className="mt-2">
            <p className="text-xs font-medium text-muted-foreground">Student recording</p>
            {weeklyPractice.attachments[0].mimeType.startsWith("video/") ? (
              <div className="mt-1 w-fit max-w-full">
                <video
                  controls
                  src={`/api/admin/students/${studentId}/weekly-practice/${weeklyPractice.id}/recordings/${weeklyPractice.attachments[0].id}`}
                  className="h-auto w-auto max-w-xl max-h-[500px] rounded-md object-contain"
                />
              </div>
            ) : (
              <audio
                controls
                src={`/api/admin/students/${studentId}/weekly-practice/${weeklyPractice.id}/recordings/${weeklyPractice.attachments[0].id}`}
                className="mt-1 w-full"
              />
            )}
          </div>
        )}
      </div>
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
        Edit
      </Button>
    </div>
  );
}
