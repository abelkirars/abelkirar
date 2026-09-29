"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import styles from "./motion.module.css";

type RevealTag = "h1" | "h2" | "h3" | "p" | "span" | "div";

/**
 * Scroll-triggered masked headline reveal, for sections below the fold.
 * (Above-the-fold headlines use the CSS-only first-paint reveal instead.)
 *
 * Words rise from behind their own baseline mask. Delays are line-aware:
 * each word gets delay + lineIndex × lineStagger + indexInLine × wordStagger,
 * re-measured when web fonts finish loading.
 *
 * Content is only hidden while scripting is available (see motion.module.css),
 * so it is never lost if JavaScript fails to run.
 */
export function RevealText({
  as: Tag = "span",
  text,
  active,
  delay = 0,
  lineStagger = 110,
  wordStagger = 45,
  className,
}: {
  as?: RevealTag;
  text: string;
  active: boolean;
  delay?: number;
  lineStagger?: number;
  wordStagger?: number;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const words = Array.from(element.querySelectorAll<HTMLElement>("[data-word]"));
      let line = -1;
      let lastTop = -Infinity;
      let indexInLine = 0;
      for (const word of words) {
        const top = word.offsetTop;
        if (top > lastTop + 2) {
          line += 1;
          indexInLine = 0;
          lastTop = top;
        } else {
          indexInLine += 1;
        }
        (word.firstElementChild as HTMLElement | null)?.style.setProperty(
          "--d",
          `${delay + line * lineStagger + indexInLine * wordStagger}ms`,
        );
      }
    };
    measure();
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [text, delay, lineStagger, wordStagger]);

  const words = text.split(/\s+/).filter(Boolean);

  return (
    <Tag ref={ref as never} className={cn(styles.reveal, className)} data-reveal={active ? "in" : "idle"}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`}>
          <span data-word className={styles.word}>
            <span className={styles.wordInner}>{word}</span>
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </Tag>
  );
}

/** Secondary copy: short rise and fade, no mask. */
export function Fade({
  as: Tag = "div",
  active,
  delay = 0,
  className,
  children,
  style,
}: {
  as?: RevealTag;
  active: boolean;
  delay?: number;
  className?: string;
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Tag
      className={cn(styles.fade, className)}
      data-reveal={active ? "in" : "idle"}
      style={{ ...style, "--d": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

/** Uppercase eyebrow whose tracking settles in as it appears. Single line. */
export function Eyebrow({
  active,
  delay = 0,
  className,
  children,
}: {
  active: boolean;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(styles.track, className)}
      data-reveal={active ? "in" : "idle"}
      style={{ "--d": `${delay}ms` } as CSSProperties}
    >
      {children}
    </p>
  );
}
