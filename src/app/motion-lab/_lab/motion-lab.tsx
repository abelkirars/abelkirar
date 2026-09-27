"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandReveal } from "./brand-reveal";
import { CourseSection } from "./course-section";
import { HeroDemo } from "./hero-demo";
import { getKirarAudio } from "./kirar-audio";
import { InstrumentSection, type InstrumentCopy } from "./instrument-section";
import { MicroBoard } from "./micro-board";
import { MotionPrefsProvider, useMotionPrefs } from "./motion-prefs";
import { MotionSpec } from "./motion-spec";
import { PurposeSection } from "./purpose-section";
import { LowerThirdPlayer, SocialPlayer } from "./social-player";
import type { LabCopy } from "./copy";
import styles from "./motion-lab.module.css";

const SECTIONS = [
  { id: "title", label: "Title" },
  { id: "hero", label: "Hero" },
  { id: "transition", label: "Transition" },
  { id: "courses", label: "Courses" },
  { id: "instruments", label: "Instruments" },
  { id: "micro", label: "Micro" },
  { id: "social", label: "Social" },
  { id: "tokens", label: "Tokens" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function LabSection({
  id,
  index,
  title,
  dark,
  onReplay,
  children,
}: {
  id: SectionId;
  index: number;
  title: string;
  dark?: boolean;
  onReplay?: () => void;
  children: ReactNode;
}) {
  return (
    <div id={id} className="relative scroll-mt-[var(--header-height)]">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-4 sm:px-6 lg:px-8",
          dark ? "text-[#faf7ef]" : "text-[#182d24]",
        )}
      >
        <span className={cn(styles.sectionLabel, "opacity-60")}>
          {String(index).padStart(2, "0")}
          <span className="hidden sm:inline"> · {title}</span>
        </span>
        {onReplay ? (
          <button type="button" onClick={onReplay} className={cn(styles.replay, "pointer-events-auto")}>
            <RotateCcw aria-hidden="true" className="size-3.5" />
            Replay
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function LabBar() {
  const { override, setOverride, systemReduced } = useMotionPrefs();
  return (
    <div className={styles.labBar}>
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
        <div>
          <p className={cn(styles.sectionLabel, "text-[#d7b76e]")}>Internal preview · not linked · dev only</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Abelkirar Motion Lab</h1>
          <nav aria-label="Lab sections" className="mt-4 flex flex-wrap gap-2">
            {SECTIONS.map((section) => (
              <a key={section.id} href={`#${section.id}`} className={styles.chip}>
                {section.label}
              </a>
            ))}
          </nav>
        </div>
        <div>
          <p className="mb-2 text-xs text-[#faf7ef]/60">
            Motion preference (your device: {systemReduced ? "reduced" : "full"})
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Motion preference">
            {(["system", "full", "reduced"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={override === value}
                onClick={() => setOverride(value)}
                className={styles.chip}
              >
                {value === "system" ? "Follow device" : value === "full" ? "Full motion" : "Reduced motion"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LabBody({ copy, instruments }: { copy: LabCopy; instruments: InstrumentCopy[] }) {
  const { reduced } = useMotionPrefs();
  const [runs, setRuns] = useState<Record<string, number>>({});
  const replay = (id: SectionId) => () => setRuns((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  const run = (id: SectionId) => `${id}-${runs[id] ?? 0}-${reduced ? "r" : "f"}`;

  // Leaving the lab silences the instrument and lets the audio device sleep.
  useEffect(() => () => getKirarAudio().disable(), []);

  return (
    <div className={styles.lab} data-motion={reduced ? "reduced" : "full"}>
      <LabBar />

      <LabSection id="title" index={1} title="Title sequence" dark onReplay={replay("title")}>
        <BrandReveal key={run("title")} subline={`${copy.hero.eyebrow} · ${copy.home.instrumentsEyebrow}`} reduced={reduced} />
      </LabSection>

      <LabSection id="hero" index={2} title="Hero · strings · headline" dark onReplay={replay("hero")}>
        <HeroDemo key={run("hero")} copy={copy.hero} reduced={reduced} />
      </LabSection>

      <LabSection id="transition" index={3} title="Section transition" onReplay={replay("transition")}>
        <PurposeSection key={run("transition")} copy={copy.purpose} reduced={reduced} />
      </LabSection>

      <LabSection id="courses" index={4} title="Courses · plans · CTA" onReplay={replay("courses")}>
        <CourseSection key={run("courses")} home={copy.home} courses={copy.courses} planCopy={copy.plan} />
      </LabSection>

      <LabSection id="instruments" index={5} title="Instruments" dark onReplay={replay("instruments")}>
        <InstrumentSection
          key={run("instruments")}
          home={copy.home}
          instruments={instruments}
          missionQuote={copy.missionQuote}
          reduced={reduced}
        />
      </LabSection>

      <LabSection id="micro" index={6} title="Microinteractions" onReplay={replay("micro")}>
        <MicroBoard key={run("micro")} copy={copy} />
      </LabSection>

      <LabSection id="social" index={7} title="Social · 1080 × 1920" dark>
        <section className="bg-[#06120d] py-16 text-[#faf7ef] sm:py-24" aria-label="Social motion">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                A 15-second vertical title sequence
              </h2>
              <p className="mt-4 text-[#faf7ef]/70">
                Hook in the first half-second, text kept inside platform safe zones, and a final frame identical to the
                first so Reels, TikTok and Shorts loop seamlessly. Every frame is a pure function of time — ready to be
                rendered to video later.
              </p>
            </div>
            <div className="mt-10">
              <SocialPlayer reduced={reduced} />
            </div>
            <div className="mt-16 max-w-3xl">
              <LowerThirdPlayer reduced={reduced} />
            </div>
          </div>
        </section>
      </LabSection>

      <LabSection id="tokens" index={8} title="Tokens">
        <MotionSpec />
      </LabSection>
    </div>
  );
}

export function MotionLab({ copy, instruments }: { copy: LabCopy; instruments: InstrumentCopy[] }) {
  return (
    <MotionPrefsProvider>
      <LabBody copy={copy} instruments={instruments} />
    </MotionPrefsProvider>
  );
}
