"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useInView } from "./hooks";
import { KirarStrings, type KirarStringsHandle, type StringSpec } from "./kirar-strings";
import { Eyebrow, Fade, RevealText } from "./reveal";
import { BEAT_MS } from "./tokens";
import type { LabCopy } from "./copy";
import styles from "./motion-lab.module.css";

const DIVIDER: StringSpec[] = [
  { x1: 0, y1: 20, x2: 760, y2: 20, width: 1.2, voice: { frequency: 3.6, decay: 1.1 } },
];

const PILLAR_BEAT = BEAT_MS / 3;

/**
 * Section transition. The ivory panel opens from an inset card to full bleed
 * over the dark section behind it; a divider string draws across and is
 * struck as the heading arrives; the three pillars then land on the beat.
 */
export function PurposeSection({ copy, reduced }: { copy: LabCopy["purpose"]; reduced: boolean }) {
  const [panelRef, inView] = useInView<HTMLDivElement>(0.2);
  const dividerRef = useRef<KirarStringsHandle>(null);
  const state = inView ? "in" : "idle";

  useEffect(() => {
    if (inView) dividerRef.current?.pluck(0, { position: 0.5, amplitude: 9, pull: 140, delay: 900 });
  }, [inView]);

  return (
    <section className={styles.transitionWrap} aria-label="Section transition">
      <div ref={panelRef} className={cn(styles.panel, "py-16 sm:py-24")} data-reveal={state}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className={styles.divider} data-reveal={state} style={{ "--d": "250ms" } as CSSProperties}>
            <div className="aspect-[19/1]">
              <KirarStrings ref={dividerRef} strings={DIVIDER} width={760} height={40} reduced={reduced} tone="onLight" />
            </div>
          </div>

          <div className="mx-auto mt-8 max-w-2xl text-center sm:mt-10">
            <Eyebrow active={inView} delay={600} className="text-[#8a5f10]">
              {copy.eyebrow}
            </Eyebrow>
            <RevealText
              as="h2"
              text={copy.title}
              active={inView}
              delay={760}
              className="mt-4 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-5xl"
            />
            <Fade as="p" active={inView} delay={1150} className="mt-5 text-lg text-pretty text-[#52615a]">
              {copy.description}
            </Fade>
          </div>

          <div className="mx-auto mt-14 grid max-w-5xl gap-12 sm:grid-cols-3 sm:gap-8">
            {copy.pillars.map((pillar, i) => {
              const at = 1350 + i * PILLAR_BEAT;
              return (
                <div key={pillar.title} className="flex flex-col items-center text-center sm:items-start sm:text-left">
                  <div className={styles.pillarRule} data-reveal={state} style={{ "--d": `${at}ms` } as CSSProperties} />
                  <Fade active={inView} delay={at + 60} className="mt-4 text-xs font-semibold tracking-[0.2em] text-[#b89b5e] tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </Fade>
                  <RevealText
                    as="h3"
                    text={pillar.title}
                    active={inView}
                    delay={at + 100}
                    className="mt-2 font-heading text-3xl font-semibold tracking-tight"
                  />
                  <Fade as="p" active={inView} delay={at + 300} className="mt-3 max-w-xs text-pretty text-[#52615a]">
                    {pillar.description}
                  </Fade>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
