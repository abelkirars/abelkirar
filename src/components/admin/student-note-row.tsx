"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StudentNote } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StudentNoteForm } from "@/components/admin/student-note-form";

export function StudentNoteRow({
  studentId,
  note,
}: {
  studentId: string;
  note: StudentNote;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm("Delete this note? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/students/${studentId}/notes/${note.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to delete");
        return;
      }
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-border p-4">
        <StudentNoteForm studentId={studentId} note={note} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {note.createdAt.toLocaleDateString()}
          </span>
          {note.visibleToStudent ? (
            <Badge variant="secondary">👁 Visible to student</Badge>
          ) : (
            <Badge variant="destructive">🔒 Private — teacher only</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-foreground">{note.body}</p>
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button size="sm" variant="destructive" disabled={deleting} onClick={remove}>
          Delete
        </Button>
      </div>
    </div>
  );
}
