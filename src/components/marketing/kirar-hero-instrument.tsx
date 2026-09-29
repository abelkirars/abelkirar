"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useInView, usePrefersReducedMotion } from "@/components/motion/hooks";
import { KirarStrings, type KirarStringsHandle, type StringSpec } from "@/components/motion/kirar-strings";
import { SoundField, type SoundFieldHandle } from "@/components/motion/sound-field";
import { pentatonicVoices } from "@/components/motion/string-physics";
import motion from "@/components/motion/motion.module.css";
import styles from "./kirar-hero.module.css";

const VOICES = pentatonicVoices(4.2, 1.35);

/**
 * Five strings fanning from a narrow bridge up to a wider yoke, as on the
 * instrument. Lowest (thickest) string on the left.
 */
const STRINGS: StringSpec[] = [0, 1, 2, 3, 4].map((i) => ({
  x1: 170 + i * 20,
  y1: 570,
  x2: 110 + i * 50,
  y2: 52,
  width: 2.1 - i * 0.24,
  voice: VOICES[i],
}));

/** A welcome strum only right after the page loads, never on a later scroll. */
const WELCOME_WINDOW_MS = 6000;

export function KirarHeroInstrument({ label, hint, keysHint }: { label: string; hint: string; keysHint: string }) {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const stringsRef = useRef<KirarStringsHandle>(null);
  const fieldRef = useRef<SoundFieldHandle>(null);
  const hintId = useId();

  useEffect(() => {
    // The strum sweeps across as the headline settles. Silent by design.
    if (!inView || reduced || performance.now() > WELCOME_WINDOW_MS) return;
    stringsRef.current?.strum({ delay: 250, interval: 95, amplitude: 10 });
  }, [inView, reduced]);

  function onKeyDown(event: React.KeyboardEvent) {
    const digit = Number(event.key);
    if (digit >= 1 && digit <= STRINGS.length) {
      event.preventDefault();
      stringsRef.current?.pluck(digit - 1, { position: 0.5, amplitude: 12, source: "user" });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      stringsRef.current?.strum({ amplitude: 11, source: "user" });
    }
  }

  return (
    <>
      {/* Positioned against the hero section, behind the copy and the strings. */}
      <SoundField ref={fieldRef} reduced={reduced} />
      <div ref={ref} className={cn(motion.enterFade, styles.instrumentColumn)} style={{ "--d": "240ms" } as CSSProperties}>
        <div
          tabIndex={0}
          role="group"
          aria-label={label}
          aria-describedby={hintId}
          aria-keyshortcuts="1 2 3 4 5 Enter"
          onKeyDown={onKeyDown}
          className={cn(styles.instrument, motion.instrumentFocus)}
        >
          <KirarStrings
            ref={stringsRef}
            strings={STRINGS}
            width={420}
            height={620}
            reduced={reduced}
            pegs
            bridge
            onPluck={(event) => fieldRef.current?.ripple(event.clientX, event.clientY, event.strength)}
          />
        </div>
        <p id={hintId} className="sr-only">
          {keysHint}
        </p>
        <button
          type="button"
          onClick={() => stringsRef.current?.strum({ amplitude: 11, source: "user" })}
          className={styles.hint}
        >
          {hint}
        </button>
      </div>
    </>
  );
}
