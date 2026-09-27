"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import styles from "./motion-lab.module.css";

export type InstrumentId = "KIRAR" | "BEGENA" | "MESENKO";

interface Part {
  d: string;
  delay: number;
  string?: boolean;
}

function strings(count: number, bottom: [number, number, number], top: [number, number, number], delay: number): Part[] {
  const [bx1, bx2, by] = bottom;
  const [tx1, tx2, ty] = top;
  return Array.from({ length: count }, (_, i) => {
    const k = count === 1 ? 0.5 : i / (count - 1);
    const x1 = bx1 + (bx2 - bx1) * k;
    const x2 = tx1 + (tx2 - tx1) * k;
    return { d: `M${x1.toFixed(1)} ${by} L${x2.toFixed(1)} ${ty}`, delay: delay + i * 55, string: true };
  });
}

/**
 * Hand-drawn-in-SVG line portraits, drawn in construction order: body,
 * arms, yoke, fittings — strings last, as if the instrument were being
 * strung. viewBox 300 × 460.
 */
const ART: Record<InstrumentId, Part[]> = {
  KIRAR: [
    { d: "M76 368 A74 74 0 1 0 224 368 A74 74 0 1 0 76 368", delay: 0 },
    { d: "M150 330 L182 362 L150 394 L118 362 Z", delay: 260 },
    { d: "M150 348 L164 362 L150 376 L136 362 Z", delay: 360 },
    { d: "M104 312 L58 92 M116 306 L72 96", delay: 220 },
    { d: "M196 312 L242 92 M184 306 L228 96", delay: 220 },
    { d: "M34 72 Q150 90 266 72 L262 96 Q150 110 38 96 Z", delay: 480 },
    { d: "M96 84 a3 3 0 1 0 0.1 0 M123 86 a3 3 0 1 0 0.1 0 M150 87 a3 3 0 1 0 0.1 0 M177 86 a3 3 0 1 0 0.1 0 M204 84 a3 3 0 1 0 0.1 0", delay: 700 },
    { d: "M126 404 L174 404", delay: 620 },
    ...strings(5, [132, 168, 404], [96, 204, 98], 880),
  ],
  BEGENA: [
    { d: "M68 296 L232 296 L252 440 L48 440 Z", delay: 0 },
    { d: "M82 312 L218 312 L234 424 L66 424 Z", delay: 200 },
    { d: "M80 296 L52 46 M92 296 L66 48", delay: 220 },
    { d: "M220 296 L248 46 M208 296 L234 48", delay: 220 },
    { d: "M32 30 L268 30 L268 50 L32 50 Z", delay: 480 },
    { d: "M100 410 L200 410", delay: 620 },
    ...strings(10, [108, 192, 410], [76, 224, 50], 820),
  ],
  MESENKO: [
    { d: "M150 280 L230 360 L150 440 L70 360 Z", delay: 0 },
    { d: "M150 296 L214 360 L150 424 L86 360 Z", delay: 200 },
    { d: "M144 288 L144 62 M156 288 L156 62", delay: 260 },
    { d: "M140 62 L150 28 L160 62", delay: 460 },
    { d: "M131 86 L171 86 M131 86 a5 5 0 1 0 -0.1 0", delay: 600 },
    { d: "M140 402 L160 402", delay: 640 },
    { d: "M226 118 Q280 262 226 406", delay: 740 },
    { d: "M226 118 L226 406", delay: 900, string: true },
    ...strings(1, [150, 150, 430], [150, 150, 88], 820),
  ],
};

export function InstrumentArt({ id, leaving }: { id: InstrumentId; leaving?: boolean }) {
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    // Two frames: let the undrawn state paint before transitioning from it.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setDrawn(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  let stringIndex = 0;
  return (
    <svg
      viewBox="0 0 300 460"
      className={styles.art}
      data-drawn={drawn ? "" : undefined}
      data-leaving={leaving ? "" : undefined}
      aria-hidden="true"
    >
      {ART[id].map((part, i) => (
        <path
          key={i}
          d={part.d}
          pathLength={1}
          className={cn(styles.artPath, part.string && styles.artString)}
          style={{ "--d": `${part.delay}ms`, "--ring": `${part.string ? stringIndex++ * 40 : 0}ms` } as CSSProperties}
        />
      ))}
    </svg>
  );
}
