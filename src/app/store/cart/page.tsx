"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useCartStore, cartTotalPrice } from "@/store/cart-store";
import { Container } from "@/components/marketing/container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function CartPage() {
  const { items, removeItem, setQuantity } = useCartStore();
  const [loading, setLoading] = useState(false);
  const total = cartTotalPrice(items);

  async function handleCheckout() {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            customization: i.customization,
            quantity: i.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
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
      <Container className="grid gap-12 lg:grid-cols-[1fr_360px]">
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

        <div className="h-fit rounded-2xl bg-card p-8 ring-1 ring-foreground/10">
          <div className="flex items-center justify-between text-lg font-medium">
            <span>Total</span>
            <span>${(total / 100).toFixed(0)}</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Shipping and final address are collected at checkout.
          </p>
          <Button
            size="lg"
            className="mt-6 w-full"
            onClick={handleCheckout}
            disabled={loading}
          >
            {loading ? "Redirecting…" : "Checkout"}
          </Button>
        </div>
      </Container>
    </section>
  );
}
