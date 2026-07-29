"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function StudentEmailCorrection({
  studentId,
  canChange,
}: {
  studentId: string;
  canChange: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [successIsDegraded, setSuccessIsDegraded] = useState(false);

  if (!canChange) {
    return (
      <p className="text-xs text-muted-foreground">
        Email can no longer be changed here — this student has already activated their
        account.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setSuccessIsDegraded(false);
    const formData = new FormData();
    formData.set("email", newEmail);
    try {
      const res = await fetch(`/api/admin/students/${studentId}/email`, {
        method: "PATCH",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update email");
        return;
      }
      setSuccessIsDegraded(!data.emailSent);
      setSuccess(
        data.emailSent
          ? "Email updated — a fresh invite has been sent to the new address."
          : `Email updated, but the fresh invite could not be sent${data.emailError ? `: ${data.emailError}` : "."} Use "Resend invite" once this is resolved.`
      );
      setEditing(false);
      setNewEmail("");
      router.refresh();
    } catch (err) {
      console.error("[StudentEmailCorrection] request failed:", err);
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <div>
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Correct email
        </Button>
        {success && (
          <p
            className={`mt-1 text-xs ${successIsDegraded ? "text-amber-600 dark:text-amber-500" : "text-accent"}`}
          >
            {success}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        type="email"
        value={newEmail}
        onChange={(e) => setNewEmail(e.target.value)}
        placeholder="Corrected email address"
        required
        className="w-64"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
