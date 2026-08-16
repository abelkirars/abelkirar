"use client";

import { useState } from "react";
import type { Milestone } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MilestoneForm } from "@/components/admin/milestone-form";

export function MilestoneRow({ milestone }: { milestone: Milestone }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="rounded-lg border border-border p-4">
        <MilestoneForm milestone={milestone} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">{milestone.label}</h3>
          <Badge variant="outline">#{milestone.sortOrder}</Badge>
          {!milestone.active && <Badge variant="destructive">Inactive</Badge>}
        </div>
        {milestone.description && (
          <p className="mt-1 text-sm text-muted-foreground">{milestone.description}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Effective from {milestone.effectiveFrom.toLocaleDateString()}
        </p>
        {milestone.internalCriteria && (
          <p className="mt-2 rounded-md border border-border/60 bg-muted/20 p-2 text-xs text-muted-foreground">
            Internal — never shown to the student: {milestone.internalCriteria}
          </p>
        )}
      </div>
      <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
        Edit
      </Button>
    </div>
  );
}
