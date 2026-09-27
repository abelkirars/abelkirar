"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useInView, usePhases } from "./hooks";
import { KirarStrings, type KirarStringsHandle, type StringSpec } from "./kirar-strings";
import { Eyebrow, Fade } from "./reveal";
import styles from "./motion-lab.module.css";

const WORDMARK = "ABEL KIRAR";

/**
 * dark forest → a gold string draws out from the centre → it is drawn back
 * (anticipation) → released → the wordmark rises from the string, letters
 * leaving the centre first, like the wave travelling out from the pluck →
 * the tracking settles in → supporting line → scroll cue.
 */
const SCHEDULE = [
  ["draw", 250],
  ["pull", 1250],
  ["revealed", 1430],
  ["support", 2350],
  ["done", 3200],
] as const;

type Phase = "idle" | (typeof SCHEDULE)[number][0];
const ORDER: Phase[] = ["idle", "draw", "pull", "revealed", "support", "done"];

const STRING: StringSpec[] = [
  { x1: 0, y1: 20, x2: 600, y2: 20, width: 1.25, voice: { frequency: 3.4, decay: 1.3 } },
];

export function BrandReveal({ subline, reduced }: { subline: string; reduced: boolean }) {
  const [sectionRef, inView] = useInView<HTMLElement>(0.4);
  const phase = usePhases<Phase>(inView, SCHEDULE, "idle", reduced);
  const stringRef = useRef<KirarStringsHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const at = (name: Phase) => ORDER.indexOf(phase) >= ORDER.indexOf(name);

  useEffect(() => {
    // Draw the string down (towards the viewer's hand), then let it go.
    if (phase === "pull") stringRef.current?.pluck(0, { position: 0.5, amplitude: 15, pull: 180 });
  }, [phase]);

  // Transition into content: as the section scrolls away, the title recedes
  // at a slower rate than the page and dims — the next section arrives over it.
  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage || reduced) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, -rect.top / rect.height));
      stage.style.translate = `0 ${(progress * rect.height * 0.35).toFixed(1)}px`;
      stage.style.opacity = String(1 - Math.min(1, progress * 1.4));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      stage.style.translate = "";
      stage.style.opacity = "";
    };
  }, [reduced, sectionRef]);

  const letters = Array.from(WORDMARK);
  const centre = (letters.length - 1) / 2;

  return (
    <section
      ref={sectionRef}
      className={styles.brand}
      data-drawn={at("draw") ? "" : undefined}
      data-revealed={at("revealed") ? "" : undefined}
      aria-label="Brand title sequence"
    >
      <div aria-hidden="true" className={styles.brandGlow} />
      <div ref={stageRef} className={styles.brandStage}>
        <div className={styles.wordmarkMask}>
          <h2 className={styles.wordmark} aria-label="Abel Kirar">
            {letters.map((letter, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={letter === " " ? "inline-block w-[0.42em]" : styles.letter}
                style={{ "--d": `${Math.round(Math.abs(i - centre) * 48)}ms` } as CSSProperties}
              >
                {letter === " " ? " " : letter}
              </span>
            ))}
          </h2>
        </div>

        <div className={cn(styles.brandString, "aspect-[15/1]")}>
          <KirarStrings
            ref={stringRef}
            strings={STRING}
            width={600}
            height={40}
            reduced={reduced}
            interactive={phase === "done"}
          />
        </div>

        <Eyebrow
          active={at("support")}
          trackTo="0.32em"
          className="mt-6 max-w-[22rem] text-center text-balance text-[#d7b76e] sm:mt-8 sm:max-w-none"
        >
          {subline}
        </Eyebrow>
      </div>

      <div className={styles.scrollCue}>
        <Fade active={at("done")} className="flex flex-col items-center gap-2.5">
          <span>Scroll</span>
          <span className={styles.scrollCueLine}>
            <span className={styles.scrollCueBead} />
          </span>
        </Fade>
      </div>
    </section>
  );
}
