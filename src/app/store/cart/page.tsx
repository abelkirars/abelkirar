"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useCartStore, cartTotalPrice } from "@/store/cart-store";
import { Container } from "@/components/marketing/container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type PaymentRegion = "US" | "EUROZONE";
type UsPaymentMethod = "ZELLE" | "CASH_APP";

export default function CartPage() {
  const { items, removeItem, setQuantity } = useCartStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentRegion, setPaymentRegion] = useState<PaymentRegion>("US");
  const [usPaymentMethod, setUsPaymentMethod] = useState<UsPaymentMethod>("ZELLE");
  const router = useRouter();

  // Eurozone has exactly one method today, so it's implied by region rather
  // than user-selectable — this is the value actually submitted.
  const paymentMethod = paymentRegion === "US" ? usPaymentMethod : "EUR_BANK_TRANSFER";

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const total = cartTotalPrice(items);

  async function handleSubmitOrder() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            customization: i.customization,
            quantity: i.quantity,
          })),
          paymentRegion,
          paymentMethod,
          customerName,
          customerEmail,
          customerPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push(`/store/order/${data.orderNumber}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <section className="py-24">
        <Container className="text-center">
          <h1 className="font-heading text-3xl font-semibold">Your cart is empty</h1>
          <p className="mt-3 text-muted-foreground">
            Browse handmade Kirar, Begena, and Masenqo instruments.
          </p>
          <Button className="mt-6" nativeButton={false} render={<Link href="/store" />}>
            Visit the store
          </Button>
        </Container>
      </section>
    );
  }

  return (
    <section className="py-16 sm:py-20">
      <Container className="grid gap-12 lg:grid-cols-[1fr_400px]">
        <div>
          <h1 className="font-heading text-3xl font-semibold">Your cart</h1>
          <ul className="mt-8 divide-y divide-border">
            {items.map((item) => (
              <li key={item.lineId} className="flex gap-4 py-6">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.name}</p>
                  {item.customizationSummary && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.customizationSummary}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-3">
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={item.quantity}
                      onChange={(e) =>
                        setQuantity(item.lineId, Math.max(1, Number(e.target.value) || 1))
                      }
                      className="w-16"
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(item.lineId)}
                      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                      Remove
                    </button>
                  </div>
                </div>
                <p className="font-medium">
                  ${((item.unitPrice * item.quantity) / 100).toFixed(0)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="h-fit space-y-6 rounded-2xl bg-card p-8 ring-1 ring-foreground/10">
          <div className="flex items-center justify-between text-lg font-medium">
            <span>Total</span>
            <span>${(total / 100).toFixed(0)}</span>
          </div>

          <div className="space-y-3 border-t border-border pt-6">
            <Label>Contact details</Label>
            <Input
              placeholder="Full name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <Input
              type="email"
              placeholder="Email address"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
            <Input
              type="tel"
              placeholder="Phone number"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>

          <div className="space-y-3 border-t border-border pt-6">
            <Label>Payment region</Label>
            <div className="flex gap-2">
              {(["US", "EUROZONE"] as const).map((region) => (
                <button
                  key={region}
                  type="button"
                  onClick={() => setPaymentRegion(region)}
                  className={cn(
                    "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                    paymentRegion === region
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  )}
                >
                  {region === "US" ? "United States — USD" : "Eurozone — EUR"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-6">
            <Label>Payment method</Label>
            {paymentRegion === "US" ? (
              <>
                <p className="text-xs text-muted-foreground">
                  We currently accept Zelle and Cash App. Payments are
                  verified manually by our team — your order won&rsquo;t be
                  processed until we&rsquo;ve confirmed your payment.
                </p>
                <div className="flex gap-2">
                  {(["ZELLE", "CASH_APP"] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setUsPaymentMethod(method)}
                      className={cn(
                        "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                        usPaymentMethod === method
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      {method === "ZELLE" ? "Zelle" : "Cash App"}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-foreground">
                  Euro Bank Transfer
                </div>
                <p className="text-xs text-muted-foreground">
                  EUR payment details will be provided after the order is
                  placed.
                </p>
              </>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            size="lg"
            className="w-full"
            onClick={handleSubmitOrder}
            disabled={loading || !customerName || !customerEmail || !customerPhone}
          >
            {loading ? "Placing order…" : "Place order"}
          </Button>
        </div>
      </Container>
    </section>
  );
}
