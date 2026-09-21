import "server-only";

import { prisma } from "@/lib/db";

export const COURSE_PLAN_CODES = [
  "BEGINNER_GROUP",
  "BEGINNER_ONE_TO_ONE",
  "INTERMEDIATE_GROUP",
  "INTERMEDIATE_ONE_TO_ONE",
  "ADVANCED_ONE_TO_ONE",
] as const;

export type CoursePlanCode = (typeof COURSE_PLAN_CODES)[number];

const publicCoursePlanSelect = {
  id: true,
  code: true,
  level: true,
  format: true,
  billingInterval: true,
  monthlyPriceCents: true,
  currency: true,
  groupMinimumStudents: true,
  groupMaximumStudents: true,
  displayOrder: true,
} as const;

/** CoursePlan is the only price source returned by this new service. */
export async function listActiveCoursePlans() {
  return prisma.coursePlan.findMany({
    where: {
      code: { in: [...COURSE_PLAN_CODES] },
      active: true,
      archivedAt: null,
    },
    select: publicCoursePlanSelect,
    orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
  });
}

export async function getActiveCoursePlanByCode(code: CoursePlanCode) {
  return prisma.coursePlan.findFirst({
    where: { code, active: true, archivedAt: null },
    select: publicCoursePlanSelect,
  });
}
