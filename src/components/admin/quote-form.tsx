"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function QuoteForm({
  orderNumber,
  paymentRegion,
  description,
}: {
  orderNumber: string;
  paymentRegion: "US" | "EUROZONE" | null;
  description: string | null;
}) {
  const router = useRouter();
  const isUS = paymentRegion === "US";
  const [total, setTotal] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"ZELLE" | "CASH_APP">("ZELLE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ emailSent: boolean; emailError?: string } | null>(null);

  async function handleSubmit() {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          total: Number(total),
          ...(isUS ? { paymentMethod } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to save quote");
        return;
      }
      setResult({ emailSent: data.emailSent, emailError: data.emailError });
      router.refresh();
    } catch {
      setError("Failed to save quote");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
      <h2 className="font-medium">Set quote</h2>

      {description && (
        <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm">
          <p className="font-medium text-muted-foreground">Customer&rsquo;s request</p>
          <p className="mt-1 whitespace-pre-wrap">{description}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="quoteTotal">Total ({isUS ? "USD" : "EUR"})</Label>
          <Input
            id="quoteTotal"
            type="number"
            min="0"
            step="0.01"
            className="mt-1 w-32"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </div>

        {isUS && (
          <div>
            <Label>Payment method</Label>
            <div className="mt-1 flex gap-2">
              {(["ZELLE", "CASH_APP"] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm transition-colors",
                    paymentMethod === method
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {method === "ZELLE" ? "Zelle" : "Cash App"}
                </button>
              ))}
            </div>
          </div>
        )}

        <Button disabled={loading || !total || Number(total) <= 0} onClick={handleSubmit}>
          {loading ? "Sending quote…" : "Send quote"}
        </Button>
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {result && (
        <p
          className={cn(
            "mt-3 text-sm font-medium",
            result.emailSent ? "text-accent" : "text-destructive"
          )}
        >
          {result.emailSent
            ? "Quote saved and emailed to the customer."
            : `Quote saved, but the email to the customer FAILED: ${result.emailError ?? "unknown error"}. Use "Resend quote email" once fixed, or contact them directly.`}
        </p>
      )}
    </div>
  );
}
