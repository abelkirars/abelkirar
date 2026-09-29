import Image from "next/image";
import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { Container } from "@/components/marketing/container";
import { HomeSectionHeading } from "@/components/marketing/home-section-heading";
import { MaskedWords } from "@/components/motion/masked-words";
import { RevealOnView } from "@/components/motion/reveal-on-view";
import motion from "@/components/motion/motion.module.css";
import { AboutPathString, AboutTitleString } from "./about-strings";
import styles from "./about.module.css";

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

const WORDMARK = "ABEL KIRAR";

/**
 * About title sequence (~1.5 s, CSS-only, see about.module.css). The page's
 * real heading is the <h1>; the ABEL KIRAR wordmark above it is the brand
 * mark, hidden from assistive technology so the title isn't read twice.
 */
export async function AboutTitleSequence() {
  const t = await getTranslations("about");
  const letters = Array.from(WORDMARK);
  const centre = (letters.length - 1) / 2;

  return (
    <section className={cn(motion.scope, styles.hero)} aria-labelledby="about-title">
      <div aria-hidden="true" className={styles.heroGlow} />
      <Container className={styles.heroInner}>
        <p className={styles.eyebrow}>{t("eyebrow")}</p>
        <div aria-hidden="true" className={styles.wordmark}>
          {letters.map((letter, i) =>
            letter === " " ? (
              <span key={i} className={styles.space} />
            ) : (
              // Centre letters first, like a wave leaving the pluck.
              <span key={i} className={styles.letter} style={delay(Math.round(Math.abs(i - centre) * 45))}>
                {letter}
              </span>
            ),
          )}
        </div>
        <AboutTitleString className={styles.titleString} />
        <h1 id="about-title" className={styles.title}>
          {t("title")}
        </h1>
      </Container>
    </section>
  );
}

/**
 * The three story paragraphs as an editorial column beside a photograph.
 * The text has no entrance: it is often inside the first viewport, and
 * holding it back until hydration would delay the page's main content.
 * Only the photograph opens (a crop that never hides it).
 */
export async function AboutStory() {
  const t = await getTranslations("about");

  return (
    <section className={cn(motion.scope, "py-14 sm:py-24")}>
      <Container className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
        <div className="max-w-2xl space-y-6 text-lg text-muted-foreground text-pretty">
          <p className={styles.lead}>{t("paragraph1")}</p>
          <p>{t("paragraph2")}</p>
          <p>{t("paragraph3")}</p>
        </div>
        <RevealOnView amount={0.3}>
          <div className={cn(motion.revealPhoto, "relative aspect-4/3 overflow-hidden rounded-2xl lg:aspect-4/5")}>
            <Image
              src="/mission-kirar.png"
              alt="A Kirar resting in a sunlit interior"
              fill
              sizes="(min-width: 1024px) 26rem, calc(100vw - 2rem)"
              className="object-cover"
            />
          </div>
        </RevealOnView>
      </Container>
    </section>
  );
}

const STEPS = [
  ["learn", "learnDescription"],
  ["accompany", "accompanyDescription"],
  ["serve", "serveDescription"],
] as const;

/**
 * Learn → Accompany → Serve as one path: a gold string (vertical on phones,
 * horizontal on desktop) reaches each step in turn, which then lights and
 * reveals. An ordered list, so the progression is in the markup too.
 */
export async function AboutJourney() {
  const t = await getTranslations("about");

  return (
    <section className="bg-muted/40 py-14 sm:py-24">
      <Container>
        <HomeSectionHeading eyebrow={t("whyEyebrow")} title={t("whyTitle")} description={t("whyDescription")} divider={false} />
        <RevealOnView amount={0.3} className={cn(motion.scope, styles.path)}>
          <AboutPathString className={styles.pathString} />
          <ol className={styles.steps}>
            {STEPS.map(([title, description], i) => {
              const at = 250 + i * 430;
              return (
                <li key={title} className={styles.step}>
                  <span aria-hidden="true" className={styles.node} style={delay(at)} />
                  <span aria-hidden="true" className={cn(motion.revealItem, styles.index)} style={delay(at + 60)}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className={styles.stepTitle}>
                    <MaskedWords text={t(title)} delay={at + 120} />
                  </h3>
                  <p className={cn(motion.revealItem, styles.stepText)} style={delay(at + 320)}>
                    {t(description)}
                  </p>
                </li>
              );
            })}
          </ol>
        </RevealOnView>
      </Container>
    </section>
  );
}
