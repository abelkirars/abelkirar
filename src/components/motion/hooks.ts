"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

/** Live result of a CSS media query; `false` during server rendering. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
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
