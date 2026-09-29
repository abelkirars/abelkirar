"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useInView, usePrefersReducedMotion } from "./hooks";
import { KirarStrings, type KirarStringsHandle, type StringSpec } from "./kirar-strings";
import styles from "./motion.module.css";

const DIVIDER: StringSpec[] = [
  { x1: 0, y1: 20, x2: 760, y2: 20, width: 1.2, voice: { frequency: 3.6, decay: 1.1 } },
];

/**
 * A single gold string that draws across as its section arrives and is
 * struck once — silent, purely visual. Hovering or dragging it plucks it.
 * Decorative: hidden from assistive technology.
 */
export function StringDivider({ delay = 0, className }: { delay?: number; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(0.6);
  const stringRef = useRef<KirarStringsHandle>(null);

  useEffect(() => {
    if (inView && !reduced) stringRef.current?.pluck(0, { position: 0.5, amplitude: 8, pull: 140, delay: delay + 650 });
  }, [inView, reduced, delay]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(styles.divider, className)}
      data-reveal={inView ? "in" : "idle"}
      style={{ "--d": `${delay}ms` } as CSSProperties}
    >
      <div className={styles.dividerString}>
        <KirarStrings ref={stringRef} strings={DIVIDER} width={760} height={40} reduced={reduced} tone="onLight" />
      </div>
    </div>
  );
}
