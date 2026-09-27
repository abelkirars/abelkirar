/**
 * Everything the lab displays, loaded server-side from the live site's
 * translation files (messages/{locale}.json) by page.tsx. The lab never
 * invents marketing copy where the site already has some.
 */
export interface LabCopy {
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    startLearning: string;
    contactAbel: string;
  };
  home: {
    coursesEyebrow: string;
    coursesTitle: string;
    coursesDescription: string;
    instrumentsEyebrow: string;
    instrumentsTitle: string;
    instrumentsDescription: string;
  };
  purpose: {
    eyebrow: string;
    title: string;
    description: string;
    pillars: { title: string; description: string }[];
  };
  courses: {
    slug: CourseSlug;
    level: string;
    title: string;
    tagline: string;
    description: string;
  }[];
  plan: {
    legend: string;
    group: string;
    private: string;
    monthly: string;
    continue: string;
  };
  missionQuote: string;
  nav: { label: string }[];
  store: { view: string; production: string };
}

export type CourseSlug = "beginner" | "intermediate" | "advanced";

export interface DemoPlan {
  id: string;
  format: "GROUP" | "PRIVATE";
  /** Whole US dollars per month. */
  monthly: number;
}

/**
 * Demo pricing, matching the current public plans. Deliberately static: the
 * live site reads CoursePlan rows (src/lib/courses/public-plans.ts), and the
 * lab must not touch the database. Advanced is private tuition only.
 */
export const DEMO_PLANS: Record<CourseSlug, DemoPlan[]> = {
  beginner: [
    { id: "beginner-group", format: "GROUP", monthly: 50 },
    { id: "beginner-private", format: "PRIVATE", monthly: 70 },
  ],
  intermediate: [
    { id: "intermediate-group", format: "GROUP", monthly: 50 },
    { id: "intermediate-private", format: "PRIVATE", monthly: 85 },
  ],
  advanced: [{ id: "advanced-private", format: "PRIVATE", monthly: 100 }],
};

/** Level → how many of the glyph's three hairlines are lit. */
export const LEVEL_INDEX: Record<CourseSlug, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};
