"use client";

import { useId, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { useInView } from "./hooks";
import { Eyebrow, Fade, RevealText } from "./reveal";
import { StringButton } from "./string-button";
import { STAGGER_MS } from "./tokens";
import { DEMO_PLANS, LEVEL_INDEX, type DemoPlan, type LabCopy } from "./copy";
import styles from "./motion-lab.module.css";

interface Roll {
  from: number | null;
  to: number;
  dir: "up" | "down";
  key: number;
}

function RollingNumber({ roll }: { roll: Roll }) {
  return (
    <span className={styles.roll} data-dir={roll.dir}>
      {roll.from !== null ? (
        <span key={`out-${roll.key}`} className={styles.rollOut} aria-hidden="true">
          {roll.from}
        </span>
      ) : null}
      <span key={`in-${roll.key}`} className={roll.key ? styles.rollIn : undefined}>
        {roll.to}
      </span>
    </span>
  );
}

function LevelGlyph({ lit, delay }: { lit: number; delay: number }) {
  return (
    <span className={styles.levelGlyph} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={styles.levelTick}
          data-lit={i < lit ? "" : undefined}
          style={{ "--d": `${delay + i * 90}ms`, "--ring": `${i * 70}ms` } as CSSProperties}
        />
      ))}
    </span>
  );
}

function CourseCard({
  course,
  plans,
  planCopy,
  active,
  index,
}: {
  course: LabCopy["courses"][number];
  plans: DemoPlan[];
  planCopy: LabCopy["plan"];
  active: boolean;
  index: number;
}) {
  const name = useId();
  const [selected, setSelected] = useState(plans[0].id);
  const [touched, setTouched] = useState(false);
  const [roll, setRoll] = useState<Roll>({ from: null, to: plans[0].monthly, dir: "up", key: 0 });
  const delay = 200 + index * STAGGER_MS.card;

  function choose(plan: DemoPlan) {
    if (plan.id === selected) return;
    const current = plans.find((p) => p.id === selected) ?? plans[0];
    setSelected(plan.id);
    setTouched(true);
    setRoll((previous) => ({
      from: current.monthly,
      to: plan.monthly,
      dir: plan.monthly >= current.monthly ? "up" : "down",
      key: previous.key + 1,
    }));
  }

  return (
    <article
      className={styles.courseCard}
      data-reveal={active ? "in" : "idle"}
      style={{ "--d": `${delay}ms` } as CSSProperties}
    >
      <div className="flex h-full flex-col p-6 sm:p-7 md:grid md:grid-cols-[1fr_1.05fr] md:gap-10 lg:flex lg:gap-0">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-[0.2em] text-[#8a5f10] uppercase">{course.level}</span>
            <LevelGlyph lit={LEVEL_INDEX[course.slug]} delay={delay + 450} />
          </div>
          <RevealText
            as="h3"
            text={course.title}
            active={active}
            delay={delay + 320}
            className="mt-5 font-heading text-3xl font-semibold tracking-tight"
          />
          <p className="mt-1 text-sm font-medium text-[#b5502d]">{course.tagline}</p>
          <p className="mt-4 text-pretty text-[#52615a]">{course.description}</p>
          <p className="mt-6 flex items-baseline gap-2">
            <span className="font-heading text-5xl font-semibold tracking-tight">
              <span className="mr-0.5 align-top text-2xl">$</span>
              <RollingNumber roll={roll} />
            </span>
            <span className="text-sm text-[#52615a]">{planCopy.monthly}</span>
          </p>
        </div>

        <div className="mt-7 flex flex-col md:mt-0 lg:mt-7 lg:flex-1">
          <fieldset>
            <legend className="mb-3 text-sm font-semibold">{planCopy.legend}</legend>
            <div className="space-y-3">
              {plans.map((plan) => {
                const isSelected = plan.id === selected;
                return (
                  <label
                    key={plan.id}
                    className={cn(styles.plan, styles.travel)}
                    data-selected={isSelected ? "" : undefined}
                    data-travel={isSelected && touched ? "" : undefined}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name={name}
                      value={plan.id}
                      checked={isSelected}
                      onChange={() => choose(plan)}
                    />
                    <span className="flex items-center justify-between gap-4">
                      <span>
                        <span className="block font-semibold">
                          {plan.format === "GROUP" ? planCopy.group : planCopy.private}
                        </span>
                        <span className="mt-0.5 block text-sm opacity-75">
                          ${plan.monthly} {planCopy.monthly}
                        </span>
                      </span>
                      <span className={styles.planMark} aria-hidden="true">
                        <svg viewBox="0 0 24 24" className="size-3.5">
                          <path pathLength={1} className={styles.planCheck} d="M5 12.5l4.2 4.2L19 7" />
                        </svg>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="mt-auto pt-6">
            <StringButton variant="forest" className="w-full">
              {planCopy.continue}
            </StringButton>
          </div>
        </div>
      </div>
    </article>
  );
}

export function CourseSection({
  home,
  courses,
  planCopy,
}: {
  home: LabCopy["home"];
  courses: LabCopy["courses"];
  planCopy: LabCopy["plan"];
}) {
  const [headRef, headIn] = useInView<HTMLDivElement>(0.4);
  const [gridRef, gridIn] = useInView<HTMLDivElement>(0.15);

  return (
    <section className="bg-[#f4efe2] py-16 sm:py-24" aria-label="Courses">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div ref={headRef} className="mx-auto max-w-2xl text-center">
          <Eyebrow active={headIn} className="text-[#8a5f10]">
            {home.coursesEyebrow}
          </Eyebrow>
          <RevealText
            as="h2"
            text={home.coursesTitle}
            active={headIn}
            delay={120}
            className="mt-4 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-5xl"
          />
          <Fade as="p" active={headIn} delay={520} className="mt-5 text-lg text-pretty text-[#52615a]">
            {home.coursesDescription}
          </Fade>
        </div>

        <div ref={gridRef} className="mt-12 grid gap-6 lg:grid-cols-3">
          {courses.map((course, index) => (
            <CourseCard
              key={course.slug}
              course={course}
              plans={DEMO_PLANS[course.slug]}
              planCopy={planCopy}
              active={gridIn}
              index={index}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
