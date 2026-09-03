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

export const COURSE_LEVELS: CourseLevel[] = [
  {
    slug: "beginner",
    level: "Level 1",
    title: "Beginner",
    tagline: "Start from silence",
    description:
      "Build the foundation: how the Kirar is held, tuned, and played, and how it carries Ethiopian Orthodox worship.",
    topics: [
      "Introduction to the Kirar and its history",
      "The Kirar in Ethiopian music and church tradition",
      "Hand placement and finger technique",
      "Tuning the Kirar",
      "Understanding keys and measures",
      "Learning scales, including Tizita",
      "Basic songs",
    ],
    price: 7000,
    studentLevel: "BEGINNER",
  },
  {
    slug: "intermediate",
    level: "Level 2",
    title: "Intermediate",
    tagline: "Find your voice",
    description:
      "Sharpen technique and rhythm, and begin playing alongside singers with a tone and style of your own.",
    topics: [
      "More advanced techniques",
      "Rhythm development",
      "Playing spiritual songs",
      "Improving tone quality",
      "Playing with singers",
      "Developing personal style",
    ],
    price: 8500,
    studentLevel: "INTERMEDIATE",
  },
  {
    slug: "advanced",
    level: "Level 3",
    title: "Advanced",
    tagline: "Lead worship",
    description:
      "Professional technique, complex rhythm and arrangement, and the performance skills to lead in church.",
    topics: [
      "Professional Kirar techniques",
      "Complex rhythms",
      "Advanced arrangements",
      "Church performance skills",
      "Recording and performing professionally",
    ],
    price: 10000,
    studentLevel: "ADVANCED",
  },
];
