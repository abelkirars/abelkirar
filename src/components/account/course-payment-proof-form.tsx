"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PaymentMethod = "ZELLE" | "CASH_APP";

export function CoursePaymentProofForm({
  paymentId,
  amount,
  availableMethods,
}: {
  paymentId: string;
  amount: string;
  availableMethods: Array<{ method: PaymentMethod; label: string }>;
}) {
  const router = useRouter();
  const t = useTranslations("coursePayment");
  const [method, setMethod] = useState<PaymentMethod>(availableMethods[0]?.method ?? "ZELLE");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      formData.set("method", method);
      const localSentAt = formData.get("sentAt");
      if (typeof localSentAt === "string" && localSentAt) {
        formData.set("sentAt", new Date(localSentAt).toISOString());
      }
      const response = await fetch(`/api/account/course-payments/${paymentId}/proof`, {
        method: "POST",
        body: formData,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body.error === "string" ? body.error : t("upload.genericError"));
        return;
      }
      setSuccess(true);
      router.refresh();
    } catch {
      setError(t("upload.genericError"));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div role="status" aria-live="polite" className="rounded-xl border border-secondary/25 bg-secondary/10 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-full bg-secondary p-1 text-secondary-foreground"><Check className="size-4" /></span>
          <div>
            <p className="font-semibold text-secondary">{t("upload.successTitle")}</p>
            <p className="mt-1 text-sm leading-6 text-foreground/75">{t("upload.successBody")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <fieldset>
        <legend className="text-sm font-medium">{t("upload.method")}</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {availableMethods.map((item) => {
            const selected = method === item.method;
            return (
              <label
                key={item.method}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-[background-color,border-color,color] duration-200 motion-reduce:transition-none ${selected ? "border-primary bg-secondary text-secondary-foreground shadow-sm" : "border-border bg-background text-foreground hover:border-primary/50"}`}
              >
                <span className="font-medium">{item.label}</span>
                <input
                  type="radio"
                  name="paymentMethod"
                  value={item.method}
                  checked={selected}
                  onChange={() => setMethod(item.method)}
                  className="sr-only"
                />
                {selected && <Check aria-hidden="true" className="size-5 text-primary" />}
                <span className="sr-only">{selected ? t("upload.selected") : ""}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="senderName">{t("upload.senderName")}</Label>
          <Input id="senderName" name="senderName" className="mt-1.5" maxLength={200} required />
        </div>
        <div>
          <Label htmlFor="amountSent">{t("upload.amountSent")}</Label>
          <Input id="amountSent" name="amountSent" type="number" min="0.01" step="0.01" defaultValue={amount} className="mt-1.5" required />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="sentAt">{t("upload.sentAt")}</Label>
          <Input id="sentAt" name="sentAt" type="datetime-local" className="mt-1.5" required />
        </div>
        <div>
          <Label htmlFor="transactionReference">{t("upload.referenceOptional")}</Label>
          <Input id="transactionReference" name="transactionReference" className="mt-1.5" maxLength={200} />
        </div>
      </div>
      <div>
        <Label htmlFor="proof">{t("upload.proof")}</Label>
        <input
          id="proof"
          name="proof"
          type="file"
          accept="image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf"
          required
          className="mt-1.5 block w-full rounded-lg border border-input bg-background text-sm text-muted-foreground file:mr-4 file:min-h-11 file:border-0 file:border-r file:border-border file:bg-muted file:px-4 file:font-medium file:text-foreground hover:file:bg-muted/80"
        />
        <p className="mt-2 text-xs text-muted-foreground">{t("upload.fileHelp")}</p>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </div>
      <Button type="submit" variant="secondary" className="w-full" disabled={loading || availableMethods.length === 0}>
        <Upload aria-hidden="true" />
        {loading ? t("upload.submitting") : t("upload.submit")}
      </Button>
      <p className="text-center text-xs leading-5 text-muted-foreground">{t("upload.notVerifiedNotice")}</p>
    </form>
  );
}
