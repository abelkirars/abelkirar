import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { Container } from "@/components/marketing/container";
import { CrossPattern } from "@/components/marketing/cross-pattern";
import { MaskedWords } from "@/components/motion/masked-words";
import { RevealOnView } from "@/components/motion/reveal-on-view";
import motion from "@/components/motion/motion.module.css";

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export async function MissionSection() {
  const t = await getTranslations("mission");

  return (
    <section className={cn(motion.scope, "py-14 sm:py-24")}>
      <Container className="grid items-center gap-12 lg:grid-cols-2">
        <RevealOnView amount={0.3}>
          <p className={cn(motion.groupTrack, "mb-3 text-sm font-medium tracking-[0.2em] text-accent uppercase")}>
            {t("eyebrow")}
          </p>
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            <MaskedWords text={t("title")} delay={140} />
          </h2>
          <div className="mt-6 space-y-4 text-lg text-muted-foreground text-pretty">
            <p className={motion.revealItem} style={delay(520)}>{t("paragraph1")}</p>
            <p className={motion.revealItem} style={delay(640)}>{t("paragraph2")}</p>
          </div>
          <Link
            href="/about"
            className={cn(motion.revealItem, "mt-6 inline-block font-medium text-accent underline underline-offset-4")}
            style={delay(760)}
          >
            {t("readOurStory")}
          </Link>
        </RevealOnView>

        <RevealOnView amount={0.3}>
          <div className={cn(motion.revealPhoto, "relative aspect-4/3 overflow-hidden rounded-2xl")}>
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
              <p className={cn(motion.revealItem, "font-heading text-2xl text-balance text-[#f3e9d2]")} style={delay(700)}>
                {t("quote")}
              </p>
            </div>
          </div>
        </RevealOnView>
      </Container>
    </section>
  );
}
