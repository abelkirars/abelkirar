/**
 * A small, deterministic plucked-string model.
 *
 * A string plucked at position p starts as a triangle and vibrates as the sum
 * of its harmonics. Each harmonic's weight follows the ideal plucked-string
 * series (sin(nπp) / n²), and higher harmonics die faster than the
 * fundamental — so the sharp corner of the pluck rounds off within a few
 * frames and the string settles into a soft, slow sway before coming to rest.
 *
 * Frequencies are "visual" frequencies (a few Hz), not audio frequencies: at
 * 60fps the eye reads them as vibration without strobing. Everything here is a
 * pure function of elapsed time, so the same model drives interactive strings
 * (requestAnimationFrame) and time-scrubbed video scenes identically.
 */

export interface Voice {
  /** Fundamental, in visual Hz. Keep ≤ ~6 for 30fps video exports. */
  frequency: number;
  /** Fundamental decay constant, seconds. */
  decay: number;
}

export interface Excitation {
  /** Start time in ms (any clock, as long as elapsed is measured on it). */
  start: number;
  /** Where along the string it was plucked, 0–1. */
  position: number;
  /** Peak displacement at the pluck point, in the string's own units. Signed. */
  amplitude: number;
  /** Anticipation: ms spent pulling the string before release. 0 = struck. */
  pull: number;
  /** Harmonic weights for this pluck position (see modeWeights). */
  weights: number[];
}

export interface StringGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const MODE_COUNT = 6;
/** How much faster each successive harmonic decays than the fundamental. */
const HIGH_MODE_DAMPING = 1.15;
const SETTLED_THRESHOLD = 0.02;

/**
 * Harmonic weights for a pluck at `position`, normalised so the initial shape
 * reaches exactly 1 at the pluck point (a finite series otherwise undershoots).
 */
export function modeWeights(position: number, modes = MODE_COUNT): number[] {
  const p = Math.min(0.95, Math.max(0.05, position));
  const raw = Array.from({ length: modes }, (_, i) => {
    const n = i + 1;
    return Math.sin(n * Math.PI * p) / (n * n);
  });
  const apex = raw.reduce((sum, w, i) => sum + w * Math.sin((i + 1) * Math.PI * p), 0);
  return raw.map((w) => w / apex);
}

/** The pluck shape at u (0–1) for the given weights; 1 at the pluck point. */
export function shapeAt(u: number, weights: number[]): number {
  let y = 0;
  for (let i = 0; i < weights.length; i++) {
    y += weights[i] * Math.sin((i + 1) * Math.PI * u);
  }
  return y;
}

export function createExcitation(input: Omit<Excitation, "weights">): Excitation {
  return { ...input, weights: modeWeights(input.position) };
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

function modeDecay(voice: Voice, n: number): number {
  return voice.decay / (1 + HIGH_MODE_DAMPING * (n - 1));
}

/** Displacement at u for one excitation, `elapsedMs` after it began. */
export function excitationDisplacement(
  u: number,
  elapsedMs: number,
  excitation: Excitation,
  voice: Voice,
): number {
  if (elapsedMs < 0) return 0;
  const { weights, amplitude, pull } = excitation;
  if (elapsedMs < pull) {
    // Anticipation: the string is drawn into the pluck shape before release.
    return amplitude * easeOutCubic(elapsedMs / pull) * shapeAt(u, weights);
  }
  const t = (elapsedMs - pull) / 1000;
  let y = 0;
  for (let i = 0; i < weights.length; i++) {
    const n = i + 1;
    y +=
      weights[i] *
      Math.sin(n * Math.PI * u) *
      Math.cos(2 * Math.PI * n * voice.frequency * t) *
      Math.exp(-t / modeDecay(voice, n));
  }
  return amplitude * y;
}

/**
 * The swept envelope at u — what the eye actually sees on a real vibrating
 * string: a soft lens of blur around the moving line.
 */
export function excitationEnvelope(
  u: number,
  elapsedMs: number,
  excitation: Excitation,
  voice: Voice,
): number {
  // A held string is still: no motion blur until it is released.
  if (elapsedMs < excitation.pull) return 0;
  const t = (elapsedMs - excitation.pull) / 1000;
  let y = 0;
  for (let i = 0; i < excitation.weights.length; i++) {
    const n = i + 1;
    y += Math.abs(excitation.weights[i] * Math.sin(n * Math.PI * u)) * Math.exp(-t / modeDecay(voice, n));
  }
  return Math.abs(excitation.amplitude) * y;
}

/** Remaining energy as a peak displacement, for brightness and cleanup. */
export function excitationEnergy(elapsedMs: number, excitation: Excitation, voice: Voice): number {
  if (elapsedMs < 0) return 0;
  if (elapsedMs < excitation.pull) {
    return Math.abs(excitation.amplitude) * easeOutCubic(elapsedMs / excitation.pull);
  }
  const t = (elapsedMs - excitation.pull) / 1000;
  return Math.abs(excitation.amplitude) * Math.exp(-t / voice.decay);
}

export function isSettled(elapsedMs: number, excitation: Excitation, voice: Voice): boolean {
  // A pluck scheduled for the future is pending, not settled.
  if (elapsedMs < excitation.pull) return false;
  return excitationEnergy(elapsedMs, excitation, voice) < SETTLED_THRESHOLD;
}

function unitVectors(g: StringGeometry) {
  const dx = g.x2 - g.x1;
  const dy = g.y2 - g.y1;
  const length = Math.hypot(dx, dy) || 1;
  const along = { x: dx / length, y: dy / length };
  return { length, along, normal: { x: -along.y, y: along.x } };
}

/** Signed perpendicular distance from the string and position along it (0–1). */
export function locateOnString(g: StringGeometry, x: number, y: number) {
  const { length, along, normal } = unitVectors(g);
  const px = x - g.x1;
  const py = y - g.y1;
  return {
    distance: px * normal.x + py * normal.y,
    u: (px * along.x + py * along.y) / length,
  };
}

/** Screen-space point on the string at u with a perpendicular offset. */
export function pointOnString(g: StringGeometry, u: number, offset: number) {
  const { normal } = unitVectors(g);
  return {
    x: g.x1 + (g.x2 - g.x1) * u + normal.x * offset,
    y: g.y1 + (g.y2 - g.y1) * u + normal.y * offset,
  };
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Smooth open path through the displaced string (quadratic midpoint spline). */
export function stringPath(
  g: StringGeometry,
  samples: number,
  displacement: (u: number) => number,
): string {
  const points = Array.from({ length: samples + 1 }, (_, i) => {
    const u = i / samples;
    return pointOnString(g, u, displacement(u));
  });
  let d = `M${round(points[0].x)} ${round(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    d += ` Q${round(points[i].x)} ${round(points[i].y)} ${round(mx)} ${round(my)}`;
  }
  const last = points[points.length - 1];
  d += ` L${round(last.x)} ${round(last.y)}`;
  return d;
}

/** Closed lens-shaped path covering ±envelope around the string. */
export function envelopePath(
  g: StringGeometry,
  samples: number,
  envelope: (u: number) => number,
): string {
  const forward: string[] = [];
  const back: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const e = envelope(u);
    const a = pointOnString(g, u, e);
    const b = pointOnString(g, u, -e);
    forward.push(`${round(a.x)} ${round(a.y)}`);
    back.unshift(`${round(b.x)} ${round(b.y)}`);
  }
  return `M${forward.join(" L")} L${back.join(" L")} Z`;
}

/**
 * Five-string voices tuned to the ratios of a major pentatonic scale — the
 * family the Kirar's qenet tunings are built from — so neighbouring strings
 * visibly vibrate at related but different rates. Lowest string first.
 */
export const PENTATONIC_RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3] as const;

export function pentatonicVoices(baseFrequency: number, baseDecay: number): Voice[] {
  return PENTATONIC_RATIOS.map((ratio, i) => ({
    frequency: baseFrequency * ratio,
    // Higher, thinner strings ring slightly shorter.
    decay: baseDecay * (1 - i * 0.07),
  }));
}
