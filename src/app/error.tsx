"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const t = useTranslations("pageError");
  return <section className="mx-auto max-w-xl px-4 py-16 text-center">
    <h1 className="font-heading text-3xl">{t("title")}</h1>
    <p className="my-5 text-muted-foreground">{t("description")}</p>
    <div className="flex flex-wrap justify-center gap-3">
      <Button onClick={() => unstable_retry()}>{t("retry")}</Button>
      <Button variant="outline" nativeButton={false} render={<Link href="/contact" />}>{t("contact")}</Button>
    </div>
  </section>;
}
