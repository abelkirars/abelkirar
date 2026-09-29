"use client";

import { cn } from "@/lib/utils";
import styles from "./motion.module.css";

export type SoundState = "off" | "loading" | "on" | "error";

export interface SoundToggleLabels {
  sound: string;
  on: string;
  off: string;
  loading: string;
  unavailable: string;
  room: string;
  announceOn: string;
  announceOff: string;
  announceLoading: string;
  announceError: string;
}

/**
 * Sound on/off for the instrument: a real toggle button (aria-pressed) named
 * "Sound". Its three hairlines are the instrument's strings — flat and dim
 * when off, ringing once in gold when switched on. State changes are also
 * announced politely to screen readers.
 */
export function SoundToggle({
  state,
  touched,
  room,
  labels,
  onToggle,
  onRoomToggle,
}: {
  state: SoundState;
  /** Whether the visitor has used the control — nothing is announced before that. */
  touched: boolean;
  room: boolean;
  labels: SoundToggleLabels;
  onToggle: () => void;
  onRoomToggle: () => void;
}) {
  const pressed = state === "on" || state === "loading";
  const status =
    state === "loading" ? labels.loading : state === "on" ? labels.on : state === "error" ? labels.unavailable : labels.off;
  const announcement = !touched
    ? ""
    : state === "loading"
      ? labels.announceLoading
      : state === "on"
        ? labels.announceOn
        : state === "error"
          ? labels.announceError
          : labels.announceOff;

  return (
    <div className={styles.soundControls}>
      <button type="button" aria-pressed={pressed} onClick={onToggle} className={styles.soundToggle} data-state={state}>
        <span aria-hidden="true" className={styles.soundBars}>
          <span />
          <span />
          <span />
        </span>
        <span>{labels.sound}</span>
        <span aria-hidden="true" className={styles.soundStatus}>
          {status}
        </span>
      </button>
      {state === "on" ? (
        <button type="button" aria-pressed={room} onClick={onRoomToggle} className={cn(styles.soundToggle, styles.roomToggle)}>
          {labels.room}
        </button>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
