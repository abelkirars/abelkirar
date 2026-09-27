"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { useInView } from "./hooks";
import { InstrumentArt, type InstrumentId } from "./instrument-art";
import { Eyebrow, Fade, RevealText } from "./reveal";
import { StringButton } from "./string-button";
import type { LabCopy } from "./copy";
import styles from "./motion-lab.module.css";

export interface InstrumentCopy {
  id: InstrumentId;
  name: string;
  description: string;
  shop: string;
}

/**
 * Writes a scroll-linked CSS variable (px) while the element is on screen:
 * -range when its centre is at the bottom of the viewport, +range at the top.
 */
function useScrollVar(ref: RefObject<HTMLElement | null>, name: string, range: number, disabled: boolean) {
  useEffect(() => {
    const element = ref.current;
    if (!element || disabled) return;
    let frame = 0;
    let active = false;
    const update = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const centre = rect.top + rect.height / 2;
      const progress = Math.max(-1, Math.min(1, (window.innerHeight / 2 - centre) / (window.innerHeight / 2 + rect.height / 2)));
      element.style.setProperty(name, `${(progress * range).toFixed(1)}px`);
    };
    const onScroll = () => {
      if (active && !frame) frame = requestAnimationFrame(update);
    };
    const observer = new IntersectionObserver(([entry]) => {
      active = entry.isIntersecting;
      if (active) update();
    });
    observer.observe(element);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      element.style.removeProperty(name);
    };
  }, [ref, name, range, disabled]);
}

function Photo({
  src,
  alt,
  caption,
  delay,
  reduced,
  className,
  sizes,
}: {
  src: string;
  alt: string;
  caption: string;
  delay: number;
  reduced: boolean;
  className?: string;
  sizes: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>(0.25);
  useScrollVar(ref, "--py", -22, reduced);
  return (
    <figure className={cn("relative", className)}>
      <div
        ref={ref}
        className={cn(styles.photo, "h-full")}
        data-reveal={inView ? "in" : "idle"}
        style={{ "--d": `${delay}ms` } as CSSProperties}
      >
        <div className={styles.photoInner}>
          <Image src={src} alt={alt} fill sizes={sizes} className={cn(styles.photoImg, "object-cover")} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <figcaption className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
          <RevealText
            text={caption}
            active={inView}
            delay={delay + 650}
            className="block max-w-md font-heading text-2xl text-balance text-[#faf7ef] sm:text-3xl"
          />
        </figcaption>
      </div>
    </figure>
  );
}

export function InstrumentSection({
  home,
  instruments,
  missionQuote,
  reduced,
}: {
  home: LabCopy["home"];
  instruments: InstrumentCopy[];
  missionQuote: string;
  reduced: boolean;
}) {
  const [headRef, headIn] = useInView<HTMLDivElement>(0.4);
  const [stageRef, stageIn] = useInView<HTMLDivElement>(0.3);
  const wordRef = useRef<HTMLSpanElement>(null);
  const [current, setCurrent] = useState<InstrumentId>(instruments[0].id);
  const [leaving, setLeaving] = useState<InstrumentId | null>(null);
  const leaveTimer = useRef(0);
  useScrollVar(wordRef, "--px", 56, reduced);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const active = instruments.find((i) => i.id === current) ?? instruments[0];

  function select(id: InstrumentId) {
    if (id === current) return;
    setLeaving(current);
    setCurrent(id);
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setLeaving(null), 420);
  }

  function onTabKey(event: React.KeyboardEvent, index: number) {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = instruments[(index + delta + instruments.length) % instruments.length];
    select(next.id);
    document.getElementById(`instrument-tab-${next.id}`)?.focus();
  }

  return (
    <section className={styles.instruments} aria-label="Instruments">
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div ref={headRef} className="max-w-2xl">
          <Eyebrow active={headIn} className="text-[#d7b76e]">
            {home.instrumentsEyebrow}
          </Eyebrow>
          <RevealText
            as="h2"
            text={home.instrumentsTitle}
            active={headIn}
            delay={120}
            className="mt-4 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-5xl"
          />
          <Fade as="p" active={headIn} delay={520} className="mt-5 text-lg text-pretty text-[#faf7ef]/70">
            {home.instrumentsDescription}
          </Fade>
        </div>

        <div ref={stageRef} className="mt-10 grid gap-8 lg:mt-14 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div className="order-2 lg:order-1">
            <div role="tablist" aria-label="Instrument" className="flex gap-6 pl-4 lg:flex-col lg:gap-2">
              {instruments.map((instrument, index) => (
                <button
                  key={instrument.id}
                  id={`instrument-tab-${instrument.id}`}
                  type="button"
                  role="tab"
                  aria-selected={instrument.id === current}
                  aria-controls="instrument-panel"
                  tabIndex={instrument.id === current ? 0 : -1}
                  onClick={() => select(instrument.id)}
                  onKeyDown={(event) => onTabKey(event, index)}
                  className={cn(styles.tab, "text-2xl sm:text-3xl lg:text-5xl")}
                >
                  <span aria-hidden="true" className={styles.tabMarker} />
                  {instrument.name}
                </button>
              ))}
            </div>
            <div id="instrument-panel" role="tabpanel" aria-labelledby={`instrument-tab-${current}`} className="mt-6 min-h-[9.5rem] pl-4 lg:mt-10">
              <div key={current} className={styles.swap}>
                <p className="max-w-sm text-lg text-pretty text-[#faf7ef]/75">{active.description}</p>
                <div className="mt-6">
                  <StringButton variant="ghost">{active.shop}</StringButton>
                </div>
              </div>
            </div>
          </div>

          <div
            className={cn(styles.artStage, "relative order-1 aspect-[4/5] max-h-[560px] w-full sm:aspect-[5/4] lg:order-2 lg:aspect-[4/5]")}
          >
            <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
              <span ref={wordRef} className={styles.bigWord}>
                <span className={styles.bigWordMask}>
                  <span key={current} className={styles.bigWordInner}>
                    {active.name.toUpperCase()}
                  </span>
                </span>
              </span>
            </div>
            <div className="absolute inset-[6%]">
              {leaving ? <InstrumentArt key={`leaving-${leaving}`} id={leaving} leaving /> : null}
              {stageIn ? <InstrumentArt key={`current-${current}`} id={current} /> : null}
            </div>
          </div>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-[1.55fr_1fr] lg:mt-24">
          <Photo
            src="/mission-kirar.png"
            alt="A Kirar resting in a sunlit interior"
            caption={missionQuote}
            delay={0}
            reduced={reduced}
            className="aspect-[4/5] sm:aspect-[16/10] md:aspect-auto md:h-[440px]"
            sizes="(min-width: 768px) 60vw, 100vw"
          />
          <Photo
            src="/products-to-upload/travelers-masenqo.png"
            alt="A travel Masenqo with its bow"
            caption={instruments.find((i) => i.id === "MESENKO")?.name ?? "Masenqo"}
            delay={180}
            reduced={reduced}
            className="aspect-[4/5] md:aspect-auto md:h-[440px]"
            sizes="(min-width: 768px) 40vw, 100vw"
          />
        </div>
      </div>
    </section>
  );
}
