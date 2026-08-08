"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Available any time Order.quotedAt is set — not just after a failed send.
 * An admin may need this if a customer says they never received the quote
 * email, independent of whether the original send reported success.
 */
export function ResendQuoteEmailButton({ orderNumber }: { orderNumber: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ emailSent: boolean; emailError?: string } | null>(null);

  async function handleClick() {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/quote/resend`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to resend quote email");
        return;
      }
      setResult({ emailSent: data.emailSent, emailError: data.emailError });
    } catch {
      setError("Failed to resend quote email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Button size="sm" variant="outline" disabled={loading} onClick={handleClick}>
        {loading ? "Resending…" : "Resend quote email"}
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {result && (
        <p
          className={cn(
            "mt-2 text-sm font-medium",
            result.emailSent ? "text-accent" : "text-destructive"
          )}
        >
          {result.emailSent
            ? "Quote email resent to the customer."
            : `Resend failed: ${result.emailError ?? "unknown error"}.`}
        </p>
      )}
    </div>
  );
}
