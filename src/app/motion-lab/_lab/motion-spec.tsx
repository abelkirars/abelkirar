"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useInView } from "./hooks";
import { Fade } from "./reveal";
import { BEAT_MS, DURATION_MS, EASE, STAGGER_MS, cssEase, type Bezier } from "./tokens";
import styles from "./motion-lab.module.css";

const CURVES: { name: keyof typeof EASE; use: string }[] = [
  { name: "pluck", use: "Attack, then a long sustain. Every entrance and reveal." },
  { name: "resonate", use: "Weighted and symmetric. Lines drawing, panels opening." },
  { name: "settle", use: "Arrives without overshoot. Selection, hover, toggles." },
  { name: "release", use: "Quiet, quick exits — always shorter than the entrance." },
];

function CurveGraph({ bezier }: { bezier: Bezier }) {
  const [x1, y1, x2, y2] = bezier;
  const s = 100;
  return (
    <svg viewBox="-6 -6 112 112" className="size-24" aria-hidden="true">
      <rect x="0" y="0" width={s} height={s} fill="none" stroke="currentColor" strokeOpacity="0.12" />
      <line x1="0" y1={s} x2={x1 * s} y2={s - y1 * s} stroke="currentColor" strokeOpacity="0.25" />
      <line x1={s} y1="0" x2={x2 * s} y2={s - y2 * s} stroke="currentColor" strokeOpacity="0.25" />
      <path
        d={`M0 ${s} C${x1 * s} ${s - y1 * s} ${x2 * s} ${s - y2 * s} ${s} 0`}
        fill="none"
        stroke="#b89b5e"
        strokeWidth="2.2"
      />
    </svg>
  );
}

export function MotionSpec() {
  const [ref, inView] = useInView<HTMLDivElement>(0.2);
  return (
    <section className="bg-[#fbf6ec] py-16 sm:py-24" aria-label="Motion tokens">
      <div ref={ref} className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <p className={cn(styles.sectionLabel, "text-[#8a5f10]")}>Motion tokens</p>
        <h2 className="mt-3 max-w-2xl font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Pluck → resonance → rest.
        </h2>
        <p className="mt-4 max-w-2xl text-[#52615a]">
          Short attack, long decelerating sustain, then stillness. Sequences are counted against a slow beat of{" "}
          {BEAT_MS}ms (~{Math.round(60000 / BEAT_MS)} BPM) so they land in rhythm. Nothing loops except the scroll cue.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CURVES.map((curve, i) => (
            <Fade key={curve.name} active={inView} delay={i * 90} className={cn(styles.tile, "p-5")}>
              <div className="flex items-start justify-between gap-3 text-[#182d24]">
                <CurveGraph bezier={EASE[curve.name]} />
                <span className="font-heading text-2xl">{curve.name}</span>
              </div>
              <div className="mt-4 h-px w-full bg-[#ddd6c6]">
                <span
                  className="block size-2.5 -translate-y-1 rounded-full bg-[#b89b5e]"
                  style={
                    {
                      marginLeft: inView ? "calc(100% - 10px)" : "0",
                      transition: `margin-left 1400ms ${cssEase(EASE[curve.name])} ${400 + i * 120}ms`,
                    } as CSSProperties
                  }
                />
              </div>
              <p className="mt-4 text-sm text-[#52615a]">{curve.use}</p>
              <code className="mt-3 block text-xs text-[#8a5f10]">{cssEase(EASE[curve.name])}</code>
            </Fade>
          ))}
        </div>

        <dl className="mt-10 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Micro (hover, press)", `${DURATION_MS.micro}–260ms`],
            ["State (select, toggle)", `${DURATION_MS.state}–480ms`],
            ["Entrance (text, cards)", `700–${DURATION_MS.enter + 150}ms`],
            ["Drawing & cinematic", `${DURATION_MS.draw}–${DURATION_MS.cinematic}ms`],
            ["Letter stagger", `${STAGGER_MS.letter}–48ms, centre-out`],
            ["Word / line stagger", `${STAGGER_MS.word}ms / ${STAGGER_MS.line}ms`],
            ["Card stagger", `${STAGGER_MS.card}ms`],
            ["Scale on select", "1.02 (never bounce)"],
          ].map(([term, value]) => (
            <div key={term} className="border-t border-[#ddd6c6] pt-3">
              <dt className="text-[#52615a]">{term}</dt>
              <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
