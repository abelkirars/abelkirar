"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function OrderActions({
  orderNumber,
  paymentStatus,
  orderStatus,
}: {
  orderNumber: string;
  paymentStatus: string;
  orderStatus: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: string, confirmMessage?: string) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setError(null);
    setLoading(action);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/${action}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Action failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Action failed");
    } finally {
      setLoading(null);
    }
  }

  const alreadyPaid = paymentStatus === "PAID";
  const cancelled = orderStatus === "CANCELLED";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={alreadyPaid || cancelled || loading !== null}
          onClick={() =>
            runAction(
              "mark-paid",
              "Confirm you have manually verified this payment in Zelle/Cash App. This will mark the order as paid and notify the customer."
            )
          }
        >
          {loading === "mark-paid" ? "Marking paid…" : "Mark as paid"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={alreadyPaid || cancelled || loading !== null}
          onClick={() => runAction("mark-not-found")}
        >
          {loading === "mark-not-found" ? "Updating…" : "Mark payment not found"}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={cancelled || loading !== null}
          onClick={() => runAction("cancel", "Cancel this order? This cannot be undone.")}
        >
          {loading === "cancel" ? "Cancelling…" : "Cancel order"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
