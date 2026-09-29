"use client";

import type { CSSProperties, ReactNode } from "react";
import { useInView } from "./hooks";

/**
 * Marks its subtree `data-reveal="in"` once it scrolls into view. Children
 * stay server-rendered; motion.module.css animates `.revealItem`,
 * `.groupWordInner`, `.groupTrack` and `.revealPhoto` descendants from it.
 * Content is only hidden while scripting is available.
 */
export function RevealOnView({
  as: Tag = "div",
  amount = 0.25,
  className,
  style,
  children,
}: {
  as?: "div" | "section";
  amount?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [ref, inView] = useInView<HTMLDivElement>(amount);
  return (
    <Tag ref={ref as never} className={className} style={style} data-reveal={inView ? "in" : "idle"}>
      {children}
    </Tag>
  );
}
