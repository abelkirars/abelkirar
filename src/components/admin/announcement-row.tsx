"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Announcement } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnnouncementForm } from "@/components/admin/announcement-form";

export function AnnouncementRow({ announcement }: { announcement: Announcement }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function togglePublish() {
    setBusy("toggle");
    setError(null);
    const formData = new FormData();
    formData.set("published", String(!announcement.published));
    try {
      const res = await fetch(`/api/admin/announcements/${announcement.id}`, {
        method: "PATCH",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${announcement.title}"? This cannot be undone.`)) return;
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/admin/announcements/${announcement.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to delete");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-border p-4">
        <AnnouncementForm announcement={announcement} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{announcement.title}</h3>
          <Badge variant={announcement.published ? "default" : "outline"}>
            {announcement.published ? "Published" : "Draft"}
          </Badge>
        </div>
        {announcement.eventDate && (
          <p className="mt-1 text-xs text-muted-foreground">
            {announcement.eventDate.toLocaleDateString()}
          </p>
        )}
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {announcement.description}
        </p>
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={togglePublish}>
          {announcement.published ? "Unpublish" : "Publish"}
        </Button>
        <Button size="sm" variant="destructive" disabled={busy !== null} onClick={remove}>
          Delete
        </Button>
      </div>
    </div>
  );
}
