import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { MaskedWords } from "@/components/motion/masked-words";
import { RevealOnView } from "@/components/motion/reveal-on-view";
import { StringDivider } from "@/components/motion/string-divider";
import motion from "@/components/motion/motion.module.css";

/**
 * Homepage-only section heading: the same type and spacing as
 * <SectionHeading>, with a scroll entrance — the eyebrow opens from the
 * centre, the title's words rise from their baseline and the description
 * settles in, followed by a single gold string. The text is server-rendered
 * and stays visible without JavaScript.
 */
export function HomeSectionHeading({
  eyebrow,
  title,
  description,
  divider = true,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  divider?: boolean;
  className?: string;
}) {
  const titleDelay = eyebrow ? 140 : 0;
  const wordCount = title.split(/\s+/).filter(Boolean).length;
  const descriptionDelay = titleDelay + 260 + wordCount * 55;

  return (
    <RevealOnView amount={0.4} className={cn(motion.scope, "mx-auto max-w-2xl text-center", className)}>
      {eyebrow && (
        <p className={cn(motion.groupTrack, "mb-3 text-sm font-medium uppercase tracking-[0.2em] text-accent")}>
          {eyebrow}
        </p>
      )}
      <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        <MaskedWords text={title} delay={titleDelay} />
      </h2>
      {description && (
        <p
          className={cn(motion.revealItem, "mt-4 text-lg text-muted-foreground text-pretty")}
          style={{ "--d": `${descriptionDelay}ms` } as CSSProperties}
        >
          {description}
        </p>
      )}
      {divider && <StringDivider delay={descriptionDelay + 120} className="mt-8" />}
    </RevealOnView>
  );
}
