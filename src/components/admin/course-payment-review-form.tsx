"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function CoursePaymentReviewForm({ paymentId, submissionId, afterDeadline, kind }: { paymentId: string; submissionId: string; afterDeadline: boolean; kind: "INITIAL_ENROLLMENT" | "MONTHLY" }) {
  const router = useRouter();
  const [action, setAction] = useState<"VERIFY" | "REJECT">("VERIFY");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !confirmed || done) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/course-payments/${encodeURIComponent(paymentId)}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, submissionId, confirmation: true, ...(action === "REJECT" ? { reason } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || "Review failed. Reload and check the payment."); return; }
      setDone(true);
      setMessage(`Review saved. Payment: ${result.status}. The notification is queued for delivery.`);
      router.refresh();
    } catch { setMessage("Could not confirm the result. Reload before trying again."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-5">
    <h2 className="text-xl font-semibold">Review current proof</h2>
    <p className="text-sm">Check the actual Zelle/Cash App account activity and the full amount before verifying.</p>
    <fieldset disabled={busy || done} className="space-y-4">
      <legend className="sr-only">Review decision</legend>
      <div className="flex flex-wrap gap-4">{(["VERIFY", "REJECT"] as const).map(value => <label key={value} className="flex min-h-11 items-center gap-2">
        <input type="radio" name="review-action" checked={action === value} onChange={() => { setAction(value); setConfirmed(false); }} />
        {value === "VERIFY" ? "Verify payment" : "Reject proof"}
      </label>)}</div>
      {action === "REJECT" && <label className="block space-y-2"><span>Reason shared with payer (required)</span>
        <Textarea value={reason} onChange={e => setReason(e.target.value)} minLength={5} maxLength={1000} required />
      </label>}
      <p className="rounded-lg bg-muted p-3 text-sm">{action === "VERIFY"
        ? kind === "MONTHLY" ? "Verification records this monthly payment. Enrollment, portal access, and cohort seat remain unchanged." : "Verification activates this enrollment and its course access. The learner's login identity is unchanged."
        : kind === "MONTHLY" ? "Rejection keeps this as a financial issue. It never cancels the active enrollment, suspends access, or releases a cohort seat."
        : afterDeadline ? "The original deadline has passed. Rejection expires the payment, cancels the pending enrollment, and releases its group seat."
        : "Rejection keeps the payment unpaid. The payer may resubmit before the original deadline; it will not be extended. If the deadline passes before this action completes, the payment will expire."}</p>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} required className="mt-1" />
        {action === "VERIFY" ? kind === "MONTHLY" ? "I verified receipt of the full required monthly payment." : "I verified receipt of the full required payment and confirm activation." : "I confirm this rejection reason is accurate and suitable to share with the payer."}
      </label>
      <Button type="submit" disabled={!confirmed || busy || done || (action === "REJECT" && reason.trim().length < 5)} variant={action === "VERIFY" ? "secondary" : "destructive"}>
        {busy ? "Saving review…" : action === "VERIFY" ? "Confirm payment verification" : "Confirm rejection"}
      </Button>
    </fieldset>
    <p role="status" aria-live="polite" className="text-sm">{message}</p>
  </form>;
}
