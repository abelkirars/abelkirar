"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const media = window.matchMedia(REDUCED_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

/**
 * True once the element has entered the viewport (by `amount` of its height).
 * One-shot by design: reveals should play once, not every time you scroll.
 */
export function useInView<T extends Element>(
  amount = 0.35,
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || inView) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // A tall element may never show `amount` of itself on a short phone
        // screen, so filling half the viewport counts as in view too.
        const enough =
          entry.intersectionRatio >= amount || entry.intersectionRect.height >= window.innerHeight * 0.5;
        if (entry.isIntersecting && enough) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [amount, inView]);

  return [ref, inView];
}

/** Live visibility (not one-shot) — for pausing loops that run offscreen. */
export function useVisible<T extends Element>(ref: RefObject<T | null>): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return visible;
}

/**
 * Steps through named phases on a schedule once `active` becomes true.
 * With `instant`, jumps straight to the final phase (reduced motion).
 */
export function usePhases<P extends string>(
  active: boolean,
  schedule: readonly (readonly [P, number])[],
  initial: P,
  instant: boolean,
): P {
  const [phase, setPhase] = useState<P>(initial);
  useEffect(() => {
    if (!active) return;
    const timers = instant
      ? [window.setTimeout(() => setPhase(schedule[schedule.length - 1][0]), 0)]
      : schedule.map(([name, at]) => window.setTimeout(() => setPhase(name), at));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [active, instant, schedule]);
  return phase;
}

/** Calls `callback` with the current timestamp every animation frame while `running`. */
export function useFrameLoop(running: boolean, callback: (now: number) => void) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });
  useEffect(() => {
    if (!running) return;
    let frame = requestAnimationFrame(function loop(now) {
      callbackRef.current(now);
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [running]);
}
