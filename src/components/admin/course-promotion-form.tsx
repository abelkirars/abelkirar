"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CoursePromotionForm({ plans, cancelId }: { plans?: { id: string; code: string }[]; cancelId?: string }) {
  const t = useTranslations("coursePromotionAdmin");
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError(null);
    try {
      const payload = cancelId ? { action: "cancel", id: cancelId } : { action: "create", promotion: {
        coursePlanId: data.get("coursePlanId"), name: data.get("name"), discountType: data.get("discountType"), discountValue: Number(data.get("discountValue")),
        startsAt: new Date(`${data.get("startsAt")}:00Z`).toISOString(), endsAt: new Date(`${data.get("endsAt")}:00Z`).toISOString(), publicCountdownEnabled: data.get("countdown") === "on",
      } };
      const response = await fetch("/api/admin/course-promotions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { const body = await response.json(); setError(t(body.error === "overlap" ? "overlap" : "invalid")); }
      else { form.reset(); router.refresh(); }
    } catch { setError(t("invalid")); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    {!cancelId && <>
      <label className="block space-y-2"><span>{t("plan")}</span><select required name="coursePlanId" className="block w-full rounded-lg border p-3">{plans?.map(plan => <option key={plan.id} value={plan.id}>{plan.code}</option>)}</select></label>
      <label className="block space-y-2"><span>{t("name")}</span><Input name="name" required maxLength={150} /></label>
      <label className="block space-y-2"><span>{t("type")}</span><select name="discountType" className="block w-full rounded-lg border p-3"><option value="PERCENT">{t("percent")}</option><option value="FIXED">{t("fixed")}</option></select></label>
      <label className="block space-y-2"><span>{t("value")}</span><Input name="discountValue" type="number" min={1} step={1} required /></label>
      <div className="grid gap-4 sm:grid-cols-2">{["startsAt", "endsAt"].map(key => <label key={key} className="block space-y-2"><span>{t(key)}</span><Input name={key} type="datetime-local" required /></label>)}</div>
      <label className="flex items-center gap-2"><input type="checkbox" name="countdown" defaultChecked />{t("countdown")}</label>
      <p className="text-sm text-muted-foreground">{t("notice")}</p>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={busy}>{t(busy ? "saving" : cancelId ? "cancel" : "create")}</Button>
  </form>;
}
