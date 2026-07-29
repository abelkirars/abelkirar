"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const MESSAGE_CLASSES = {
  success: "text-accent",
  warning: "text-amber-600 dark:text-amber-500",
  error: "text-destructive",
} as const;

export function ResendInviteButton({ studentId }: { studentId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    type: keyof typeof MESSAGE_CLASSES;
    text: string;
  } | null>(null);

  async function resend() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/students/${studentId}/resend-invite`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "Failed to resend invite" });
        return;
      }
      if (!data.emailSent) {
        setMessage({
          type: "warning",
          text: `Invite link generated, but the email could not be sent${data.emailError ? `: ${data.emailError}` : "."}`,
        });
        return;
      }
      setMessage({ type: "success", text: "Invite email resent." });
    } catch (err) {
      console.error("[ResendInviteButton] request failed:", err);
      setMessage({ type: "error", text: "Failed to resend invite" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button size="sm" variant="outline" disabled={busy} onClick={resend}>
        {busy ? "Sending…" : "Resend invite"}
      </Button>
      {message && <p className={`mt-1 text-xs ${MESSAGE_CLASSES[message.type]}`}>{message.text}</p>}
    </div>
  );
}
