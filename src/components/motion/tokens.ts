/**
 * Abelkirar motion tokens.
 *
 * The motion language is built on one physical idea — a plucked string:
 * a short attack, a long decelerating sustain, then rest.
 *
 * Mirrored as CSS custom properties in motion.module.css (`.scope`).
 * Keep both in sync.
 */

export type Bezier = readonly [number, number, number, number];

export const EASE = {
  /** Attack → long sustain. Entrances, reveals, anything arriving. */
  pluck: [0.16, 1, 0.3, 1],
  /** Symmetric, weighted. Lines drawing, state-to-state travel. */
  resonate: [0.65, 0, 0.35, 1],
  /** Gentle settle, no overshoot. UI state changes (select, hover). */
  settle: [0.22, 1, 0.36, 1],
  /** Quiet, quick departure. Exits are always shorter than entrances. */
  release: [0.5, 0, 0.75, 0],
} as const satisfies Record<string, Bezier>;

/**
 * Evaluates a CSS-style cubic-bezier timing function in JS, so time-driven
 * scenes (social stage, lower third) share the exact curves the CSS uses.
 */
export function cubicBezier([x1, y1, x2, y2]: Bezier): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-6) return sampleY(t);
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const value = sampleX(t);
      if (Math.abs(value - x) < 1e-6) break;
      if (value < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

export const ease = {
  pluck: cubicBezier(EASE.pluck),
  resonate: cubicBezier(EASE.resonate),
  settle: cubicBezier(EASE.settle),
  release: cubicBezier(EASE.release),
  linear: (x: number) => Math.min(1, Math.max(0, x)),
} as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
