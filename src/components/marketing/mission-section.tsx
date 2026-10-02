import Link from "next/link";
import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { Container } from "@/components/marketing/container";
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
          <figure>
            {/* Deacon Abel playing two Kirars (made in the separate remotion/
                project, 720p for this ~550px column). Plays only on request,
                with sound, like the other published performance videos;
                preload="none" means nothing downloads until then. */}
            <div className={cn(motion.revealPhoto, "relative aspect-video overflow-hidden rounded-2xl bg-[#0b1d16]")}>
              <video
                controls
                playsInline
                preload="none"
                poster="/video/two-kirar-poster.jpg"
                aria-label={t("videoLabel")}
                className="absolute inset-0 h-full w-full"
              >
                <source src="/video/two-kirar-performance.mp4" type="video/mp4" />
              </video>
            </div>
            <figcaption className={cn(motion.revealItem, "mt-4 font-heading text-xl text-balance text-foreground")} style={delay(700)}>
              {t("quote")}
            </figcaption>
          </figure>
        </RevealOnView>
      </Container>
    </section>
  );
}
