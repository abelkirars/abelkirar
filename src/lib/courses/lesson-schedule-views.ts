import "server-only";
import { Temporal } from "@js-temporal/polyfill";
import { prisma } from "@/lib/db";
import { resolveStudentSession } from "@/lib/student/dal";
import { courseAdmin } from "./admin-service";
import { lessonOwnerSchema } from "./lesson-schedule-rules";
import { readAdminLessonSchedule, readStudentLessonSchedule } from "./lesson-schedules";
import { LESSON_TIME_ZONE, type MyLessonSchedule } from "./lesson-schedule-presentation";

export async function getAdminLessonScheduleEditor(rawOwner: unknown) {
  await courseAdmin();
  const owner = lessonOwnerSchema.parse(rawOwner);
  const entity = owner.kind === "cohort"
    ? await prisma.courseCohort.findUnique({ where: { id: owner.id }, include: { coursePlan: true } })
    : await prisma.courseEnrollment.findUnique({ where: { id: owner.id }, include: { coursePlan: true, student: { select: { fullName: true } } } });
  if (!entity || (owner.kind === "cohort" ? entity.coursePlan.format !== "GROUP"
    : !("formatSnapshot" in entity) || entity.formatSnapshot !== "ONE_TO_ONE" || entity.coursePlan.format !== "ONE_TO_ONE" || entity.cohortId)) return null;
  const [schedule, teachers] = await Promise.all([
    readAdminLessonSchedule(owner),
    prisma.admin.findMany({ where: { isActive: true }, select: { id: true, displayName: true }, orderBy: [{ displayName: "asc" }, { id: "asc" }] }),
  ]);
  const slots = schedule.currentSlots.map(slot => ({
    ordinal: slot.ordinal as 1 | 2, weekday: slot.weekday, localStartMinute: slot.localStartMinute,
    durationMinutes: slot.durationMinutes, timeZone: slot.timeZone,
    effectiveStartDate: slot.effectiveStartDate.toISOString().slice(0, 10),
    effectiveEndDate: slot.effectiveEndDate?.toISOString().slice(0, 10) ?? null,
    state: slot.state, teacherAdminId: slot.teacherAdminId,
  }));
  return {
    owner, name: "name" in entity ? entity.name : entity.student.fullName,
    code: "code" in entity ? entity.code : entity.id,
    plan: entity.coursePlan.code, ownerStatus: entity.status,
    terminal: !!entity.archivedAt || ["COMPLETED", "CANCELLED"].includes(entity.status),
    state: slots.some(s => s.state === "LEGACY") ? "LEGACY" as const
      : slots.length === 2 && slots.every(s => s.state === "PUBLISHED") ? "PUBLISHED" as const
      : slots.length ? "DRAFT" as const : "INCOMPLETE" as const,
    slots, teachers,
    // Preserve fallback context without inventing a slot, teacher or timezone conversion.
    legacy: schedule.legacy,
    revision: schedule.currentSlots.map(s => `${s.id}:${s.updatedAt.toISOString()}`).join("|"),
  };
}

export type AdminLessonScheduleEditor = NonNullable<Awaited<ReturnType<typeof getAdminLessonScheduleEditor>>>;

export async function listAdminLessonScheduleOwners(search = "") {
  await courseAdmin();
  const term = search.trim().slice(0, 80);
  const [cohorts, enrollments] = await Promise.all([
    prisma.courseCohort.findMany({
      where: { coursePlan: { format: "GROUP" }, ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" as const } }, { code: { contains: term, mode: "insensitive" as const } }] } : {}) },
      select: { id: true, name: true, code: true, status: true, archivedAt: true, coursePlan: { select: { code: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 50,
    }),
    prisma.courseEnrollment.findMany({
      where: { formatSnapshot: "ONE_TO_ONE", cohortId: null, coursePlan: { format: "ONE_TO_ONE" }, ...(term ? { student: { fullName: { contains: term, mode: "insensitive" as const } } } : {}) },
      select: { id: true, status: true, archivedAt: true, planCodeSnapshot: true, student: { select: { fullName: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 50,
    }),
  ]);
  return { cohorts, enrollments };
}

/** No caller-supplied learner/customer/cohort ID. The DAL supplies the learner. */
export async function readMyLessonSchedules(): Promise<MyLessonSchedule[]> {
  const auth = await resolveStudentSession();
  if (auth.kind !== "active") throw new Error("Student portal access required");
  const enrollments = await prisma.courseEnrollment.findMany({
    where: {
      studentId: auth.session.studentId, status: "ACTIVE", archivedAt: null,
      portalAccess: { is: { status: "ENABLED", archivedAt: null } },
      OR: [
        { formatSnapshot: "GROUP", coursePlan: { format: "GROUP" }, cohort: { is: { archivedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] } } } },
        { formatSnapshot: "ONE_TO_ONE", coursePlan: { format: "ONE_TO_ONE" }, cohortId: null },
      ],
    },
    select: { id: true, planCodeSnapshot: true, cohort: { select: { name: true } } }, orderBy: { id: "asc" },
  });
  const today = Temporal.Now.plainDateISO(LESSON_TIME_ZONE).toString();
  const result: MyLessonSchedule[] = [];
  for (const enrollment of enrollments) {
    const schedule = await readStudentLessonSchedule(enrollment.id);
    if (schedule.state !== "PUBLISHED") continue;
    const first = schedule.slots[0];
    if (first.effectiveEndDate && first.effectiveEndDate < today) continue;
    result.push({ enrollmentId: enrollment.id, plan: enrollment.planCodeSnapshot, cohortName: enrollment.cohort?.name ?? null,
      slots: schedule.slots, startsLater: first.effectiveStartDate > today });
  }
  return result;
}
