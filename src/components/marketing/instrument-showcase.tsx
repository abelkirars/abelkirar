"use client";

import Image, { getImageProps } from "next/image";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { useInView } from "@/components/motion/hooks";
import { MotionCta } from "@/components/motion/motion-cta";
import motion from "@/components/motion/motion.module.css";
import { InstrumentLineArt, type ShowcaseInstrumentId } from "./instrument-line-art";
import styles from "./instrument-showcase.module.css";

export interface ShowcaseInstrument {
  id: ShowcaseInstrumentId;
  name: string;
  description: string;
  /** The existing Store category destination, passed through unchanged. */
  href: string;
  shopLabel: string;
  /** A production image, or undefined for the line-drawing fallback. */
  image?: string;
  imageAlt: string;
}

const IMAGE_SIZES = "(min-width: 1024px) 34rem, (min-width: 640px) 32rem, calc(100vw - 3rem)";

const subscribeNever = () => () => {};

/**
 * Homepage instruments: tabs for Kirar, Begena and Masenqo over one stage.
 *
 * - Every instrument is server-rendered with its description and Store
 *   link. With scripting, CSS shows one at a time and the buttons become an
 *   ARIA tablist once hydrated; without scripting, all three are listed.
 * - All panels share one grid cell, so switching never changes height.
 * - Only the selected instrument's photo is requested; another's starts
 *   loading when its tab is hovered, focused or chosen.
 */
export function InstrumentShowcase({ instruments, tabsLabel }: { instruments: ShowcaseInstrument[]; tabsLabel: string }) {
  const baseId = useId();
  const enhanced = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const [current, setCurrent] = useState<ShowcaseInstrumentId>(instruments[0].id);
  const [requested, setRequested] = useState<ShowcaseInstrumentId[]>([instruments[0].id]);
  const [failed, setFailed] = useState<ShowcaseInstrumentId[]>([]);
  const markFailed = useCallback((id: ShowcaseInstrumentId) => setFailed((list) => (list.includes(id) ? list : [...list, id])), []);
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});

  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = (id: string) => `${baseId}-panel-${id}`;

  function request(id: ShowcaseInstrumentId) {
    setRequested((list) => (list.includes(id) ? list : [...list, id]));
  }

  function select(id: ShowcaseInstrumentId) {
    request(id);
    setCurrent(id);
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = instruments.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? index === last ? 0 : index + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? index === 0 ? last : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const target = instruments[next];
    select(target.id);
    tabs.current[target.id]?.focus();
  }

  return (
    <div ref={ref} className={cn(motion.scope, motion.revealItem, styles.showcase)} data-reveal={inView ? "in" : "idle"}>
      <div className={styles.layout}>
        <div role={enhanced ? "tablist" : undefined} aria-label={enhanced ? tabsLabel : undefined} className={styles.tabs}>
          {instruments.map((instrument, index) => {
            const selected = instrument.id === current;
            return (
              <button
                key={instrument.id}
                ref={(element) => {
                  tabs.current[instrument.id] = element;
                }}
                id={tabId(instrument.id)}
                type="button"
                role={enhanced ? "tab" : undefined}
                aria-selected={enhanced ? selected : undefined}
                aria-controls={enhanced ? panelId(instrument.id) : undefined}
                tabIndex={enhanced && !selected ? -1 : 0}
                data-selected={selected ? "" : undefined}
                className={styles.tab}
                onClick={() => select(instrument.id)}
                onKeyDown={(event) => onTabKey(event, index)}
                onPointerEnter={() => request(instrument.id)}
                onFocus={() => request(instrument.id)}
              >
                <span aria-hidden="true" className={styles.tabMarker} />
                {instrument.name}
              </button>
            );
          })}
        </div>

        {instruments.map((instrument) => {
          const selected = instrument.id === current;
          const load = requested.includes(instrument.id);
          return (
            <div
              key={instrument.id}
              id={panelId(instrument.id)}
              role={enhanced ? "tabpanel" : undefined}
              aria-labelledby={enhanced ? tabId(instrument.id) : undefined}
              data-selected={selected ? "" : undefined}
              className={styles.panel}
            >
              <span aria-hidden="true" className={styles.bigWord}>
                <span className={styles.bigWordInner}>{instrument.name}</span>
              </span>

              <div className={styles.frame}>
                <InstrumentLineArt id={instrument.id} />
                {instrument.image && !failed.includes(instrument.id) ? (
                  load ? (
                    <ShowcasePhoto id={instrument.id} src={instrument.image} alt={instrument.imageAlt} onFail={markFailed} />
                  ) : (
                    <NoScriptImage src={instrument.image} alt={instrument.imageAlt} />
                  )
                ) : null}
              </div>

              <div className={styles.copy}>
                <h3 className={styles.panelTitle}>{instrument.name}</h3>
                <p className={styles.description}>{instrument.description}</p>
                <MotionCta href={instrument.href} className={styles.cta}>
                  {instrument.shopLabel}
                </MotionCta>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A photo that cannot load is removed so the line drawing shows instead of a
 * broken image. Listens natively rather than through next/image's onError,
 * which re-assigns the src (a second request) whenever the handler changes.
 */
function ShowcasePhoto({ id, src, alt, onFail }: { id: ShowcaseInstrumentId; src: string; alt: string; onFail: (id: ShowcaseInstrumentId) => void }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    if (!img) return;
    const fail = () => onFail(id);
    // Failed before hydration: the error event has already fired.
    if (img.complete && img.currentSrc && img.naturalWidth === 0) {
      fail();
      return;
    }
    img.addEventListener("error", fail);
    return () => img.removeEventListener("error", fail);
  }, [id, onFail]);
  return <Image ref={ref} src={src} alt={alt} fill sizes={IMAGE_SIZES} className={styles.photo} />;
}

/** Photos of not-yet-chosen instruments, for visitors without JavaScript only. */
function NoScriptImage({ src, alt }: { src: string; alt: string }) {
  const { props } = getImageProps({ src, alt, fill: true, sizes: IMAGE_SIZES });
  return (
    <noscript>
      {/* eslint-disable-next-line @next/next/no-img-element -- optimised props from getImageProps */}
      <img {...props} alt={alt} className={styles.photo} />
    </noscript>
  );
}
