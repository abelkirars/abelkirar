"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePrefersReducedMotion } from "./hooks";

type Override = "system" | "reduced" | "full";

interface MotionPrefs {
  /** Effective setting: the OS preference unless the lab toggle overrides it. */
  reduced: boolean;
  systemReduced: boolean;
  override: Override;
  setOverride: (value: Override) => void;
}

const MotionPrefsContext = createContext<MotionPrefs>({
  reduced: false,
  systemReduced: false,
  override: "system",
  setOverride: () => {},
});

export function MotionPrefsProvider({ children }: { children: ReactNode }) {
  const systemReduced = usePrefersReducedMotion();
  const [override, setOverride] = useState<Override>("system");
  const reduced = override === "system" ? systemReduced : override === "reduced";
  return (
    <MotionPrefsContext value={{ reduced, systemReduced, override, setOverride }}>
      {children}
    </MotionPrefsContext>
  );
}

export function useMotionPrefs(): MotionPrefs {
  return useContext(MotionPrefsContext);
}
