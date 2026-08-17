"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

// Hard delete, overriding the 2026-08-15 decision against it — see
// docs/DECISIONS.md's correction entry. The guardrail lives here, in the
// UI: the confirm button stays disabled until the typed text is an EXACT
// match for the student's full name, not a checkbox and not a plain
// window.confirm() — both of those can be cleared by one reflexive click.
// This cannot. The route itself (DELETE /api/admin/students/[studentId])
// enforces nothing about how it was called; this is friction, not
// authorization — requireAdminApi() on the route is the real boundary.
export function StudentDeleteButton({
  studentId,
  fullName,
}: {
  studentId: string;
  fullName: string;
}) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = typedName === fullName;

  async function handleDelete() {
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/students/${studentId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        // Includes the "data deleted, auth account stuck" partial-failure
        // message verbatim — that text names a real, unfinished cleanup
        // step the admin needs to see, not a generic failure.
        setError(data.error ?? "Failed to delete student");
        return;
      }
      // The profile page this button lives on no longer exists.
      router.push("/admin/students");
      router.refresh();
    } catch (err) {
      console.error("[StudentDeleteButton] request failed:", err);
      setError("Failed to delete student");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTypedName("");
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="destructive" />}>
        Delete student
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {fullName}?</DialogTitle>
          <DialogDescription>
            This permanently deletes {fullName}&apos;s account: every assignment, submission,
            recording, practice log entry, note, and milestone record — and removes their login so
            the email becomes free to reuse. <strong>This cannot be undone.</strong>
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor={`${uid}-confirm-name`}>
            Type <strong>{fullName}</strong> to confirm
          </FieldLabel>
          <Input
            id={`${uid}-confirm-name`}
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            autoComplete="off"
          />
        </Field>

        <FieldError>{error}</FieldError>

        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!canDelete || busy}
            onClick={handleDelete}
          >
            {busy ? "Deleting…" : "Permanently delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
