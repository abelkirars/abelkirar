"use client";

import { useEffect, useId, useImperativeHandle, useRef, type Ref } from "react";
import { cn } from "@/lib/utils";
import {
  createExcitation,
  envelopePath,
  excitationDisplacement,
  excitationEnergy,
  excitationEnvelope,
  isSettled,
  locateOnString,
  modeWeights,
  pointOnString,
  shapeAt,
  stringPath,
  type Excitation,
  type StringGeometry,
  type Voice,
} from "./string-physics";
import { clamp } from "./tokens";
import styles from "./motion-lab.module.css";

export interface StringSpec extends StringGeometry {
  width: number;
  voice: Voice;
}

export interface PluckOptions {
  position?: number;
  amplitude?: number;
  /** Anticipation in ms: the string is drawn back before it is released. */
  pull?: number;
  delay?: number;
  /** Who plucked: only a visitor's own plucks should make sound. */
  source?: PluckSource;
}

export interface StrumOptions {
  from?: "low" | "high";
  interval?: number;
  amplitude?: number;
  position?: number;
  delay?: number;
  source?: PluckSource;
}

export type PluckSource = "user" | "auto";

/**
 * Fired synchronously when a pluck is requested. `delayMs` is when the
 * string is actually released (after any anticipation), so sound can be
 * scheduled on the audio clock to meet the visible release exactly.
 */
export interface StrikeEvent {
  index: number;
  strength: number;
  delayMs: number;
  source: PluckSource;
}

export interface KirarStringsHandle {
  pluck: (index: number, options?: PluckOptions) => void;
  strum: (options?: StrumOptions) => void;
}

/** Fired at the moment of release, in client coordinates, for ripples. */
export interface PluckEvent {
  index: number;
  clientX: number;
  clientY: number;
  strength: number;
}

const SAMPLES = 32;
const MAX_PULL = 26;
const HIT_PX = 20;
const RETRIGGER_MS = 70;
/** Displacement that counts as a full-strength pluck. */
const FULL_STRENGTH = 16;

function strengthOf(amplitude: number) {
  return clamp(Math.abs(amplitude) / FULL_STRENGTH, 0.12, 1);
}

const TONES = {
  onDark: ["#d7b76e", "#e6cf94", "#f0e3bd"],
  onLight: ["#b89b5e", "#9a7426", "#8a5f10"],
} as const;

function straight(spec: StringGeometry): string {
  return `M${spec.x1} ${spec.y1} L${spec.x2} ${spec.y2}`;
}

interface Grab {
  index: number;
  pointerId: number;
  position: number;
  weights: number[];
  amplitude: number;
}

export function KirarStrings({
  ref,
  strings,
  width,
  height,
  reduced,
  interactive = true,
  pegs = false,
  bridge = false,
  tone = "onDark",
  onPluck,
  onStrike,
  onDamp,
  className,
}: {
  ref?: Ref<KirarStringsHandle>;
  strings: StringSpec[];
  width: number;
  height: number;
  reduced: boolean;
  interactive?: boolean;
  pegs?: boolean;
  bridge?: boolean;
  /** Gold reads pale on forest, deep on ivory. */
  tone?: "onDark" | "onLight";
  onPluck?: (event: PluckEvent) => void;
  onStrike?: (event: StrikeEvent) => void;
  /** A finger landed on string `index` (stops its sound). */
  onDamp?: (index: number) => void;
  className?: string;
}) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const coreRefs = useRef<(SVGPathElement | null)[]>([]);
  const envelopeRefs = useRef<(SVGPathElement | null)[]>([]);
  const groupRefs = useRef<(SVGGElement | null)[]>([]);
  const excitations = useRef<Excitation[][]>(strings.map(() => []));
  const dirty = useRef<boolean[]>(strings.map(() => false));
  const lastPluck = useRef<number[]>(strings.map(() => 0));
  const grab = useRef<Grab | null>(null);
  const last = useRef<{ x: number; y: number; time: number } | null>(null);
  const frame = useRef(0);
  const timers = useRef(new Set<number>());

  // Latest props for callbacks that outlive a render (rAF, timers).
  const live = useRef({ strings, reduced, onPluck, onStrike, onDamp });
  useEffect(() => {
    live.current = { strings, reduced, onPluck, onStrike, onDamp };
  });

  useEffect(() => {
    const pending = timers.current;
    return () => {
      cancelAnimationFrame(frame.current);
      pending.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  function tick(now: number) {
    frame.current = 0;
    let running = false;
    live.current.strings.forEach((spec, i) => {
      const core = coreRefs.current[i];
      const envelope = envelopeRefs.current[i];
      const group = groupRefs.current[i];
      if (!core || !envelope || !group) return;
      const list = excitations.current[i].filter((ex) => !isSettled(now - ex.start, ex, spec.voice));
      excitations.current[i] = list;
      const held = grab.current?.index === i ? grab.current : null;

      if (!list.length && !held) {
        if (dirty.current[i]) {
          core.setAttribute("d", straight(spec));
          envelope.setAttribute("d", "");
          group.style.setProperty("--e", "0");
          dirty.current[i] = false;
        }
        return;
      }

      running = true;
      dirty.current[i] = true;
      const displacement = (u: number) => {
        let y = held ? held.amplitude * shapeAt(u, held.weights) : 0;
        for (const ex of list) y += excitationDisplacement(u, now - ex.start, ex, spec.voice);
        return y;
      };
      const spread = (u: number) => {
        let y = 0;
        for (const ex of list) y += excitationEnvelope(u, now - ex.start, ex, spec.voice);
        return y;
      };
      core.setAttribute("d", stringPath(spec, SAMPLES, displacement));
      envelope.setAttribute("d", envelopePath(spec, SAMPLES / 2, spread));
      const energy = list.reduce(
        (sum, ex) => sum + excitationEnergy(now - ex.start, ex, spec.voice),
        held ? Math.abs(held.amplitude) * 0.6 : 0,
      );
      group.style.setProperty("--e", String(Math.min(1, energy / 14)));
    });
    if (running) frame.current = requestAnimationFrame(tick);
  }

  function wake() {
    if (!frame.current) frame.current = requestAnimationFrame(tick);
  }

  function later(callback: () => void, ms: number) {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      callback();
    }, ms);
    timers.current.add(timer);
  }

  function notify(index: number, position: number, amplitude: number, afterMs: number) {
    const handler = live.current.onPluck;
    const svg = svgRef.current;
    const spec = live.current.strings[index];
    if (!handler || !svg || !spec) return;
    later(() => {
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const local = pointOnString(spec, position, 0);
      const point = new DOMPoint(local.x, local.y).matrixTransform(ctm);
      handler({ index, clientX: point.x, clientY: point.y, strength: clamp(Math.abs(amplitude) / MAX_PULL, 0.15, 1) });
    }, afterMs);
  }

  /** Reduced motion: acknowledge the pluck with light, not movement. */
  function glow(index: number) {
    coreRefs.current[index]?.animate([{ strokeOpacity: 1 }, { strokeOpacity: 0.62 }], {
      duration: 700,
      easing: "ease-out",
    });
  }

  function pluck(
    index: number,
    { position = 0.5, amplitude = 10, pull = 0, delay = 0, source = "auto" }: PluckOptions = {},
  ) {
    const specs = live.current.strings;
    if (!specs[index]) return;
    live.current.onStrike?.({ index, strength: strengthOf(amplitude), delayMs: delay + pull, source });
    if (live.current.reduced) {
      later(() => glow(index), delay);
      notify(index, position, amplitude, delay);
      return;
    }
    const start = performance.now() + delay;
    const list = excitations.current[index];
    list.push(createExcitation({ start, position, amplitude, pull }));
    if (list.length > 4) list.shift();
    // Sympathetic resonance: neighbours answer with a whisper of movement.
    for (const neighbour of [index - 1, index + 1]) {
      if (!specs[neighbour]) continue;
      excitations.current[neighbour].push(
        createExcitation({ start: start + pull + 45, position: 0.5, amplitude: amplitude * 0.07, pull: 0 }),
      );
    }
    wake();
    notify(index, position, amplitude, delay + pull);
  }

  function strum({
    from = "low",
    interval = 70,
    amplitude = 9,
    position = 0.55,
    delay = 0,
    source = "auto",
  }: StrumOptions = {}) {
    const count = live.current.strings.length;
    for (let k = 0; k < count; k++) {
      const index = from === "low" ? k : count - 1 - k;
      pluck(index, {
        position: position + (k % 2 ? 0.03 : -0.03),
        amplitude: amplitude * (1 - k * 0.06),
        delay: delay + k * interval,
        source,
      });
    }
  }

  useImperativeHandle(ref, () => ({ pluck, strum }));

  function toLocal(clientX: number, clientY: number) {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y, scale: ctm.a || 1 };
  }

  /** `silent`: the gesture was taken over (e.g. page scroll) — no sound. */
  function release(pointerId: number, silent = false) {
    const held = grab.current;
    if (!held || held.pointerId !== pointerId) return;
    grab.current = null;
    svgRef.current?.removeAttribute("data-grabbing");
    if (!silent) {
      live.current.onStrike?.({ index: held.index, strength: strengthOf(held.amplitude), delayMs: 0, source: "user" });
    }
    const start = performance.now();
    excitations.current[held.index].push(
      createExcitation({ start, position: held.position, amplitude: held.amplitude, pull: 0 }),
    );
    wake();
    notify(held.index, held.position, held.amplitude, 0);
  }

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (!interactive) return;
    const p = toLocal(event.clientX, event.clientY);
    if (!p) return;
    last.current = { x: p.x, y: p.y, time: event.timeStamp };
    const tolerance = HIT_PX / p.scale;
    let index = -1;
    let distance = Infinity;
    let u = 0;
    live.current.strings.forEach((spec, i) => {
      const hit = locateOnString(spec, p.x, p.y);
      if (hit.u < 0.04 || hit.u > 0.96 || Math.abs(hit.distance) > tolerance) return;
      if (Math.abs(hit.distance) < Math.abs(distance)) {
        index = i;
        distance = hit.distance;
        u = hit.u;
      }
    });
    if (index < 0) return;
    if (live.current.reduced) {
      pluck(index, { position: u, source: "user" });
      return;
    }
    // The finger lands on the string: whatever it was ringing stops.
    live.current.onDamp?.(index);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.setAttribute("data-grabbing", "");
    const position = clamp(u, 0.08, 0.92);
    grab.current = {
      index,
      pointerId: event.pointerId,
      position,
      weights: modeWeights(position),
      amplitude: clamp(distance, -MAX_PULL, MAX_PULL),
    };
    wake();
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!interactive) return;
    const p = toLocal(event.clientX, event.clientY);
    if (!p) return;
    const held = grab.current;
    if (held && held.pointerId === event.pointerId) {
      const spec = live.current.strings[held.index];
      const { distance } = locateOnString(spec, p.x, p.y);
      if (Math.abs(distance) > MAX_PULL) {
        // Pulled too far: the string slips off the finger.
        held.amplitude = Math.sign(distance) * MAX_PULL;
        release(event.pointerId);
      } else {
        held.amplitude = distance;
        wake();
      }
      last.current = { x: p.x, y: p.y, time: event.timeStamp };
      return;
    }

    const previous = last.current;
    last.current = { x: p.x, y: p.y, time: event.timeStamp };
    if (!previous) return;
    // Mouse strums on hover; touch and pen strum only while pressed.
    if (event.pointerType !== "mouse" && event.buttons === 0) return;
    const dt = Math.max(8, event.timeStamp - previous.time);
    const speed = Math.hypot(p.x - previous.x, p.y - previous.y) / dt;
    const isMouse = event.pointerType === "mouse";
    const magnitude = clamp(speed * (isMouse ? 9 : 12), 2.5, isMouse ? 8 : 12);
    // A fast sweep can cross several strings between two pointer events.
    // Interpolate where in that interval each string was crossed, so plucks
    // (and their sounds) keep their true spacing rather than firing at once.
    const crossings: { index: number; u: number; at: number; sign: number }[] = [];
    live.current.strings.forEach((spec, index) => {
      const a = locateOnString(spec, previous.x, previous.y);
      const b = locateOnString(spec, p.x, p.y);
      if (a.distance === 0 || Math.sign(a.distance) === Math.sign(b.distance)) return;
      const at = a.distance / (a.distance - b.distance);
      const u = a.u + (b.u - a.u) * at;
      if (u < 0.05 || u > 0.95) return;
      crossings.push({ index, u, at, sign: Math.sign(b.distance) });
    });
    if (!crossings.length) return;
    const first = Math.min(...crossings.map((c) => c.at));
    const now = performance.now();
    for (const crossing of crossings) {
      if (now - lastPluck.current[crossing.index] < RETRIGGER_MS) continue;
      lastPluck.current[crossing.index] = now;
      pluck(crossing.index, {
        position: crossing.u,
        amplitude: crossing.sign * magnitude,
        delay: (crossing.at - first) * dt,
        source: "user",
      });
    }
  }

  function onPointerEnd(event: React.PointerEvent<SVGSVGElement>) {
    // pointercancel means the browser took the gesture (usually to scroll).
    release(event.pointerId, event.type === "pointercancel");
    if (event.type !== "pointerup") last.current = null;
  }

  const [edge, body, centre] = TONES[tone];
  const first = strings[0];
  const lastString = strings[strings.length - 1];

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn(styles.strings, className)}
      data-static={interactive ? undefined : ""}
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerEnd}
    >
      <defs>
        {strings.map((spec, i) => (
          <linearGradient
            key={i}
            id={`${id}-string-${i}`}
            gradientUnits="userSpaceOnUse"
            x1={spec.x1}
            y1={spec.y1}
            x2={spec.x2}
            y2={spec.y2}
          >
            <stop offset="0" stopColor={edge} stopOpacity="0.08" />
            <stop offset="0.14" stopColor={body} stopOpacity="0.95" />
            <stop offset="0.5" stopColor={centre} stopOpacity="1" />
            <stop offset="0.86" stopColor={body} stopOpacity="0.95" />
            <stop offset="1" stopColor={edge} stopOpacity="0.08" />
          </linearGradient>
        ))}
      </defs>

      {bridge && first && lastString ? (
        <path
          d={`M${first.x1 - 10} ${first.y1} L${lastString.x1 + 10} ${lastString.y1}`}
          stroke="#b89b5e"
          strokeOpacity="0.45"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : null}

      {strings.map((spec, i) => (
        <g
          key={i}
          ref={(element) => {
            groupRefs.current[i] = element;
          }}
        >
          <path
            ref={(element) => {
              envelopeRefs.current[i] = element;
            }}
            className={styles.stringEnvelope}
            fill={`url(#${id}-string-${i})`}
            d=""
          />
          <path
            ref={(element) => {
              coreRefs.current[i] = element;
            }}
            className={styles.stringCore}
            stroke={`url(#${id}-string-${i})`}
            strokeWidth={spec.width}
            d={straight(spec)}
          />
        </g>
      ))}

      {pegs
        ? strings.map((spec, i) => (
            <circle key={i} cx={spec.x2} cy={spec.y2} r={2.6} fill="#d7b76e" fillOpacity="0.6" />
          ))
        : null}
    </svg>
  );
}
