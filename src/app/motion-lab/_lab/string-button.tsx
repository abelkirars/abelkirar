"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./motion-lab.module.css";

type Variant = "primary" | "forest" | "ghost" | "ghostLight";

const VARIANT: Record<Variant, string> = {
  primary: styles.ctaPrimary,
  forest: styles.ctaForest,
  ghost: cn(styles.ctaGhost, styles.travel),
  ghostLight: cn(styles.ctaGhostLight, styles.travel),
};

/**
 * The Abelkirar CTA. Hover draws a hairline "string" under the label and
 * nudges the arrow toward the destination; press compresses slightly; release
 * rings the string once. Touch users get the press + ring (no hover needed).
 */
export function StringButton({
  href,
  variant = "primary",
  arrow = true,
  onClick,
  className,
  children,
}: {
  href?: string;
  variant?: Variant;
  arrow?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  function ring() {
    const element = ref.current;
    if (!element) return;
    element.removeAttribute("data-plucked");
    // Restart the keyframes even on rapid repeat presses.
    void element.offsetWidth;
    element.setAttribute("data-plucked", "");
    window.setTimeout(() => element.removeAttribute("data-plucked"), 640);
  }

  const classes = cn(styles.cta, VARIANT[variant], className);
  const content = (
    <>
      <span>{children}</span>
      {arrow ? <ArrowRight aria-hidden="true" className={cn(styles.ctaArrow, "size-4")} /> : null}
      <span aria-hidden="true" className={styles.ctaString} />
    </>
  );

  if (href) {
    return (
      <Link
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        className={classes}
        onPointerUp={ring}
        onKeyDown={(event) => {
          if (event.key === "Enter") ring();
        }}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type="button"
      className={classes}
      onPointerUp={ring}
      onClick={(event) => {
        // Keyboard activation (Enter/Space) has no pointer event.
        if (event.detail === 0) ring();
        onClick?.();
      }}
    >
      {content}
    </button>
  );
}
