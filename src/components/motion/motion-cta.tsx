"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./motion.module.css";

export type MotionCtaVariant = "primary" | "forest" | "ghost" | "ghostLight";

const VARIANT: Record<MotionCtaVariant, string> = {
  primary: styles.ctaPrimary,
  forest: styles.ctaForest,
  ghost: cn(styles.ctaGhost, styles.travel),
  ghostLight: cn(styles.ctaGhostLight, styles.travel),
};

/**
 * Marketing-only call to action (a real link). Separate from the site-wide
 * <Button>, which the store, account and admin areas rely on.
 *
 * Hover draws a hairline "string" under the label and nudges the arrow;
 * press compresses slightly; release rings the string once — so touch and
 * keyboard users get the same feedback without hover.
 */
export function MotionCta({
  href,
  variant = "primary",
  arrow = true,
  className,
  children,
}: {
  href: string;
  variant?: MotionCtaVariant;
  arrow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  function ring() {
    const element = ref.current;
    if (!element) return;
    element.removeAttribute("data-plucked");
    // Restart the keyframes even on rapid repeat presses.
    void element.offsetWidth;
    element.setAttribute("data-plucked", "");
    window.setTimeout(() => element.removeAttribute("data-plucked"), 640);
  }

  return (
    <Link
      ref={ref}
      href={href}
      className={cn(styles.cta, VARIANT[variant], className)}
      onPointerUp={ring}
      onKeyDown={(event) => {
        if (event.key === "Enter") ring();
      }}
    >
      <span>{children}</span>
      {arrow ? <ArrowRight aria-hidden="true" className={cn(styles.ctaArrow, "size-4")} /> : null}
      <span aria-hidden="true" className={styles.ctaString} />
    </Link>
  );
}
