"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError } from "@/components/ui/field";
import { CoursePriceAmount } from "@/components/marketing/course-price-amount";
import type { CoursePriceInput } from "@/lib/validations/course-price";
import type { CoursePricing } from "@/lib/course-pricing";

export function CoursePriceForm({ slug, title, initial, initialPricing }: {
  slug: string; title: string; initial: CoursePriceInput; initialPricing: CoursePricing;
}) {
  const t = useTranslations("coursePricing");
  const router = useRouter();
  const uid = useId();
  const [draft, setDraft] = useState({ priceCents: String(initial.priceCents), discountType: initial.discountType ?? "", discountValue: initial.discountValue === null ? "" : String(initial.discountValue), discountActive: initial.discountActive });
  const [preview, setPreview] = useState<CoursePricing | null>(initialPricing);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const revision = useRef(0);
  const previewController = useRef<AbortController | null>(null);
  const payload = JSON.stringify({ ...draft, discountType: draft.discountType || null, discountValue: draft.discountType ? draft.discountValue : null });

  // Abort older previews so a slow response cannot overwrite newer input.
  useEffect(() => {
    const controller = new AbortController();
    previewController.current = controller;
    const previewRevision = revision.current;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/courses/${slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted || revision.current !== previewRevision) return;
        if (!response.ok) {
          setPreview(null);
          setError(response.status === 401 ? "sessionExpired" : data.error ?? "saveFailed");
          setErrorField(data.field ?? null);
        } else {
          setPreview(data.pricing);
          setError(null);
          setErrorField(null);
        }
      } catch {
        if (!controller.signal.aborted) { setPreview(null); setError("previewFailed"); }
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [payload, slug]);

  function update(patch: Partial<typeof draft>) {
    revision.current += 1;
    setDraft((current) => ({ ...current, ...patch }));
    setPreview(null);
    setError(null);
    setErrorField(null);
    setSaved(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    previewController.current?.abort();
    setSaving(true); setSaved(false); setError(null);
    const submittedRevision = revision.current;
    try {
      const response = await fetch(`/api/admin/courses/${slug}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: payload });
      const data = await response.json();
      if (!response.ok) {
        setError(response.status === 401 ? "sessionExpired" : data.error ?? "saveFailed");
        setErrorField(data.field ?? null);
        return;
      }
      if (revision.current === submittedRevision) { setPreview(data.pricing); setSaved(true); }
      router.refresh();
    } catch { setError("saveFailed"); }
    finally { setSaving(false); }
  }

  const errorId = `${uid}-error`;
  return (
    <form onSubmit={submit} noValidate className="space-y-5 rounded-2xl border border-border bg-card p-6">
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      <fieldset disabled={saving} className="space-y-5">
        <Field>
          <FieldLabel htmlFor={`${uid}-price`}>{t("priceCents")}</FieldLabel>
          <Input id={`${uid}-price`} name="priceCents" inputMode="numeric" value={draft.priceCents} onChange={(e) => update({ priceCents: e.target.value })} aria-invalid={errorField === "priceCents"} aria-describedby={`${uid}-units${errorField === "priceCents" ? ` ${errorId}` : ""}`} />
          <p id={`${uid}-units`} className="text-sm text-muted-foreground">{t("unitsHint")}</p>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${uid}-type`}>{t("discountType")}</FieldLabel>
          <select id={`${uid}-type`} name="discountType" className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={draft.discountType} onChange={(e) => update({ discountType: e.target.value, discountValue: "", discountActive: e.target.value ? draft.discountActive : false })}>
            <option value="">{t("none")}</option><option value="PERCENT">{t("percent")}</option><option value="FIXED">{t("fixed")}</option>
          </select>
        </Field>
        {draft.discountType && <Field>
          <FieldLabel htmlFor={`${uid}-discount`}>{t(draft.discountType === "PERCENT" ? "percentValue" : "fixedValue")}</FieldLabel>
          <Input id={`${uid}-discount`} name="discountValue" inputMode="numeric" value={draft.discountValue} onChange={(e) => update({ discountValue: e.target.value })} aria-invalid={errorField === "discountValue"} aria-describedby={errorField === "discountValue" ? errorId : undefined} />
        </Field>}
        <label className="flex min-h-11 items-center gap-3 text-sm" htmlFor={`${uid}-active`}>
          <input id={`${uid}-active`} type="checkbox" className="size-5 accent-current" disabled={!draft.discountType} checked={draft.discountActive} onChange={(e) => update({ discountActive: e.target.checked })} />{t("active")}
        </label>
      </fieldset>
      <div aria-live="polite" aria-atomic="true" className="min-h-20 rounded-lg bg-muted p-4">
        <p className="mb-2 text-sm text-muted-foreground">{t("preview")}</p>
        {preview ? <CoursePriceAmount pricing={preview} /> : <p className="text-sm">{t(error ? "previewUnavailable" : "previewLoading")}</p>}
      </div>
      {error && <div id={errorId} role="alert"><FieldError>{t(error)}</FieldError></div>}
      {saved && <p role="status" className="text-sm">{t("saved")}</p>}
      <Button type="submit" disabled={saving}>{t(saving ? "saving" : "save")}</Button>
    </form>
  );
}
