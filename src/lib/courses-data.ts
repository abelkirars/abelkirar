// `type` here is load-bearing, not stylistic: this module is imported from
// src/app/courses/[slug]/page.tsx and is reachable from client components.
// A value import of StudentLevel would pull the generated Prisma client into
// a browser bundle; a type-only import is erased entirely at compile time.
import type { StudentLevel } from "@prisma/client";

/**
 * What a course *is*, as opposed to what it says about itself.
 *
 * Every piece of display copy that used to live here — level, title, tagline,
 * description, topics — now lives in messages/{locale}.json, where it is
 * translated and editable from /admin/content. Two consequences worth naming:
 * the detail page and the cards on /courses stopped being able to disagree
 * about a course's description (they had drifted), and the Amharic detail
 * page stopped rendering hard-coded English.
 *
 * What remains is the part that is not copy: the slug that forms the URL, the
 * price, and the StudentLevel this course maps onto. None of those should be
 * editable as text.
 */
export interface CourseLevel {
  slug: string;
  /// Fallback in cents. CoursePrice in the DB is authoritative when a row exists.
  price: number;
  /// Written literally per record — never derived from the slug or from any
  /// display copy. Those are independent; this is the one field this data
  /// model declares as actually meaning a StudentLevel.
  studentLevel: StudentLevel;
}

export const COURSE_LEVELS: CourseLevel[] = [
  { slug: "beginner", price: 7000, studentLevel: "BEGINNER" },
  { slug: "intermediate", price: 8500, studentLevel: "INTERMEDIATE" },
  { slug: "advanced", price: 10000, studentLevel: "ADVANCED" },
];

/** Spare slots stay blank until an admin adds an item; existing keys keep their edits. */
export const COURSE_TOPIC_SLOTS = Array.from({ length: 50 }, (_, index) => index + 1);
export const COURSE_PLAN_FIELDS = ["duration", "schedule", "prerequisite"] as const;

export function coursePlanItems(readDetail: (field: (typeof COURSE_PLAN_FIELDS)[number]) => string) {
  return COURSE_PLAN_FIELDS.map((field) => ({ field, text: readDetail(field).trim() }))
    .filter((item) => item.text.length > 0);
}

export function courseOverviewItems(readTopic: (slot: number) => string) {
  return COURSE_TOPIC_SLOTS.map((slot) => ({ slot, text: readTopic(slot).trim() }))
    .filter((item) => item.text.length > 0);
}
