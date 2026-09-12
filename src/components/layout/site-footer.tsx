import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NAV_LINKS } from "@/lib/nav";
import { NewsletterForm } from "@/components/forms/newsletter-form";
import { SOCIAL_LINKS } from "@/lib/social";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const tHeader = await getTranslations("header");
  const tNav = await getTranslations("nav");
  const tSocial = await getTranslations("footer.social");

  return (
    <footer className="border-t border-border/60 bg-secondary text-secondary-foreground">
      <div className="mx-auto grid max-w-6xl gap-7 px-4 py-14 sm:px-6 lg:grid-cols-[1.3fr_1fr_1.2fr] lg:px-8">
        <div className="space-y-4">
          <span className="font-heading text-2xl font-semibold">{tHeader("brand")}</span>
          <p className="max-w-sm text-sm text-secondary-foreground/80">{t("tagline")}</p>
        </div>

        <nav className="grid grid-cols-2 gap-x-4 text-sm lg:grid-cols-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex min-h-11 items-center text-secondary-foreground/80 transition-colors hover:text-secondary-foreground"
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
          <ul className="flex flex-wrap items-center gap-1 pt-1">
            {SOCIAL_LINKS.map((social) => (
              <li key={social.key}>
                <a
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={tSocial(social.key)}
                  className="flex size-11 items-center justify-center rounded-lg text-secondary-foreground/80 outline-none transition-colors hover:text-secondary-foreground focus-visible:ring-2 focus-visible:ring-secondary-foreground/70"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden
                    className="size-5"
                  >
                    <path d={social.path} />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-secondary-foreground/10 py-6 text-center text-xs text-secondary-foreground/60">
        {t("copyright", { year: new Date().getFullYear() })}
      </div>
    </footer>
  );
}
