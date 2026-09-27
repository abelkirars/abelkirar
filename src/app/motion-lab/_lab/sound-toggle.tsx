"use client";

import { cn } from "@/lib/utils";
import styles from "./motion-lab.module.css";

export type SoundState = "off" | "loading" | "on" | "error";

/**
 * Sound on/off for the instrument. A real toggle button (aria-pressed); its
 * three hairlines are the instrument's strings — flat and dim when off,
 * ringing once in gold when switched on.
 */
export function SoundToggle({
  state,
  room,
  onToggle,
  onRoomToggle,
}: {
  state: SoundState;
  room: boolean;
  onToggle: () => void;
  onRoomToggle: () => void;
}) {
  const on = state === "on" || state === "loading";
  const status =
    state === "loading" ? "Tuning…" : state === "on" ? "On" : state === "error" ? "Unavailable" : "Off";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        className={styles.soundToggle}
        data-state={state}
      >
        <span aria-hidden="true" className={styles.soundBars}>
          <span />
          <span />
          <span />
        </span>
        <span>Sound</span>
        <span aria-hidden="true" className={styles.soundStatus}>
          {status}
        </span>
      </button>
      {state === "on" ? (
        <button type="button" aria-pressed={room} onClick={onRoomToggle} className={cn(styles.soundToggle, styles.roomToggle)}>
          Room
        </button>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {state === "loading"
          ? "Loading Kirar sound"
          : state === "on"
            ? "Kirar sound on"
            : state === "error"
              ? "Kirar sound could not be loaded"
              : "Kirar sound off"}
      </span>
    </div>
  );
}
