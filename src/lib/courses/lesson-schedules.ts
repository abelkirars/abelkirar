import "server-only";
import type { CourseLessonScheduleSlot, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentAuthenticatedCustomer } from "@/lib/customer/dal";
import { resolveStudentSession } from "@/lib/student/dal";
import { courseAdmin, serializable } from "./admin-service";
import { lessonOwnerSchema, lessonPairSchema, recurringLessonsConflict, type LessonOwner, type LessonRecurrence } from "./lesson-schedule-rules";

const scope = (owner: LessonOwner) => owner.kind === "cohort" ? { cohortId: owner.id } : { enrollmentId: owner.id };
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
function recurrence(s: CourseLessonScheduleSlot): LessonRecurrence {
  return { ordinal: s.ordinal as 1 | 2, weekday: s.weekday, localStartMinute: s.localStartMinute, durationMinutes: s.durationMinutes,
    timeZone: s.timeZone as "America/Chicago", effectiveStartDate: dateOnly(s.effectiveStartDate), effectiveEndDate: s.effectiveEndDate ? dateOnly(s.effectiveEndDate) : null };
}
async function lockOwner(tx: Prisma.TransactionClient, owner: LessonOwner) {
  if (owner.kind === "cohort") {
    await tx.$queryRaw`SELECT id FROM "CourseCohort" WHERE id=${owner.id} FOR UPDATE`;
    const c = await tx.courseCohort.findUnique({ where: { id: owner.id }, include: { coursePlan: true } });
    if (!c || c.archivedAt || ["COMPLETED", "CANCELLED"].includes(c.status) || c.coursePlan.format !== "GROUP") throw new Error("Invalid group schedule owner");
  } else {
    await tx.$queryRaw`SELECT id FROM "CourseEnrollment" WHERE id=${owner.id} FOR UPDATE`;
    const e = await tx.courseEnrollment.findUnique({ where: { id: owner.id }, include: { coursePlan: true } });
    if (!e || e.archivedAt || ["COMPLETED", "CANCELLED"].includes(e.status) || e.formatSnapshot !== "ONE_TO_ONE" || e.coursePlan.format !== "ONE_TO_ONE" || e.cohortId) throw new Error("Invalid private schedule owner");
  }
}
async function lockTeacher(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Admin" WHERE id=${id} AND "isActive"=true FOR UPDATE`;
  if (rows.length !== 1) throw new Error("Explicit active teacher required");
}

/** Admin-only foundation; no public action/route is exposed by this phase. */
export async function saveLessonScheduleDraft(rawOwner: unknown, raw: unknown) {
  const admin = await courseAdmin();
  const owner = lessonOwnerSchema.parse(rawOwner);
  const input = lessonPairSchema.parse(raw);
  return serializable(async tx => {
    await lockOwner(tx, owner);
    await lockTeacher(tx, input.teacherAdminId);
    const current = await tx.courseLessonScheduleSlot.findMany({ where: { ...scope(owner), archivedAt: null } });
    if (current.some(s => s.state === "PUBLISHED")) throw new Error("Published schedules cannot be edited in this phase");
    for (const slot of input.slots) {
      const existing = current.find(s => s.ordinal === slot.ordinal);
      const data = { ...slot, teacherAdminId: input.teacherAdminId, effectiveStartDate: new Date(`${slot.effectiveStartDate}T00:00:00Z`),
        effectiveEndDate: slot.effectiveEndDate ? new Date(`${slot.effectiveEndDate}T00:00:00Z`) : null,
        state: "DRAFT" as const, updatedByAdminId: admin.adminId };
      if (existing?.state === "LEGACY") {
        await tx.courseLessonScheduleSlot.update({ where: { id: existing.id }, data: { archivedAt: new Date(), updatedByAdminId: admin.adminId } });
      }
      if (existing?.state === "DRAFT") await tx.courseLessonScheduleSlot.update({ where: { id: existing.id }, data });
      else await tx.courseLessonScheduleSlot.create({ data: { ...scope(owner), ...data, createdByAdminId: admin.adminId } });
    }
    return tx.courseLessonScheduleSlot.findMany({ where: { ...scope(owner), archivedAt: null }, orderBy: { ordinal: "asc" } });
  });
}

export async function publishLessonSchedule(rawOwner: unknown) {
  const admin = await courseAdmin();
  const owner = lessonOwnerSchema.parse(rawOwner);
  return serializable(async tx => {
    await lockOwner(tx, owner);
    const slots = await tx.courseLessonScheduleSlot.findMany({ where: { ...scope(owner), archivedAt: null }, orderBy: { ordinal: "asc" } });
    const input = lessonPairSchema.parse({ teacherAdminId: slots[0]?.teacherAdminId, slots: slots.map(recurrence) });
    if (slots.some(s => s.teacherAdminId !== input.teacherAdminId)) throw new Error("Both lessons require the same teacher");
    await lockTeacher(tx, input.teacherAdminId);
    if (slots.every(s => s.state === "PUBLISHED")) return slots; // Identical publication replay.
    if (slots.some(s => s.state !== "DRAFT")) throw new Error("Configure both drafts explicitly before publication");
    const competing = await tx.courseLessonScheduleSlot.findMany({ where: { teacherAdminId: input.teacherAdminId, state: "PUBLISHED", archivedAt: null } });
    if (slots.some(a => competing.some(b => recurringLessonsConflict(recurrence(a), recurrence(b))))) throw new Error("Teacher recurring lesson conflict");
    // Unmapped legacy commitments cannot be silently treated as teacher availability.
    const unresolved = await tx.courseLessonScheduleSlot.count({ where: { state: "LEGACY", archivedAt: null, NOT: scope(owner) } });
    if (unresolved) throw new Error("Resolve legacy teacher schedules before publishing new commitments");
    await tx.courseLessonScheduleSlot.updateMany({ where: { ...scope(owner), archivedAt: null, state: "DRAFT" },
      data: { state: "PUBLISHED", publishedAt: new Date(), publishedByAdminId: admin.adminId, updatedByAdminId: admin.adminId } });
    return tx.courseLessonScheduleSlot.findMany({ where: { ...scope(owner), archivedAt: null }, orderBy: { ordinal: "asc" } });
  });
}

async function readTransition(owner: LessonOwner) {
  const slots = await prisma.courseLessonScheduleSlot.findMany({ where: { ...scope(owner), archivedAt: null, state: "PUBLISHED" }, orderBy: { ordinal: "asc" } });
  if (slots.length === 2) return { state: "PUBLISHED" as const, slots: slots.map(recurrence), legacy: null };
  if (slots.length) throw new Error("Incomplete published schedule");
  // Read the SQL TIME as a civil string, never as an instant with a 1970 offset.
  const legacy = owner.kind === "cohort" ? (await prisma.$queryRaw<{
    weekday: string | null; localStartTime: string | null; durationMinutes: number | null;
    timeZone: string | null; effectiveStartDate: string | null; effectiveEndDate: string | null;
  }[]>`SELECT "weeklyDay" AS weekday,"localStartTime"::text AS "localStartTime","durationMinutes","timeZone",
    "courseStartDate"::text AS "effectiveStartDate","courseEndDate"::text AS "effectiveEndDate"
    FROM "CourseCohort" WHERE id=${owner.id}`)[0] ?? null : null;
  return { state: "INCOMPLETE" as const, slots: [], legacy };
}
export async function readAdminLessonSchedule(rawOwner: unknown) {
  await courseAdmin();
  const owner = lessonOwnerSchema.parse(rawOwner);
  return { ...await readTransition(owner), currentSlots: await prisma.courseLessonScheduleSlot.findMany({
    where: { ...scope(owner), archivedAt: null }, orderBy: { ordinal: "asc" },
  }) };
}
/** Caller cannot supply customer/student identity or an arbitrary cohort ID. */
export async function readCustomerLessonSchedule(enrollmentId: string) {
  const customer = await getCurrentAuthenticatedCustomer();
  if (!customer || customer.status !== "ACTIVE" || customer.archivedAt) throw new Error("Customer authentication required");
  const e = await prisma.courseEnrollment.findFirst({ where: { id: enrollmentId, customerId: customer.id, archivedAt: null } });
  if (!e) throw new Error("Enrollment not found");
  return readTransition(e.cohortId ? { kind: "cohort", id: e.cohortId } : { kind: "enrollment", id: e.id });
}
export async function readStudentLessonSchedule(enrollmentId: string) {
  const session = await resolveStudentSession();
  if (session.kind !== "active") throw new Error("Student portal access required");
  const e = await prisma.courseEnrollment.findFirst({ where: { id: enrollmentId, studentId: session.session.studentId, status: "ACTIVE", archivedAt: null,
    portalAccess: { is: { status: "ENABLED", archivedAt: null } } } });
  if (!e) throw new Error("Enrollment not found");
  return readTransition(e.cohortId ? { kind: "cohort", id: e.cohortId } : { kind: "enrollment", id: e.id });
}
