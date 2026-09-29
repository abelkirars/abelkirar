"use client";

import { useEffect, useRef } from "react";
import { useInView, usePrefersReducedMotion } from "@/components/motion/hooks";
import { KirarStrings, type KirarStringsHandle, type StringSpec } from "@/components/motion/kirar-strings";

// Silent, decorative strings for the About page. No audio is attached:
// KirarStrings only draws; sound exists solely in the homepage hero.

const TITLE_STRING: StringSpec[] = [
  { x1: 0, y1: 16, x2: 720, y2: 16, width: 1.25, voice: { frequency: 3.4, decay: 1.3 } },
];

/** The gold draw-out ends here; the pluck's pull starts as it completes. */
const DRAW_MS = 450;

/**
 * The title-sequence string. Its draw-out is a CSS animation that starts
 * with the first frame; once hydrated, this draws the string back and
 * releases it just as the wordmark begins to rise — but only if the
 * sequence is still at that point (on a slow hydration it simply stays
 * still). Afterwards the pointer can pluck it, silently.
 */
export function AboutTitleString({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const boxRef = useRef<HTMLDivElement>(null);
  const stringRef = useRef<KirarStringsHandle>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (reduced || !box) return;
    // A finished draw animation is no longer listed: too late to pluck.
    const draw = box.getAnimations()[0];
    const now = document.timeline.currentTime;
    if (!draw || typeof draw.startTime !== "number" || typeof now !== "number") return;
    const elapsed = now - draw.startTime;
    if (elapsed > DRAW_MS) return;
    stringRef.current?.pluck(0, { position: 0.5, amplitude: 11, pull: 220, delay: DRAW_MS - elapsed, source: "auto" });
  }, [reduced]);

  return (
    <div ref={boxRef} aria-hidden="true" className={className}>
      <KirarStrings ref={stringRef} strings={TITLE_STRING} width={720} height={32} reduced={reduced} />
    </div>
  );
}

const PATH_STRING: StringSpec[] = [
  { x1: 0, y1: 20, x2: 1200, y2: 20, width: 1.2, voice: { frequency: 3, decay: 1.2 } },
];

/**
 * Desktop only (hidden below 1024px by CSS): the string joining Learn,
 * Accompany and Serve. It draws left to right when the steps come into
 * view and rings once when it arrives at Serve. Silent.
 */
export function AboutPathString({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(0.5);
  const stringRef = useRef<KirarStringsHandle>(null);

  useEffect(() => {
    if (inView && !reduced) stringRef.current?.pluck(0, { position: 0.72, amplitude: 7, pull: 120, delay: 1350, source: "auto" });
  }, [inView, reduced]);

  return (
    <div ref={ref} aria-hidden="true" className={className} data-reveal={inView ? "in" : "idle"}>
      <KirarStrings ref={stringRef} strings={PATH_STRING} width={1200} height={40} reduced={reduced} tone="onLight" />
    </div>
  );
}
