"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useInView, usePrefersReducedMotion } from "@/components/motion/hooks";
import { KirarStrings, type KirarStringsHandle, type StringSpec } from "@/components/motion/kirar-strings";
import { SoundField, type SoundFieldHandle } from "@/components/motion/sound-field";
import { pentatonicVoices } from "@/components/motion/string-physics";
import { unlockAudioContext } from "@/components/motion/audio-unlock";
import { SoundToggle, type SoundState, type SoundToggleLabels } from "@/components/motion/sound-toggle";
import type { KirarAudio } from "@/components/motion/kirar-audio";
import motion from "@/components/motion/motion.module.css";
import styles from "./kirar-hero.module.css";

const VOICES = pentatonicVoices(4.2, 1.35);

/**
 * Five strings fanning from a narrow bridge up to a wider yoke, as on the
 * instrument. Lowest (thickest) string on the left.
 */
const STRINGS: StringSpec[] = [0, 1, 2, 3, 4].map((i) => ({
  x1: 170 + i * 20,
  y1: 570,
  x2: 110 + i * 50,
  y2: 52,
  width: 2.1 - i * 0.24,
  voice: VOICES[i],
}));

/** A welcome strum only right after the page loads, never on a later scroll. */
const WELCOME_WINDOW_MS = 6000;

export function KirarHeroInstrument({
  label,
  hint,
  keysHint,
  soundLabels,
}: {
  label: string;
  hint: string;
  keysHint: string;
  soundLabels: SoundToggleLabels;
}) {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const stringsRef = useRef<KirarStringsHandle>(null);
  const fieldRef = useRef<SoundFieldHandle>(null);
  const hintId = useId();

  // Sound is off on every visit. The engine (and the recordings) are only
  // loaded after the visitor turns it on.
  const engine = useRef<KirarAudio | null>(null);
  const request = useRef(0);
  const [sound, setSound] = useState<SoundState>("off");
  const [touched, setTouched] = useState(false);
  const [room, setRoom] = useState(true);

  useEffect(
    () => () => {
      // Leaving the page releases the audio device.
      request.current += 1;
      engine.current?.dispose();
      engine.current = null;
    },
    [],
  );

  function toggleSound() {
    setTouched(true);
    const id = ++request.current;
    if (sound === "on" || sound === "loading") {
      engine.current?.disable();
      setSound("off");
      return;
    }
    setSound("loading");

    let ready: Promise<KirarAudio>;
    let unlocked: AudioContext | null = null;
    if (engine.current) {
      ready = Promise.resolve(engine.current);
    } else {
      try {
        // Must happen synchronously inside this click (autoplay rules).
        unlocked = unlockAudioContext();
      } catch {
        setSound("error");
        return;
      }
      const context = unlocked;
      ready = import("@/components/motion/kirar-audio").then(({ KirarAudio }) => {
        const created = new KirarAudio(context);
        created.setRoom(room);
        engine.current = created;
        if (process.env.NODE_ENV !== "production") {
          (window as Window & { __kirarAudio?: KirarAudio }).__kirarAudio = created;
        }
        return created;
      });
    }

    ready
      .then((audio) => audio.enable().then(() => audio))
      .then(
        (audio) => {
          if (request.current === id) setSound("on");
          else audio.disable(); // turned off again while loading
        },
        () => {
          if (engine.current) engine.current.disable();
          else void unlocked?.close(); // engine code never arrived: release the device
          if (request.current === id) setSound("error");
        },
      );
  }

  function toggleRoom() {
    const next = !room;
    setRoom(next);
    engine.current?.setRoom(next);
  }

  useEffect(() => {
    // The strum sweeps across as the headline settles. Silent by design.
    if (!inView || reduced || performance.now() > WELCOME_WINDOW_MS) return;
    stringsRef.current?.strum({ delay: 250, interval: 95, amplitude: 10 });
  }, [inView, reduced]);

  function onKeyDown(event: React.KeyboardEvent) {
    const digit = Number(event.key);
    if (digit >= 1 && digit <= STRINGS.length) {
      event.preventDefault();
      stringsRef.current?.pluck(digit - 1, { position: 0.5, amplitude: 12, source: "user" });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      stringsRef.current?.strum({ amplitude: 11, source: "user" });
    }
  }

  return (
    <>
      {/* Positioned against the hero section, behind the copy and the strings. */}
      <SoundField ref={fieldRef} reduced={reduced} />
      <div ref={ref} className={cn(motion.enterFade, styles.instrumentColumn)} style={{ "--d": "240ms" } as CSSProperties}>
        <div
          tabIndex={0}
          role="group"
          aria-label={label}
          aria-describedby={hintId}
          aria-keyshortcuts="1 2 3 4 5 Enter"
          onKeyDown={onKeyDown}
          className={cn(styles.instrument, motion.instrumentFocus)}
        >
          <KirarStrings
            ref={stringsRef}
            strings={STRINGS}
            width={420}
            height={620}
            reduced={reduced}
            pegs
            bridge
            onPluck={(event) => fieldRef.current?.ripple(event.clientX, event.clientY, event.strength)}
            onStrike={(event) => {
              // Only the visitor's own plucks sound; the welcome strum is "auto".
              if (event.source === "user") engine.current?.strike(event.index, event.strength, event.delayMs);
            }}
            onDamp={(index) => engine.current?.damp(index)}
          />
        </div>
        <p id={hintId} className="sr-only">
          {keysHint}
        </p>
        <div className={styles.controls}>
          <SoundToggle
            state={sound}
            touched={touched}
            room={room}
            labels={soundLabels}
            onToggle={toggleSound}
            onRoomToggle={toggleRoom}
          />
          <button
            type="button"
            onClick={() => stringsRef.current?.strum({ amplitude: 11, source: "user" })}
            className={styles.hint}
          >
            {hint}
          </button>
        </div>
      </div>
    </>
  );
}
