"use client";

import { useTranslations } from "next-intl";
import type { CoursePricing } from "@/lib/course-pricing";

function decimalCents(cents: number) {
  const value = BigInt(cents);
  const minor = value % BigInt(100);
  return `${value / BigInt(100)}${minor ? `.${String(minor).padStart(2, "0")}` : ""}`;
}

export function CoursePriceAmount({ pricing }: { pricing: CoursePricing }) {
  const t = useTranslations("coursePricing");
  const amount = (cents: number) => t("amount", { amount: decimalCents(cents) });
  return (
    <div className="flex flex-wrap items-baseline gap-3">
      {pricing.isDiscounted && (
        <del className="text-base opacity-75"><span className="sr-only">{t("originalPrice")} </span>{amount(pricing.basePriceCents)}</del>
      )}
      <span className="font-heading text-3xl font-semibold">
        <span className="sr-only">{t("finalPrice")} </span>{amount(pricing.finalPriceCents)}
      </span>
      {pricing.isDiscounted && (
        <span className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-accent-foreground">{pricing.percentOff < 1 ? t("lessThanOnePercent") : t("percentOff", { percent: pricing.percentOff })}</span>
      )}
    </div>
  );
}
