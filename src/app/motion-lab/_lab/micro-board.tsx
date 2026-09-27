"use client";

import Image from "next/image";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CrossPattern } from "@/components/marketing/cross-pattern";
import { useInView } from "./hooks";
import { Fade } from "./reveal";
import { StringButton } from "./string-button";
import type { LabCopy } from "./copy";
import styles from "./motion-lab.module.css";

function Tile({
  title,
  note,
  dark,
  className,
  children,
  active,
  delay,
}: {
  title: string;
  note: string;
  dark?: boolean;
  className?: string;
  children: ReactNode;
  active: boolean;
  delay: number;
}) {
  return (
    <Fade active={active} delay={delay} className={cn(styles.tile, dark && styles.tileDark, "flex flex-col p-5 sm:p-6", className)}>
      <div className="flex flex-1 flex-wrap items-center justify-center gap-3 py-6">{children}</div>
      <div className={cn("border-t pt-4", dark ? "border-white/10" : "border-[#ddd6c6]")}>
        <p className="text-sm font-semibold">{title}</p>
        <p className={cn("mt-1 text-sm", dark ? "text-[#faf7ef]/60" : "text-[#52615a]")}>{note}</p>
      </div>
    </Fade>
  );
}

function placeIndicator(nav: HTMLElement | null, item: HTMLElement | null | undefined) {
  if (!nav || !item) return;
  nav.style.setProperty("--x", `${item.offsetLeft + 12}px`);
  nav.style.setProperty("--w", String(Math.max(0, item.offsetWidth - 24)));
}

function NavDemo({ items }: { items: string[] }) {
  const [current, setCurrent] = useState(1);
  const navRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function moveTo(index: number) {
    placeIndicator(navRef.current, itemRefs.current[index]);
  }

  useLayoutEffect(() => {
    const place = () => placeIndicator(navRef.current, itemRefs.current[current]);
    place();
    const observer = new ResizeObserver(place);
    if (navRef.current) observer.observe(navRef.current);
    return () => observer.disconnect();
  }, [current]);

  return (
    <div ref={navRef} className={cn(styles.navDemo, "w-full")} onPointerLeave={() => moveTo(current)}>
      {items.map((label, index) => (
        <button
          key={label}
          ref={(element) => {
            itemRefs.current[index] = element;
          }}
          type="button"
          className={styles.navItem}
          aria-current={index === current ? "page" : undefined}
          onPointerEnter={() => moveTo(index)}
          onFocus={() => moveTo(index)}
          onBlur={() => moveTo(current)}
          onClick={() => setCurrent(index)}
        >
          {label}
        </button>
      ))}
      <span aria-hidden="true" className={styles.navIndicator} />
    </div>
  );
}

function Segmented({ options, label }: { options: string[]; label: string }) {
  const [selected, setSelected] = useState(0);
  return (
    <div
      role="group"
      aria-label={label}
      className={styles.segmented}
      style={{ "--i": selected, "--n": options.length } as CSSProperties}
    >
      <span aria-hidden="true" className={styles.segPill} />
      {options.map((option, index) => (
        <button
          key={option}
          type="button"
          aria-pressed={index === selected}
          className={styles.segButton}
          onClick={() => setSelected(index)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function MicroBoard({ copy }: { copy: LabCopy }) {
  const [ref, inView] = useInView<HTMLDivElement>(0.1);
  const beginner = copy.courses[0];
  const step = 90;

  return (
    <section className="bg-[#fbf6ec] py-16 sm:py-24" aria-label="Microinteractions">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className={cn(styles.sectionLabel, "text-[#8a5f10]")}>Microinteractions</p>
          <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Every movement answers something the visitor did.
          </h2>
          <p className="mt-4 text-[#52615a]">
            Hover is a preview, never a requirement — each of these gives press or focus feedback on touch and keyboard too.
          </p>
        </div>

        <div ref={ref} className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Tile active={inView} delay={0} dark title="Primary action" note="Hairline string draws toward the arrow; release rings it once.">
            <StringButton variant="primary">{copy.hero.startLearning}</StringButton>
          </Tile>

          <Tile active={inView} delay={step} dark title="Secondary action" note="A gold highlight travels the border once, then rests.">
            <StringButton variant="ghost" arrow={false}>
              {copy.hero.contactAbel}
            </StringButton>
          </Tile>

          <Tile active={inView} delay={step * 2} title="On light surfaces" note="Forest fill on ivory; the string turns gold.">
            <StringButton variant="forest">{copy.plan.continue}</StringButton>
            <StringButton variant="ghostLight" arrow={false}>
              {copy.hero.contactAbel}
            </StringButton>
          </Tile>

          <Tile active={inView} delay={step * 3} title="Navigation" note="The underline follows intent, then returns to where you are." className="sm:col-span-2">
            <NavDemo items={copy.nav.map((n) => n.label)} />
          </Tile>

          <Tile active={inView} delay={step * 4} title="Format toggle" note="One weighted pill slides between choices — no bounce.">
            <Segmented options={["Small Group", "1-to-1"]} label="Lesson format" />
          </Tile>

          <Tile active={inView} delay={step * 5} title="Text link" note="Underline strengthens left to right; arrow leans forward.">
            <a href="#" onClick={(event) => event.preventDefault()} className={cn(styles.textLink, "text-[#182d24]")}>
              <span className={styles.textLinkLabel}>View course overview</span>
              <ArrowRight aria-hidden="true" className={cn(styles.ctaArrow, "size-4")} />
            </a>
          </Tile>

          <Tile active={inView} delay={step * 6} title="Instrument card" note="Slow photographic push-in and a gold rule — the card is a link, so it may respond.">
            <a
              href="#"
              onClick={(event) => event.preventDefault()}
              className={cn(styles.productCard, "w-full max-w-[15rem] text-left")}
            >
              <div className={styles.productMedia}>
                <div className={styles.productMediaInner}>
                  <Image
                    src="/mission-kirar.png"
                    alt="Kirar"
                    fill
                    sizes="240px"
                    className="object-cover object-[18%_50%]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <CrossPattern className="text-[#f3e9d2] opacity-[0.08]" />
                </div>
                <span aria-hidden="true" className={styles.productRule} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="font-heading text-xl font-semibold">Kirar</span>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  {copy.store.view}
                  <ArrowRight aria-hidden="true" className={cn(styles.ctaArrow, "size-4")} />
                </span>
              </div>
            </a>
          </Tile>

          <Tile active={inView} delay={step * 7} dark title="Scroll indicator" note="A bead travels one string, calmly. Stops under reduced motion.">
            <div className="flex flex-col items-center gap-2.5 text-[0.62rem] tracking-[0.3em] text-[#faf7ef]/55 uppercase">
              <span>Scroll</span>
              <span className={styles.scrollCueLine}>
                <span className={styles.scrollCueBead} />
              </span>
            </div>
          </Tile>

          <Tile active={inView} delay={step * 8} title="Level glyph" note={`Hairlines lit by level (${beginner.level} → 1). Hover a course card and they ring.`}>
            <div className="flex items-end gap-6">
              {[1, 2, 3].map((lit) => (
                <span key={lit} className={styles.levelGlyph}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={styles.levelTick}
                      data-lit={i < lit ? "" : undefined}
                      style={{ scale: "1 1" }}
                    />
                  ))}
                </span>
              ))}
            </div>
          </Tile>
        </div>
      </div>
    </section>
  );
}
