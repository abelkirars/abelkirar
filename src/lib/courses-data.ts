// `type` here is load-bearing, not stylistic: this module is imported from
// src/app/courses/[slug]/page.tsx and is reachable from client components.
// A value import of StudentLevel would pull the generated Prisma client into
// a browser bundle; a type-only import is erased entirely at compile time.
import type { StudentLevel } from "@prisma/client";

export interface CourseLevel {
  slug: string;
  level: string;
  title: string;
  tagline: string;
  description: string;
  topics: string[];
  price: number;
  /// Written literally per record — never derived from slug, title, or
  /// `level` above. Those are independent display copy; this is the one
  /// field this data model declares as actually meaning a StudentLevel.
  studentLevel: StudentLevel;
}

// Public marketing copy, also reachable from browser bundles. Keep only broad
// outcomes here; never import teaching manuals, lesson sequences or assessments.
export const COURSE_LEVELS: CourseLevel[] = [
  {
    slug: "beginner",
    level: "Level 1",
    title: "Beginner",
    tagline: "Build your foundation",
    description:
      "Build a reliable foundation for playing Kirar and accompanying Orthodox chanting.",
    topics: [
      "Build confidence playing the Kirar",
      "Develop a consistent practice habit",
      "Begin accompanying Ethiopian Orthodox chanting",
    ],
    price: 7000,
    studentLevel: "BEGINNER",
  },
  {
    slug: "intermediate",
    level: "Level 2",
    title: "Intermediate",
    tagline: "Strengthen your playing",
    description:
      "Strengthen your control, listening, and confidence while accompanying Orthodox chanting.",
    topics: [
      "Develop a more confident and expressive sound",
      "Strengthen listening and consistency",
      "Grow in confidence accompanying worship",
    ],
    price: 8500,
    studentLevel: "INTERMEDIATE",
  },
  {
    slug: "advanced",
    level: "Level 3",
    title: "Advanced",
    tagline: "Prepare to serve",
    description:
      "Refine your playing and judgement as you prepare for greater responsibility in church.",
    topics: [
      "Refine playing quality and judgement",
      "Prepare for greater responsibility in church",
      "Develop confidence serving alongside singers and other Kirar players",
    ],
    price: 10000,
    studentLevel: "ADVANCED",
  },
];
