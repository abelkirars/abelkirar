"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useInView } from "./hooks";
import { getKirarAudio, type KirarAudio } from "./kirar-audio";
import { KirarStrings, type KirarStringsHandle, type StringSpec } from "./kirar-strings";
import { Eyebrow, Fade, RevealText } from "./reveal";
import { SoundField, type SoundFieldHandle } from "./sound-field";
import { SoundToggle, type SoundState } from "./sound-toggle";
import { StringButton } from "./string-button";
import { pentatonicVoices } from "./string-physics";
import type { LabCopy } from "./copy";
import styles from "./motion-lab.module.css";

const VOICES = pentatonicVoices(4.2, 1.35);

/**
 * Five strings fanning from a narrow bridge up to a wider yoke, as on the
 * instrument. Lowest (thickest) string on the left.
 */
const HERO_STRINGS: StringSpec[] = [0, 1, 2, 3, 4].map((i) => ({
  x1: 170 + i * 20,
  y1: 570,
  x2: 110 + i * 50,
  y2: 52,
  width: 2.1 - i * 0.24,
  voice: VOICES[i],
}));

export function HeroDemo({ copy, reduced }: { copy: LabCopy["hero"]; reduced: boolean }) {
  const [sectionRef, inView] = useInView<HTMLElement>(0.3);
  const stringsRef = useRef<KirarStringsHandle>(null);
  const fieldRef = useRef<SoundFieldHandle>(null);
  const hintId = useId();
  // The engine outlives this component (Replay remounts it), so start from its state.
  const [sound, setSound] = useState<SoundState>(() => (getKirarAudio().enabled ? "on" : "off"));
  const [room, setRoom] = useState(true);

  useEffect(() => {
    // The strum sweeps across the strings as the headline's lines land.
    // Source "auto": it is silent — only the visitor's own plucks make sound.
    if (inView) stringsRef.current?.strum({ delay: 420, interval: 95, amplitude: 10 });
  }, [inView]);

  useEffect(() => {
    // Development-only handle for the lab's own browser tests.
    (window as Window & { __kirarAudio?: KirarAudio }).__kirarAudio = getKirarAudio();
  }, []);

  function toggleSound() {
    const audio = getKirarAudio();
    if (sound === "on" || sound === "loading") {
      audio.disable();
      setSound("off");
      return;
    }
    setSound("loading");
    // enable() creates/resumes the AudioContext synchronously, inside this click.
    audio.enable().then(
      () => setSound((current) => (current === "loading" ? "on" : current)),
      () => {
        audio.disable();
        setSound("error");
      },
    );
  }

  function toggleRoom() {
    const next = !room;
    setRoom(next);
    getKirarAudio().setRoom(next);
  }

  function onInstrumentKey(event: React.KeyboardEvent) {
    const digit = Number(event.key);
    if (digit >= 1 && digit <= HERO_STRINGS.length) {
      event.preventDefault();
      stringsRef.current?.pluck(digit - 1, { position: 0.5, amplitude: 12, source: "user" });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      stringsRef.current?.strum({ amplitude: 11, source: "user" });
    }
  }

  return (
    <section ref={sectionRef} className={styles.hero} aria-label="Hero">
      <SoundField ref={fieldRef} reduced={reduced} />
      <div className="relative mx-auto grid max-w-6xl gap-8 px-4 pt-20 pb-10 sm:px-6 sm:pt-24 lg:min-h-[78vh] lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-4 lg:px-8 lg:py-24">
        <div>
          <Eyebrow active={inView} className="text-[#d7b76e]">
            {copy.eyebrow}
          </Eyebrow>
          <RevealText
            as="h2"
            text={copy.title}
            active={inView}
            delay={160}
            className="mt-5 max-w-[14ch] font-heading text-[2.65rem] leading-[1.04] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl"
          />
          <Fade as="p" active={inView} delay={760} className="mt-6 max-w-xl text-lg text-[#faf7ef]/75 text-pretty">
            {copy.description}
          </Fade>
          <Fade active={inView} delay={920} className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <StringButton variant="primary">{copy.startLearning}</StringButton>
            <StringButton variant="ghost" arrow={false}>
              {copy.contactAbel}
            </StringButton>
          </Fade>
        </div>

        <Fade active={inView} delay={200} className="flex flex-col items-center gap-3">
          <div
            tabIndex={0}
            role="group"
            aria-label="Kirar, five strings"
            aria-describedby={hintId}
            aria-keyshortcuts="1 2 3 4 5 Enter"
            onKeyDown={onInstrumentKey}
            className={cn(styles.heroInstrument, styles.instrumentFocus, "w-full")}
          >
            <KirarStrings
              ref={stringsRef}
              strings={HERO_STRINGS}
              width={420}
              height={620}
              reduced={reduced}
              pegs
              bridge
              onPluck={(event) => fieldRef.current?.ripple(event.clientX, event.clientY, event.strength)}
              onStrike={(event) => {
                if (event.source === "user") getKirarAudio().strike(event.index, event.strength, event.delayMs);
              }}
              onDamp={(index) => getKirarAudio().damp(index)}
            />
          </div>
          <p id={hintId} className="sr-only">
            Press 1 to 5 to pluck a string, lowest to highest, or Enter to strum. Turn sound on to hear the recordings.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
            <SoundToggle state={sound} room={room} onToggle={toggleSound} onRoomToggle={toggleRoom} />
            <button
              type="button"
              onClick={() => stringsRef.current?.strum({ amplitude: 11, source: "user" })}
              className="min-h-11 rounded-full px-3 text-[0.68rem] font-medium tracking-[0.22em] text-[#faf7ef]/55 uppercase transition-colors hover:text-[#faf7ef]"
            >
              Pull a string · or sweep across
            </button>
          </div>
        </Fade>
      </div>
    </section>
  );
}
