"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PaymentConfirmationForm({ orderNumber }: { orderNumber: string }) {
  const [senderName, setSenderName] = useState("");
  const [amountSent, setAmountSent] = useState("");
  const [sentAt, setSentAt] = useState("");
  const [transactionReference, setTransactionReference] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("senderName", senderName);
      formData.set("amountSent", amountSent);
      formData.set("sentAt", new Date(sentAt).toISOString());
      if (transactionReference) formData.set("transactionReference", transactionReference);
      if (screenshot) formData.set("screenshot", screenshot);

      const res = await fetch(`/api/orders/${orderNumber}/confirm-payment`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <p className="rounded-lg bg-accent/10 p-4 text-sm text-foreground">
        Thanks — we&rsquo;ve received your payment details. Our team will
        manually verify your payment and update your order status. This is
        not automatic; a screenshot alone does not mark your order as paid.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Already sent payment? Let us know the details below so we can verify
        it faster. Submitting this does not automatically mark your order as
        paid — an administrator must confirm it manually.
      </p>
      <div>
        <Label htmlFor="senderName">Sender&rsquo;s name</Label>
        <Input
          id="senderName"
          className="mt-1"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="amountSent">Amount sent ($)</Label>
          <Input
            id="amountSent"
            type="number"
            step="0.01"
            min="0"
            className="mt-1"
            value={amountSent}
            onChange={(e) => setAmountSent(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="sentAt">Date &amp; time sent</Label>
          <Input
            id="sentAt"
            type="datetime-local"
            className="mt-1"
            value={sentAt}
            onChange={(e) => setSentAt(e.target.value)}
            required
          />
        </div>
      </div>
      <div>
        <Label htmlFor="transactionReference">Transaction reference (optional)</Label>
        <Input
          id="transactionReference"
          className="mt-1"
          value={transactionReference}
          onChange={(e) => setTransactionReference(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="screenshot">Payment screenshot or receipt PDF (optional)</Label>
        <input
          id="screenshot"
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium"
          onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Submitting…" : "Submit payment details"}
      </Button>
    </form>
  );
}
