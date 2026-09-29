import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { MotionCta } from "@/components/motion/motion-cta";
import motion from "@/components/motion/motion.module.css";
import { KirarHeroInstrument } from "./kirar-hero-instrument";
import styles from "./kirar-hero.module.css";

/**
 * Homepage hero. Server-rendered so the headline, copy and links are in the
 * first HTML response. The entrance is CSS-only and starts with the first
 * frame — it never waits for JavaScript, and it is skipped entirely under
 * prefers-reduced-motion. Only the strings instrument is client code.
 *
 * Replaces ./hero.tsx on the homepage; that component is kept, unused, so
 * the change can be reverted by switching one import in src/app/page.tsx.
 */
export async function KirarHero() {
  const t = await getTranslations("hero");
  const words = t("title").split(/\s+/).filter(Boolean);

  return (
    <section className={cn(motion.scope, styles.hero)} aria-labelledby="home-hero-title">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={cn(motion.enterTrack, styles.eyebrow)}>{t("eyebrow")}</p>
          <h1 id="home-hero-title" className={styles.title}>
            {words.map((word, i) => (
              <span key={`${word}-${i}`}>
                <span className={motion.maskWord}>
                  <span className={motion.maskWordInner} style={{ "--d": `${120 + i * 70}ms` } as CSSProperties}>
                    {word}
                  </span>
                </span>
                {i < words.length - 1 ? " " : null}
              </span>
            ))}
          </h1>
          <p className={cn(motion.enterFade, styles.description)} style={{ "--d": "620ms" } as CSSProperties}>
            {t("description")}
          </p>
          <div className={cn(motion.enterFade, styles.actions)} style={{ "--d": "780ms" } as CSSProperties}>
            <MotionCta href="/courses#waitlist" className={styles.action}>
              {t("startLearning")}
            </MotionCta>
            <MotionCta href="/contact" variant="ghost" arrow={false} className={styles.action}>
              {t("contactAbel")}
            </MotionCta>
          </div>
        </div>

        <KirarHeroInstrument
          label={t("instrumentLabel")}
          hint={t("instrumentHint")}
          keysHint={t("instrumentKeys")}
          soundLabels={{
            sound: t("sound"),
            on: t("soundOn"),
            off: t("soundOff"),
            loading: t("soundLoading"),
            unavailable: t("soundUnavailable"),
            room: t("soundRoom"),
            announceOn: t("soundAnnounceOn"),
            announceOff: t("soundAnnounceOff"),
            announceLoading: t("soundAnnounceLoading"),
            announceError: t("soundAnnounceError"),
          }}
        />
      </div>
    </section>
  );
}
