"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { MotionPrefsProvider, useMotionPrefs } from "./motion-prefs";
import { SocialPlayer } from "./social-player";
import styles from "./motion-lab.module.css";

function Body({ clean }: { clean: boolean }) {
  const { reduced } = useMotionPrefs();
  return (
    <div
      className={cn(
        styles.lab,
        "fixed inset-0 z-[60] overflow-auto bg-black",
        clean ? "grid place-items-center" : "px-4 py-6",
      )}
      data-motion={reduced ? "reduced" : "full"}
    >
      {clean ? null : (
        <div className="mx-auto mb-4 flex max-w-md items-center justify-between text-sm text-[#faf7ef]/70">
          <Link href="/motion-lab#social" className={styles.chip}>
            ← Motion lab
          </Link>
          <span>
            Clean capture: <code className="text-[#d7b76e]">?clean</code>
          </span>
        </div>
      )}
      <SocialPlayer reduced={reduced} mode={clean ? "clean" : "fullscreen"} />
    </div>
  );
}

/** Full-viewport stage for review and screen recording (covers the site chrome). */
export function SocialFullscreen({ clean }: { clean: boolean }) {
  return (
    <MotionPrefsProvider>
      <Body clean={clean} />
    </MotionPrefsProvider>
  );
}
