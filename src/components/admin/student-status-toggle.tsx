"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function StudentStatusToggle({
  studentId,
  status,
}: {
  studentId: string;
  status: "ACTIVE" | "INACTIVE";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (
      status === "ACTIVE" &&
      !window.confirm(
        "Deactivate this student? They will immediately lose access to their dashboard."
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("status", status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
    try {
      const res = await fetch(`/api/admin/students/${studentId}`, {
        method: "PATCH",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update");
        return;
      }
      router.refresh();
    } catch (err) {
      console.error("[StudentStatusToggle] request failed:", err);
      setError("Failed to update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Button size="sm" variant="outline" disabled={busy} onClick={toggle}>
        {status === "ACTIVE" ? "Deactivate" : "Activate"}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
