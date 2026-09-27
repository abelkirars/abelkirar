/**
 * 1080×1920 vertical title sequence — the schedule and the maths.
 *
 * Everything on the social stage is a pure function of `t` (seconds). That
 * makes the preview scrubbable, testable, and directly portable to a
 * frame-based renderer later (e.g. Remotion: t = frame / fps).
 *
 * The sequence ends in exactly the state it starts in — one gold string at
 * rest — so it loops seamlessly on Reels / TikTok / Shorts, which autoplay on
 * repeat.
 */
import {
  createExcitation,
  excitationDisplacement,
  excitationEnvelope,
  pentatonicVoices,
  type Excitation,
} from "./string-physics";
import { clamp, ease, lerp } from "./tokens";

export const SOCIAL = {
  width: 1080,
  height: 1920,
  duration: 15,
  fps: 30,
  /**
   * Conservative platform UI safe area (px): the top clears status bars and
   * tabs, the bottom clears captions and audio labels, the right clears the
   * like/comment/share rail.
   */
  safe: { top: 250, bottom: 420, left: 120, right: 160 },
} as const;

/** Copy used on the stage. Mirrors messages/en.json (hero, courseLevels). */
export const SOCIAL_COPY = {
  wordmark: ["ABEL", "KIRAR"],
  subline: "Online Kirar Lessons",
  message: ["Learn Kirar", "for Orthodox", "chanting."],
  messageSub: "Learn online with Deacon Abel.",
  levels: [
    { level: "Level 1", title: "Beginner", tagline: "Build your foundation" },
    { level: "Level 2", title: "Intermediate", tagline: "Strengthen your playing" },
    { level: "Level 3", title: "Advanced", tagline: "Prepare to serve" },
  ],
  cta: "Start Learning",
  url: "abelkirar.com",
} as const;

export interface Scene {
  id: string;
  label: string;
  start: number;
  end: number;
}

export const SCENES: Scene[] = [
  { id: "hook", label: "Hook — the pluck", start: 0, end: 1.6 },
  { id: "wordmark", label: "ABEL KIRAR", start: 1.6, end: 4.7 },
  { id: "message", label: "Learn Kirar for Orthodox chanting", start: 4.7, end: 8.5 },
  { id: "levels", label: "Beginner · Intermediate · Advanced", start: 8.5, end: 12.2 },
  { id: "cta", label: "Start Learning · abelkirar.com", start: 12.2, end: 15 },
];

/** Beat-quantised cue points (seconds). */
export const CUES = {
  hookPull: 0.12,
  hookRelease: 0.46,
  ringStart: 0.46,
  fanOpen: [1.3, 2.2],
  wordmarkIn: [1.7, 1.86],
  ruleDraw: [2.55, 3.15],
  sublineIn: 2.75,
  wordmarkOut: 4.25,
  messageLines: [4.78, 5.14, 5.5],
  messageSubIn: 6.3,
  messageOut: 8.05,
  levelRows: [8.66, 9.38, 10.1],
  levelsOut: 11.75,
  ctaIn: 12.36,
  urlIn: 12.8,
  fanClose: [13.7, 14.5],
  ctaOut: 14.5,
  handDamp: [14.1, 14.8],
} as const;

/** Eased 0→1 progress of a segment starting at `start` lasting `duration`. */
export function segment(
  t: number,
  start: number,
  duration: number,
  curve: (x: number) => number = ease.pluck,
): number {
  return curve(clamp((t - start) / duration, 0, 1));
}

/** 1 while inside [in, out), with eased edges. */
export function presence(
  t: number,
  inStart: number,
  inDuration: number,
  outStart: number,
  outDuration: number,
): number {
  return segment(t, inStart, inDuration, ease.settle) * (1 - segment(t, outStart, outDuration, ease.release));
}

export const STRING_COUNT = 5;
export const STRING_TOP = -60;
export const STRING_BOTTOM = SOCIAL.height + 60;
const FAN_X = [372, 456, 540, 624, 708];
const CENTER = 2;

// Slower than the web strings: 30fps exports need ≤ ~6Hz to read cleanly.
export const SOCIAL_VOICES = pentatonicVoices(3.1, 1.15);

interface ScheduledPluck {
  at: number;
  string: number;
  position: number;
  amplitude: number;
  pull: number;
}

const PLUCKS: ScheduledPluck[] = [
  // Hook: a long, visible anticipation, then release.
  { at: CUES.hookPull, string: CENTER, position: 0.58, amplitude: 38, pull: (CUES.hookRelease - CUES.hookPull) * 1000 },
  { at: CUES.wordmarkIn[0], string: 1, position: 0.46, amplitude: 11, pull: 0 },
  { at: CUES.wordmarkIn[1], string: 3, position: 0.52, amplitude: 11, pull: 0 },
  ...CUES.messageLines.map((at, i) => ({ at, string: [0, 2, 4][i], position: 0.4 + i * 0.06, amplitude: 13, pull: 0 })),
  { at: CUES.levelRows[0], string: 2, position: 0.36, amplitude: 12, pull: 0 },
  { at: CUES.levelRows[1], string: 1, position: 0.5, amplitude: 11, pull: 0 },
  { at: CUES.levelRows[1] + 0.06, string: 3, position: 0.5, amplitude: 11, pull: 0 },
  { at: CUES.levelRows[2], string: 0, position: 0.62, amplitude: 11, pull: 0 },
  { at: CUES.levelRows[2] + 0.06, string: 4, position: 0.62, amplitude: 11, pull: 0 },
  { at: CUES.ctaIn, string: 2, position: 0.47, amplitude: 12, pull: 0 },
];

const EXCITATIONS: { string: number; excitation: Excitation }[] = PLUCKS.map((p) => ({
  string: p.string,
  excitation: createExcitation({ start: p.at * 1000, position: p.position, amplitude: p.amplitude, pull: p.pull }),
}));

/** How far the five strings have fanned out from the single centre string. */
export function fanAt(t: number): number {
  return (
    segment(t, CUES.fanOpen[0], CUES.fanOpen[1] - CUES.fanOpen[0], ease.resonate) *
    (1 - segment(t, CUES.fanClose[0], CUES.fanClose[1] - CUES.fanClose[0], ease.resonate))
  );
}

/** The player's hand settling the strings before the loop point. */
export function dampAt(t: number): number {
  return 1 - segment(t, CUES.handDamp[0], CUES.handDamp[1] - CUES.handDamp[0], ease.settle);
}

/** Level-driven highlight per string: Beginner lights 1, Intermediate 3, Advanced 5. */
export function litAt(t: number, index: number): number {
  const distance = Math.abs(index - CENTER);
  const on = CUES.levelRows[distance] ?? Infinity;
  return segment(t, on, 0.5, ease.settle) * (1 - segment(t, CUES.levelsOut + 0.2, 0.7, ease.release));
}

export interface StringState {
  x: number;
  opacity: number;
  lit: number;
  displacement: (u: number) => number;
  envelope: (u: number) => number;
}

export function stringStateAt(t: number, index: number): StringState {
  const fan = fanAt(t);
  const x = lerp(SOCIAL.width / 2, FAN_X[index], fan);
  const base = index === CENTER ? 0.9 : 0.34 * fan;
  const lit = litAt(t, index);
  const damp = dampAt(t);
  const voice = SOCIAL_VOICES[index];
  const mine = EXCITATIONS.filter((e) => e.string === index);
  const ms = t * 1000;
  return {
    x,
    opacity: Math.min(1, base + lit * 0.5),
    lit,
    displacement: (u) =>
      damp * mine.reduce((sum, { excitation }) => sum + excitationDisplacement(u, ms - excitation.start, excitation, voice), 0),
    envelope: (u) =>
      damp * mine.reduce((sum, { excitation }) => sum + excitationEnvelope(u, ms - excitation.start, excitation, voice), 0),
  };
}

/** Expanding resonance ring from the hook pluck. */
export function ringAt(t: number): { radius: number; opacity: number } {
  const p = segment(t, CUES.ringStart, 1.5, ease.pluck);
  const radius = lerp(8, 760, p);
  const opacity =
    0.32 * segment(t, CUES.ringStart, 0.15, ease.linear) * (1 - segment(t, CUES.ringStart, 1.5, ease.linear));
  return { radius, opacity };
}

export function activeScene(t: number): Scene {
  return SCENES.find((s) => t >= s.start && t < s.end) ?? SCENES[SCENES.length - 1];
}

export function formatTimecode(t: number, fps: number = SOCIAL.fps): string {
  const whole = Math.floor(t);
  const frame = Math.floor((t - whole) * fps);
  return `${String(whole).padStart(2, "0")}:${String(frame).padStart(2, "0")}`;
}
