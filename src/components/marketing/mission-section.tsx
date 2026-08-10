import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/marketing/container";
import { CrossPattern } from "@/components/marketing/cross-pattern";

export async function MissionSection() {
  const t = await getTranslations("mission");

  return (
    <section className="py-20 sm:py-28">
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-sm font-medium tracking-[0.2em] text-accent uppercase">
            {t("eyebrow")}
          </p>
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {t("title")}
          </h2>
          <div className="mt-6 space-y-4 text-lg text-muted-foreground text-pretty">
            <p>{t("paragraph1")}</p>
            <p>{t("paragraph2")}</p>
          </div>
          <Link
            href="/about"
            className="mt-6 inline-block font-medium text-accent underline underline-offset-4"
          >
            {t("readOurStory")}
          </Link>
        </div>

        <div className="relative aspect-4/3 overflow-hidden rounded-2xl">
          <Image
            src="/mission-kirar.png"
            alt="A Kirar resting in a sunlit interior"
            fill
            className="object-cover"
          />
          {/* Scrim: matches instrument-category-cards.tsx — the quote is
              bottom-anchored and a photo can't guarantee the cream text
              stays legible the way the solid gradient did. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <CrossPattern className="text-[#f3e9d2] opacity-[0.12]" />
          <div className="relative flex h-full flex-col justify-end p-8">
            <p className="font-heading text-2xl text-balance text-[#f3e9d2]">{t("quote")}</p>
          </div>
        </div>
      </Container>
    </section>
  );
}
