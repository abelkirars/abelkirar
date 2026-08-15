"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

// Zero props, deliberately — see the architecture note in
// src/app/student/dashboard/page.tsx. This component never receives
// assignment content, only renders an empty input and POSTs on submit.
// Whether it's even mounted (assignment exists, not already submitted,
// recording not required) is decided by the server component around it.
export function AssignmentSubmitForm() {
  const t = useTranslations("studentDashboard");
  const router = useRouter();
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/student/submit-assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentSubmission: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("submitGenericError"));
        return;
      }
      setValue("");
      router.refresh();
    } catch (err) {
      console.error("[AssignmentSubmitForm] submit failed:", err);
      setError(t("submitGenericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t("submissionPlaceholder")}
        required
      />
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={submitting}>
        {submitting ? t("submitAssignmentSubmitting") : t("submitAssignment")}
      </Button>
    </form>
  );
}
