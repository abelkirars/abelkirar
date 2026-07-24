"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCartStore, cartTotalPrice, cartTotalItems } from "@/store/cart-store";
import { Container } from "@/components/marketing/container";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type PaymentRegion = "US" | "EUROZONE";
type UsPaymentMethod = "ZELLE" | "CASH_APP";

export default function CartPage() {
  const t = useTranslations("cart");
  const { items, removeItem, setQuantity, toggleSelected, setAllSelected } = useCartStore();
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

  const selectedItems = items.filter((i) => i.selected);
  const allSelected = items.length > 0 && items.every((i) => i.selected);
  const someSelected = items.some((i) => i.selected);
  const selectAllIndeterminate = someSelected && !allSelected;

  const total = cartTotalPrice(selectedItems);
  const selectedItemCount = cartTotalItems(selectedItems);

  async function handleSubmitOrder() {
    if (selectedItems.length === 0) {
      setError(t("noItemsSelected"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedItems.map((i) => ({
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
        setError(data.error ?? t("genericError"));
        return;
      }
      // Only the items that were actually submitted leave the cart —
      // anything the customer left unselected stays behind.
      for (const item of selectedItems) {
        removeItem(item.lineId);
      }
      router.push(`/store/order/${data.orderNumber}`);
    } catch {
      setError(t("genericError"));
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <section className="py-24">
        <Container className="text-center">
          <h1 className="font-heading text-3xl font-semibold">{t("empty")}</h1>
          <p className="mt-3 text-muted-foreground">{t("emptyDescription")}</p>
          <Button className="mt-6" nativeButton={false} render={<Link href="/store" />}>
            {t("visitStore")}
          </Button>
        </Container>
      </section>
    );
  }

  return (
    <section className="py-16 sm:py-20">
      <Container className="grid gap-12 lg:grid-cols-[1fr_400px]">
        <div>
          <h1 className="font-heading text-3xl font-semibold">{t("title")}</h1>

          <label className="mt-8 flex w-fit items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={allSelected}
              indeterminate={selectAllIndeterminate}
              onCheckedChange={() => setAllSelected(!allSelected)}
              aria-label={t("selectAll")}
            />
            {t("selectAll")}
          </label>

          <ul className="mt-4 divide-y divide-border">
            {items.map((item) => (
              <li key={item.lineId} className="flex gap-4 py-6">
                <Checkbox
                  checked={item.selected}
                  onCheckedChange={() => toggleSelected(item.lineId)}
                  aria-label={t("selectItem", { name: item.name })}
                  className="mt-1 shrink-0"
                />
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
                      {t("remove")}
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
          <div>
            <p className="text-sm text-muted-foreground">
              {t("itemsSelected", { count: selectedItemCount, total: cartTotalItems(items) })}
            </p>
            <div className="mt-1 flex items-center justify-between text-lg font-medium">
              <span>{t("total")}</span>
              <span>${(total / 100).toFixed(0)}</span>
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-6">
            <Label>{t("contactDetails")}</Label>
            <Input
              placeholder={t("fullName")}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <Input
              type="email"
              placeholder={t("emailAddress")}
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
            <Input
              type="tel"
              placeholder={t("phoneNumber")}
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>

          <div className="space-y-3 border-t border-border pt-6">
            <Label>{t("paymentRegion")}</Label>
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
                  {region === "US" ? t("usRegion") : t("eurozoneRegion")}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-6">
            <Label>{t("paymentMethod")}</Label>
            {paymentRegion === "US" ? (
              <>
                <p className="text-xs text-muted-foreground">{t("usMethodNotice")}</p>
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
                      {method === "ZELLE" ? t("zelle") : t("cashApp")}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="rounded-md border border-primary bg-primary/10 px-3 py-2 text-sm font-medium text-foreground">
                  {t("eurBankTransfer")}
                </div>
                <p className="text-xs text-muted-foreground">{t("eurNotice")}</p>
              </>
            )}
          </div>

          {selectedItems.length === 0 && (
            <p className="text-sm text-destructive">{t("noItemsSelected")}</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            size="lg"
            className="w-full"
            onClick={handleSubmitOrder}
            disabled={
              loading ||
              selectedItems.length === 0 ||
              !customerName ||
              !customerEmail ||
              !customerPhone
            }
          >
            {loading ? t("placingOrder") : t("placeOrder")}
          </Button>
        </div>
      </Container>
    </section>
  );
}
