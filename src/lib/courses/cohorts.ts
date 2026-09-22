import "server-only";
import type { CourseCohort, CourseCohortSeat, CoursePlan } from "@prisma/client";
import { prisma } from "@/lib/db";
import { courseAdmin, serializable } from "./admin-service";
import { assertFourSeats, cohortCreateSchema, scheduleSchema, PreparationValidationError } from "./preparation-rules";

export function assertGroupPlan(plan: CoursePlan | null) {
  if (!plan || !plan.active || plan.archivedAt || plan.format !== "GROUP" || plan.groupMaximumStudents !== 4 || plan.groupMinimumStudents !== 3) throw new PreparationValidationError("An active 3–4 student GROUP plan is required");
}
export function assertCohortReady(cohort: CourseCohort & { seats: CourseCohortSeat[]; coursePlan: CoursePlan }) {
  assertGroupPlan(cohort.coursePlan);
  if (cohort.archivedAt || cohort.minimumStudents !== 3 || cohort.maximumStudents !== 4) throw new PreparationValidationError("Invalid cohort capacity or archive state");
  scheduleSchema.parse({ weeklyDay: cohort.weeklyDay, localStartTime: cohort.localStartTime?.toISOString().slice(11, 16), durationMinutes: cohort.durationMinutes, timeZone: cohort.timeZone, courseStartDate: cohort.courseStartDate?.toISOString().slice(0, 10), courseEndDate: cohort.courseEndDate?.toISOString().slice(0, 10) ?? null });
  assertFourSeats(cohort.seats);
}
export function assertCohortSelectable(cohort: Parameters<typeof assertCohortReady>[0], planId: string) {
  assertCohortReady(cohort);
  if (cohort.status !== "OPEN" || cohort.coursePlanId !== planId || !cohort.seats.some(s => !s.currentEnrollmentId)) throw new PreparationValidationError("Choose an OPEN matching cohort with an available seat");
}
export async function listAdminCohorts() {
  await courseAdmin();
  return prisma.courseCohort.findMany({ include: { coursePlan: true, seats: { orderBy: { position: "asc" } } }, orderBy: { createdAt: "desc" } });
}
export async function getAdminCohort(id: string) {
  await courseAdmin();
  return prisma.courseCohort.findUnique({ where: { id }, include: { coursePlan: true, seats: { orderBy: { position: "asc" } } } });
}
export async function createCohort(raw: unknown) {
  await courseAdmin();
  const input = cohortCreateSchema.parse(raw);
  return serializable(async tx => {
    const plan = await tx.coursePlan.findUnique({ where: { id: input.coursePlanId } });
    assertGroupPlan(plan);
    const existing = await tx.courseCohort.findUnique({ where: { code: input.code }, include: { seats: true } });
    if (existing) {
      if (existing.coursePlanId !== input.coursePlanId || existing.name !== input.name || existing.archivedAt) throw new PreparationValidationError("Cohort code already belongs to a different cohort");
      assertFourSeats(existing.seats);
      return existing; // Never overwrite existing seat assignments on retry.
    }
    return tx.courseCohort.create({ data: { ...input, seats: { create: [1, 2, 3, 4].map(position => ({ position })) } }, include: { seats: true } });
  });
}
export async function configureCohort(id: string, raw: unknown) {
  await courseAdmin();
  const input = scheduleSchema.parse(raw);
  return serializable(async tx => {
    await tx.$queryRaw`SELECT id FROM "CourseCohort" WHERE id = ${id} FOR UPDATE`;
    const cohort = await tx.courseCohort.findUnique({ where: { id }, include: { coursePlan: true } });
    if (!cohort || cohort.archivedAt || cohort.status !== "DRAFT") throw new PreparationValidationError("Only a DRAFT cohort can be configured");
    assertGroupPlan(cohort.coursePlan);
    return tx.courseCohort.update({ where: { id }, data: { ...input, localStartTime: new Date(`1970-01-01T${input.localStartTime}:00Z`), courseStartDate: new Date(`${input.courseStartDate}T00:00:00Z`), courseEndDate: input.courseEndDate ? new Date(`${input.courseEndDate}T00:00:00Z`) : null } });
  });
}
export async function openCohort(id: string) {
  await courseAdmin();
  return serializable(async tx => {
    await tx.$queryRaw`SELECT id FROM "CourseCohort" WHERE id = ${id} FOR UPDATE`;
    const cohort = await tx.courseCohort.findUnique({ where: { id }, include: { coursePlan: true, seats: true } });
    if (!cohort || !["DRAFT", "OPEN"].includes(cohort.status)) throw new PreparationValidationError("Only DRAFT cohorts can transition to OPEN");
    assertCohortReady(cohort);
    if (!cohort.seats.some(s => !s.currentEnrollmentId)) throw new PreparationValidationError("No available seats");
    if (cohort.status === "OPEN") return cohort;
    return tx.courseCohort.update({ where: { id }, data: { status: "OPEN" } });
  });
}
