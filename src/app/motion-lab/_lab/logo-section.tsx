"use client";

import { useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useInView } from "./hooks";
import { getKirarAudio } from "./kirar-audio";
import styles from "./motion-lab.module.css";

const GOLD = "#d4a84b";
const WORDMARK = "ABEL KIRAR";
const BRAND = (file: string) => `/motion-lab/brand/${file}`;

/**
 * The mark drawn in construction order — bowl, arms, yoke, bridge and
 * carving, then the five strings, as if the instrument were being strung.
 * Geometry matches docs/brand/logo/abelkirar-mark.svg exactly.
 */
const BODY = [
  { d: "M100 131 A31 31 0 0 1 100 193 A31 31 0 0 1 100 131", delay: 0 },
  { d: "M82.22 136.61 L60 32", delay: 260 },
  { d: "M117.78 136.61 L140 32", delay: 260 },
  { d: "M46 26 Q100 40 154 26", delay: 560 },
  { d: "M91 143 H109", delay: 820 },
];
const CARVING = "M100 162 l9 9 l-9 9 l-9 -9z M100 167 l4 4 l-4 4 l-4 -4z";
const STRINGS = [
  "M92.5 143 L76 36.7",
  "M96.25 143 L88 37.3",
  "M100 143 L100 37.5",
  "M103.75 143 L112 37.3",
  "M107.5 143 L124 36.7",
];
const STRING_DRAW = 1000;
const STRING_STEP = 70;
const RING_AT = STRING_DRAW + 5 * STRING_STEP + 420;

function AnimatedMark({ onStrum }: { onStrum: () => void }) {
  const ref = useRef<SVGSVGElement>(null);

  function ring() {
    const reduced = ref.current?.closest("[data-motion]")?.getAttribute("data-motion") === "reduced";
    ref.current?.querySelectorAll<SVGPathElement>("[data-string]").forEach((path, i) => {
      path.animate(
        reduced
          ? [{ opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }]
          : [
              { translate: "0 0" },
              { translate: "1.6px 0", offset: 0.12 },
              { translate: "-1.2px 0", offset: 0.28 },
              { translate: "0.7px 0", offset: 0.45 },
              { translate: "-0.3px 0", offset: 0.65 },
              { translate: "0 0" },
            ],
        { duration: reduced ? 500 : 800, delay: i * 70 },
      );
    });
    onStrum();
  }

  return (
    <button type="button" onClick={ring} className={styles.logoMarkButton} aria-label="Pluck the logo's strings">
      <svg ref={ref} viewBox="40 18 120 180" className={styles.logoMark} aria-hidden="true">
        <g fill="none" stroke={GOLD} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
          {BODY.map((part) => (
            <path key={part.d} d={part.d} pathLength={1} className={styles.logoPath} style={{ "--d": `${part.delay}ms` } as CSSProperties} />
          ))}
          <path d={CARVING} pathLength={1} strokeWidth="2.7" className={styles.logoPath} style={{ "--d": "880ms" } as CSSProperties} />
        </g>
        <g fill="none" stroke={GOLD} strokeWidth="1.8" strokeLinecap="round">
          {STRINGS.map((d, i) => (
            <path
              key={d}
              d={d}
              data-string=""
              pathLength={1}
              className={cn(styles.logoPath, styles.logoString)}
              style={{ "--d": `${STRING_DRAW + i * STRING_STEP}ms`, "--ring": `${i * 45}ms`, "--ring-at": `${RING_AT + i * 45}ms` } as CSSProperties}
            />
          ))}
        </g>
      </svg>
    </button>
  );
}

function Asset({ file, alt, className, bg }: { file: string; alt: string; className?: string; bg: "dark" | "light" | "white" | "black" }) {
  return (
    <a
      href={BRAND(file)}
      target="_blank"
      rel="noreferrer"
      className={cn(styles.logoAsset, bg === "dark" ? "bg-[#0b1d16]" : bg === "light" ? "bg-[#fbf6ec]" : bg === "white" ? "bg-white" : "bg-black")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- previews the exact exported files */}
      <img src={BRAND(file)} alt={alt} className={className} />
    </a>
  );
}

export function LogoSection() {
  const [ref, inView] = useInView<HTMLDivElement>(0.4);
  const letters = Array.from(WORDMARK);
  const centre = (letters.length - 1) / 2;

  function strum() {
    // If the visitor has turned Sound on in the hero, the logo plays too.
    const audio = getKirarAudio();
    [0, 1, 2, 3, 4].forEach((i) => audio.strike(i, 0.45, i * 70));
  }

  return (
    <section className="bg-[#06120d] text-[#faf7ef]" aria-label="Logo">
      <div ref={ref} className={styles.logoStage} data-drawn={inView ? "" : undefined}>
        <AnimatedMark onStrum={strum} />
        <div className={styles.wordmarkMask}>
          <p className={cn(styles.wordmark, styles.logoWordmark)} aria-label="Abel Kirar">
            {letters.map((letter, i) => (
              <span
                key={i}
                aria-hidden="true"
                className={letter === " " ? "inline-block w-[0.42em]" : styles.letter}
                style={{ "--d": `${1250 + Math.round(Math.abs(i - centre) * 45)}ms` } as CSSProperties}
              >
                {letter === " " ? " " : letter}
              </span>
            ))}
          </p>
        </div>
        <p className={styles.logoAcademy}>Academy</p>
        <p className="mt-10 text-xs tracking-[0.2em] text-[#faf7ef]/45 uppercase">Tap the mark · with Sound on, it plays</p>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8">
        <h2 className="font-heading text-2xl font-semibold sm:text-3xl">The exported files</h2>
        <p className="mt-2 max-w-2xl text-sm text-[#faf7ef]/65">
          These are the real files from <code className="text-[#d7b76e]">docs/brand/logo/</code>. Click any one to open it.
          Proposal only — the live site still uses the text &ldquo;Abelkirar&rdquo;.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Asset file="abelkirar-logo-horizontal-on-dark.svg" alt="Horizontal logo on dark" bg="dark" className="h-16 sm:h-20" />
          <Asset file="abelkirar-logo-horizontal-on-light.svg" alt="Horizontal logo on light" bg="light" className="h-16 sm:h-20" />
          <Asset file="abelkirar-logo-stacked-on-dark.svg" alt="Stacked logo on dark" bg="dark" className="h-40 sm:h-48" />
          <Asset file="abelkirar-logo-academy-on-light.svg" alt="Academy logo on light" bg="light" className="h-44 sm:h-52" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Asset file="abelkirar-avatar-1080.svg" alt="Social profile picture" bg="black" className="size-28 rounded-full sm:size-32" />
          <a href={BRAND("abelkirar-favicon.svg")} target="_blank" rel="noreferrer" className={cn(styles.logoAsset, "gap-4 bg-[#111]")}>
            {[64, 32, 16].map((size) => (
              // eslint-disable-next-line @next/next/no-img-element -- favicon at real pixel sizes
              <img key={size} src={BRAND("abelkirar-favicon.svg")} alt={`Browser icon at ${size}px`} width={size} height={size} />
            ))}
          </a>
          <Asset file="abelkirar-mark-black.svg" alt="One-colour mark, black" bg="white" className="h-28" />
          <Asset file="abelkirar-mark-white.svg" alt="One-colour mark, white" bg="black" className="h-28" />
        </div>
      </div>
    </section>
  );
}
