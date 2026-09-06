import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function CatalogUnavailable() {
  const t = await getTranslations("store");
  return <div data-catalog-status="unavailable" role="status" className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
    <h2 className="font-heading text-2xl">{t("unavailableTitle")}</h2>
    <p className="mt-3 text-muted-foreground">{t("unavailableDescription")}</p>
    <div className="mt-5 flex flex-wrap justify-center gap-3">
      {/* Reload the document so a transient failure is not replayed from the client router cache. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/store" className="inline-flex min-h-12 items-center rounded-lg bg-primary px-5 font-medium text-primary-foreground">{t("retry")}</a>
      <Link href="/contact" className="inline-flex min-h-12 items-center rounded-lg border px-5">{t("contact")}</Link>
    </div>
  </div>;
}
