"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface NoteItem {
  id: string;
  body: string;
  createdAt: string;
  admin: { displayName: string };
}

export function OrderNotes({
  orderNumber,
  notes,
}: {
  orderNumber: string;
  notes: NoteItem[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add note");
        return;
      }
      setBody("");
      router.refresh();
    } catch {
      setError("Failed to add note");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {notes.map((note) => (
          <li key={note.id} className="rounded-md bg-muted/50 p-3 text-sm">
            <p>{note.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {note.admin.displayName} — {new Date(note.createdAt).toLocaleString()}
            </p>
          </li>
        ))}
        {notes.length === 0 && (
          <li className="text-sm text-muted-foreground">No internal notes yet.</li>
        )}
      </ul>

      <form onSubmit={handleSubmit} className="space-y-2">
        <Textarea
          placeholder="Add an internal note…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="sm" disabled={loading || !body.trim()}>
          {loading ? "Adding…" : "Add note"}
        </Button>
      </form>
    </div>
  );
}
