"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/actions/set-locale";
import { locales, type Locale } from "@/i18n/locale";
import { cn } from "@/lib/utils";

const LOCALE_LABELS: Record<Locale, string> = {
  en: "EN",
  am: "አማ",
};

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSelect(next: Locale) {
    if (next === locale || isPending) return;
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 rounded-md border border-border p-0.5 text-sm font-medium",
        className
      )}
      role="group"
      aria-label="Language"
    >
      {locales.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => handleSelect(value)}
          aria-pressed={locale === value}
          className={cn(
            "rounded-sm px-2 py-1 transition-colors",
            locale === value
              ? "bg-primary text-primary-foreground"
              : "text-foreground/70 hover:text-foreground"
          )}
        >
          {LOCALE_LABELS[value]}
        </button>
      ))}
    </div>
  );
}
