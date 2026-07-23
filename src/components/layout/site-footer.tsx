import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NAV_LINKS } from "@/lib/nav";
import { NewsletterForm } from "@/components/forms/newsletter-form";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const tHeader = await getTranslations("header");
  const tNav = await getTranslations("nav");

  return (
    <footer className="border-t border-border/60 bg-secondary text-secondary-foreground">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.3fr_1fr_1.2fr] lg:px-8">
        <div className="space-y-4">
          <span className="font-heading text-2xl font-semibold">{tHeader("brand")}</span>
          <p className="max-w-sm text-sm text-secondary-foreground/80">{t("tagline")}</p>
        </div>

        <nav className="flex flex-col gap-2 text-sm">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-secondary-foreground/80 transition-colors hover:text-secondary-foreground"
            >
              {tNav(link.key)}
            </Link>
          ))}
        </nav>

        <div className="space-y-3">
          <p className="text-sm font-medium">{t("joinCommunity")}</p>
          <p className="text-sm text-secondary-foreground/80">
            {t("joinCommunityDescription")}
          </p>
          <NewsletterForm source="footer" className="flex flex-col gap-2" />
        </div>
      </div>

      <div className="border-t border-secondary-foreground/10 py-6 text-center text-xs text-secondary-foreground/60">
        {t("copyright", { year: new Date().getFullYear() })}
      </div>
    </footer>
  );
}
