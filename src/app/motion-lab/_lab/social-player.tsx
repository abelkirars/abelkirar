"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFrameLoop, useVisible } from "./hooks";
import { SocialStage } from "./social-stage";
import { SCENES, SOCIAL, activeScene, formatTimecode, segment } from "./social-timeline";
import { createExcitation, excitationDisplacement, stringPath } from "./string-physics";
import { ease } from "./tokens";
import styles from "./motion-lab.module.css";

/** Scale factor that fits a fixed-size stage into its responsive frame. */
function useStageScale(ref: RefObject<HTMLElement | null>, logicalWidth: number) {
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / logicalWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, logicalWidth]);
  return scale;
}

/**
 * Plays a pure time-based scene. Autoplays while on screen unless the viewer
 * prefers reduced motion; any explicit play/pause/scrub takes over from there.
 */
function useTimeline({
  duration,
  visible,
  autoPlay,
  loop,
}: {
  duration: number;
  visible: boolean;
  autoPlay: boolean;
  loop: boolean;
}) {
  const [t, setT] = useState(0);
  const clock = useRef(0);
  const [choice, setChoice] = useState<boolean | null>(null);
  const playing = (choice ?? autoPlay) && visible;
  const last = useRef<number | null>(null);

  useEffect(() => {
    last.current = null;
  }, [playing]);

  const seek = (value: number) => {
    clock.current = Math.min(duration, Math.max(0, value));
    setT(clock.current);
  };

  useFrameLoop(playing, (now) => {
    const previous = last.current;
    last.current = now;
    if (previous === null) return;
    let next = clock.current + Math.min(0.1, (now - previous) / 1000);
    if (next >= duration) {
      if (loop) {
        next %= duration;
      } else {
        next = duration;
        setChoice(false);
      }
    }
    seek(next);
  });

  return {
    t,
    playing,
    play: () => {
      if (clock.current >= duration) seek(0);
      setChoice(true);
    },
    pause: () => setChoice(false),
    seek,
    restart: () => {
      seek(0);
      setChoice(true);
    },
  };
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-full text-[#faf7ef] ring-1 ring-[#faf7ef]/20 transition-colors hover:bg-[#faf7ef]/10"
    >
      {children}
    </button>
  );
}

function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={styles.chip}>
      {children}
    </button>
  );
}

export function SocialPlayer({
  reduced,
  mode = "inline",
}: {
  reduced: boolean;
  /** inline: in the lab page · fullscreen: review route · clean: stage only, for screen capture */
  mode?: "inline" | "fullscreen" | "clean";
}) {
  const fullscreen = mode !== "inline";
  const frameRef = useRef<HTMLDivElement>(null);
  const visible = useVisible(frameRef);
  const scale = useStageScale(frameRef, SOCIAL.width);
  const [loop, setLoop] = useState(true);
  const [safe, setSafe] = useState(false);
  const player = useTimeline({ duration: SOCIAL.duration, visible, autoPlay: !reduced || mode === "clean", loop });
  const current = activeScene(player.t);

  return (
    <div className={cn("flex flex-col", mode !== "clean" && "gap-8", !fullscreen && "lg:flex-row lg:items-start")}>
      <div
        ref={frameRef}
        className={cn(
          styles.stageViewport,
          "mx-auto aspect-[9/16] shrink-0",
          mode === "inline" && "w-full max-w-[380px]",
          mode === "fullscreen" && "h-[min(calc(100svh-9rem),calc((100vw-2rem)*16/9))]",
          mode === "clean" && "h-[min(100svh,calc(100vw*16/9))] rounded-none",
        )}
      >
        {scale > 0 ? (
          <div className={styles.stage} style={{ width: SOCIAL.width, height: SOCIAL.height, transform: `scale(${scale})` }}>
            <SocialStage t={player.t} showSafe={safe} />
          </div>
        ) : null}
      </div>

      <div className={cn("flex w-full flex-col gap-5 text-[#faf7ef]", fullscreen ? "mx-auto max-w-md" : "lg:max-w-md", mode === "clean" && "hidden")}>
        <div className="flex items-center gap-3">
          {player.playing ? (
            <IconButton label="Pause" onClick={player.pause}>
              <Pause className="size-4" />
            </IconButton>
          ) : (
            <IconButton label="Play" onClick={player.play}>
              <Play className="size-4" />
            </IconButton>
          )}
          <IconButton label="Restart" onClick={player.restart}>
            <RotateCcw className="size-4" />
          </IconButton>
          <span className="ml-auto font-mono text-sm tabular-nums text-[#faf7ef]/70">
            {formatTimecode(player.t)} / {formatTimecode(SOCIAL.duration)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={SOCIAL.duration}
          step={1 / SOCIAL.fps}
          value={player.t}
          aria-label="Scrub timeline"
          onChange={(event) => {
            player.pause();
            player.seek(Number(event.target.value));
          }}
          className={styles.scrubber}
        />
        <div className="flex flex-wrap gap-2">
          <Toggle pressed={safe} onClick={() => setSafe((v) => !v)}>
            Safe zones
          </Toggle>
          <Toggle pressed={loop} onClick={() => setLoop((v) => !v)}>
            Loop
          </Toggle>
          {!fullscreen ? (
            <Link href="/motion-lab/social" className={styles.chip}>
              Full-screen for recording ↗
            </Link>
          ) : null}
        </div>
        {reduced ? (
          <p className="text-sm text-[#faf7ef]/60">Autoplay is off because reduced motion is on. Press play to preview.</p>
        ) : null}

        {!fullscreen ? (
          <ol className="mt-2 space-y-1">
            {SCENES.map((scene) => (
              <li key={scene.id}>
                <button
                  type="button"
                  className={styles.sceneItem}
                  data-active={scene.id === current.id ? "" : undefined}
                  onClick={() => {
                    player.seek(scene.start);
                    player.play();
                  }}
                >
                  <span className="w-24 shrink-0 font-mono text-xs tabular-nums opacity-70">
                    {scene.start.toFixed(1)}–{scene.end.toFixed(1)}s
                  </span>
                  <span className="text-sm">{scene.label}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Lower third — 1920 × 1080, for lesson and tip videos.
   -------------------------------------------------------------------------- */

const LT = { width: 1920, height: 1080, duration: 5.4 };
const LT_STRING = { x1: 150, y1: 846, x2: 830, y2: 846 };
const LT_VOICE = { frequency: 3.2, decay: 0.9 };
const LT_PLUCK = createExcitation({ start: 720, position: 0.3, amplitude: 11, pull: 180 });

function LowerThirdStage({ t }: { t: number }) {
  const draw = segment(t, 0.1, 0.7, ease.resonate) * (1 - segment(t, 4.45, 0.55, ease.resonate));
  const nameY = (1 - segment(t, 0.92, 1, ease.pluck)) * 112 + segment(t, 4.1, 0.45, ease.release) * 112;
  const titleY = -(1 - segment(t, 1.08, 1, ease.pluck)) * 112 - segment(t, 4.15, 0.45, ease.release) * 112;
  const d = stringPath(LT_STRING, 36, (u) => excitationDisplacement(u, t * 1000 - LT_PLUCK.start, LT_PLUCK, LT_VOICE));
  const text: CSSProperties = { position: "absolute", left: LT_STRING.x1, overflow: "hidden" };

  return (
    <div style={{ position: "relative", width: LT.width, height: LT.height, overflow: "hidden", color: "#faf7ef" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- stand-in video frame, not page content */}
      <img src="/mission-kirar.png" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(20deg, rgba(6,18,13,0.85) 0%, rgba(6,18,13,0.3) 45%, rgba(6,18,13,0) 70%)" }} />
      <svg width={LT.width} height={LT.height} style={{ position: "absolute", inset: 0 }} aria-hidden="true">
        <g style={{ transform: `scaleX(${draw})`, transformOrigin: `${LT_STRING.x1}px ${LT_STRING.y1}px` }}>
          <path d={d} fill="none" stroke="#e6cf94" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      </svg>
      <div style={{ ...text, bottom: LT.height - LT_STRING.y1 + 14, padding: "0.1em 0.1em 0.14em 0", fontSize: 84 }}>
        <div style={{ fontFamily: "var(--font-heading), Georgia, serif", fontWeight: 600, lineHeight: 1, transform: `translateY(${nameY}%)` }}>
          Deacon Abel
        </div>
      </div>
      <div style={{ ...text, top: LT_STRING.y1 + 16, fontSize: 28 }}>
        <div
          style={{
            fontFamily: "var(--font-sans), system-ui, sans-serif",
            fontWeight: 500,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "#d7b76e",
            transform: `translateY(${titleY}%)`,
          }}
        >
          Abelkirar · Online Kirar Lessons
        </div>
      </div>
    </div>
  );
}

export function LowerThirdPlayer({ reduced }: { reduced: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const visible = useVisible(frameRef);
  const scale = useStageScale(frameRef, LT.width);
  const player = useTimeline({ duration: LT.duration, visible, autoPlay: !reduced, loop: true });

  return (
    <div>
      <div ref={frameRef} className={cn(styles.stageViewport, "aspect-video w-full")}>
        {scale > 0 ? (
          <div className={styles.stage} style={{ width: LT.width, height: LT.height, transform: `scale(${scale})` } as CSSProperties}>
            <LowerThirdStage t={reduced && !player.playing ? 2.5 : player.t} />
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex items-center gap-3 text-[#faf7ef]">
        {player.playing ? (
          <IconButton label="Pause lower third" onClick={player.pause}>
            <Pause className="size-4" />
          </IconButton>
        ) : (
          <IconButton label="Play lower third" onClick={player.play}>
            <Play className="size-4" />
          </IconButton>
        )}
        <p className="text-sm text-[#faf7ef]/65">Lower third · name card — the string carries the name in and out.</p>
      </div>
    </div>
  );
}
