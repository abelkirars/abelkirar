import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Container } from "@/components/marketing/container";
import { MaskedWords } from "@/components/motion/masked-words";
import { MotionCta } from "@/components/motion/motion-cta";
import { RevealOnView } from "@/components/motion/reveal-on-view";
import { StringDivider } from "@/components/motion/string-divider";
import motion from "@/components/motion/motion.module.css";

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

export function CommunityCta() {
  const t = useTranslations("community");

  return (
    <section className={cn(motion.scope, "bg-muted py-14 sm:py-24")}>
      <Container>
        <RevealOnView amount={0.35} className="flex flex-col items-center gap-6 text-center">
          <StringDivider className="-mb-2 max-w-xs" />
          <h2 className="max-w-2xl font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            <MaskedWords text={t("title")} delay={160} />
          </h2>
          <p className={cn(motion.revealItem, "max-w-xl text-lg text-muted-foreground text-pretty")} style={delay(520)}>
            {t("description")}
          </p>
          <div className={motion.revealItem} style={delay(680)}>
            <MotionCta href="/contact" variant="forest">
              {t("cta")}
            </MotionCta>
          </div>
        </RevealOnView>
      </Container>
    </section>
  );
}
