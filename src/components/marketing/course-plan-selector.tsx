"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check } from "lucide-react";
import type { PublicCoursePlan } from "@/lib/courses/public-plans";

export function CoursePlanSelector({ plans, slug, value, defaultValue, onChange }: {
  plans: PublicCoursePlan[]; slug?: string; value?: string; defaultValue?: string; onChange?: (id: string) => void;
}) {
  const [selection, setSelection] = useState(defaultValue ?? plans[0]?.id ?? "");
  const [now, setNow] = useState<number | null>(null);
  const id = useId();
  const t = useTranslations("coursePlanChoice");
  const locale = useLocale();
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const selected = value ?? selection;
  const money = (amount: number, currency: string) => new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount / 100);
  if (!plans.length) return <p>{t("unavailable")}</p>;
  return <fieldset className="space-y-3 text-left">
    <legend className="mb-3 text-sm font-semibold">{t("legend")}</legend>
    {plans.map(plan => {
      const active = plan.id === selected;
      const seconds = plan.promotion && now !== null ? Math.max(0, Math.floor((Date.parse(plan.promotion.endsAt) - now) / 1000)) : null;
      const promoted = Boolean(plan.promotion && (seconds === null || seconds > 0));
      return <label key={plan.id} className={`relative block cursor-pointer rounded-xl border p-4 transition-colors duration-250 motion-reduce:transition-none focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 ${active ? "border-[#b89b5e] bg-[#123b2d] text-[#faf7ef]" : "border-[#d8d5cc] bg-[#faf7ef] text-[#182d24]"}`}>
        <input className="sr-only" type="radio" name={id} value={plan.id} checked={active} onChange={() => { setSelection(plan.id); onChange?.(plan.id); }} />
        <span className="flex items-start justify-between gap-3"><strong>{plan.format === "GROUP" ? t("group", { min: plan.groupMinimumStudents ?? 3, max: plan.groupMaximumStudents ?? 4 }) : t("private")}</strong>{active && <Check aria-hidden="true" className="size-5 shrink-0 text-[#d7b76e]" />}</span>
        <span className="mt-2 block text-lg font-semibold">{money(plan.baseAmountCents, plan.currency)} <span className="text-sm font-normal">{t("monthly")}</span></span>
        {promoted && <span className="mt-2 block text-sm">{t("initialOffer", { amount: money(plan.finalAmountCents, plan.currency) })}</span>}
        {promoted && plan.promotion?.publicCountdownEnabled && <span className="mt-1 block text-xs">{seconds === null ? t("ends", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(plan.promotion.endsAt)) }) : t("remaining", { days: Math.floor(seconds / 86400), hours: Math.floor(seconds % 86400 / 3600), minutes: Math.floor(seconds % 3600 / 60) })}</span>}
      </label>;
    })}
    <p className="text-xs leading-5 opacity-80">{t("snapshotNotice")}</p>
    {slug && <Link className="inline-flex rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-accent" href={`/courses/${slug}?plan=${encodeURIComponent(selected)}#apply`}>{t("continue")}</Link>}
  </fieldset>;
}
