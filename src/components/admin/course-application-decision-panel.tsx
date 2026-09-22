"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Decision = "APPROVE" | "WAITLIST" | "DECLINE";

interface PlanOption {
  id: string;
  code: string;
  level: string;
  format: string;
  monthlyPriceCents: number;
  currency: string;
  groupMinimumStudents: number | null;
  groupMaximumStudents: number | null;
}

export function CourseApplicationDecisionPanel({
  applicationId,
  status,
  requestedPlanId,
  plans,
}: {
  applicationId: string;
  status: string;
  requestedPlanId: string | null;
  plans: PlanOption[];
}) {
  const router = useRouter();
  const [coursePlanId, setCoursePlanId] = useState(requestedPlanId ?? "");
  const [decisionReason, setDecisionReason] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [loading, setLoading] = useState<Decision | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canDecide = status === "PENDING" || status === "WAITLISTED";

  async function submit(decision: Decision) {
    if (decision === "APPROVE" && !coursePlanId) {
      setError("Select a course plan before approval.");
      return;
    }
    if (decision === "DECLINE" && !decisionReason.trim()) {
      setError("Enter an applicant-visible reason before declining.");
      return;
    }

    const label =
      decision === "APPROVE" ? "approve" : decision === "WAITLIST" ? "waitlist" : "decline";
    if (!window.confirm(`Confirm you want to ${label} this application? An email will be sent.`)) {
      return;
    }

    setLoading(decision);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/course-applications/${applicationId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          ...(decision === "APPROVE" ? { coursePlanId } : {}),
          ...(decisionReason.trim() ? { decisionReason: decisionReason.trim() } : {}),
          ...(adminNotes.trim() ? { adminNotes: adminNotes.trim() } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "The application could not be updated.");
        return;
      }

      setMessage(
        body.notification?.sent
          ? `Application updated to ${body.status}. Email sent.`
          : `Application updated to ${body.status}, but the email was not sent. Check server logs before contacting the applicant.`
      );
      router.refresh();
    } catch {
      setError("The request failed. Refresh before trying again to confirm the current status.");
    } finally {
      setLoading(null);
    }
  }

  if (!canDecide) {
    return (
      <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        This application has a terminal decision. Phase 2B does not reopen or provision it.
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="font-heading text-xl font-semibold">Decision</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Approval records an application decision only. It does not enroll the student, create a
          payment, or enable portal access.
        </p>
      </div>

      <label className="block text-sm font-medium">
        Course plan required for approval
        <select
          value={coursePlanId}
          onChange={(event) => setCoursePlanId(event.target.value)}
          className="mt-2 min-h-12 w-full rounded-lg border border-input bg-background px-3"
        >
          <option value="">Select an active plan</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.level} · {plan.format === "ONE_TO_ONE" ? "1-to-1" : "Group"} · {plan.currency}{" "}
              {(plan.monthlyPriceCents / 100).toFixed(2)}/month
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium">
        Applicant-visible reason {status === "PENDING" ? "(required to decline)" : ""}
        <textarea
          value={decisionReason}
          onChange={(event) => setDecisionReason(event.target.value)}
          maxLength={2000}
          rows={3}
          className="mt-2 w-full rounded-lg border border-input bg-background p-3"
        />
      </label>

      <label className="block text-sm font-medium">
        Private admin note
        <textarea
          value={adminNotes}
          onChange={(event) => setAdminNotes(event.target.value)}
          maxLength={5000}
          rows={3}
          className="mt-2 w-full rounded-lg border border-input bg-background p-3"
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <Button disabled={loading !== null} onClick={() => submit("APPROVE")}>
          {loading === "APPROVE" ? "Approving…" : "Approve application"}
        </Button>
        {status === "PENDING" && (
          <Button
            variant="outline"
            disabled={loading !== null}
            onClick={() => submit("WAITLIST")}
          >
            {loading === "WAITLIST" ? "Updating…" : "Move to waitlist"}
          </Button>
        )}
        <Button
          variant="destructive"
          disabled={loading !== null}
          onClick={() => submit("DECLINE")}
        >
          {loading === "DECLINE" ? "Declining…" : "Decline application"}
        </Button>
      </div>

      {message && (
        <p role="status" className="text-sm text-primary">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
