import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

export const lessonWeekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export const lessonOwnerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cohort"), id: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("enrollment"), id: z.string().min(1) }).strict(),
]);
export type LessonOwner = z.infer<typeof lessonOwnerSchema>;
const civilDate = z.iso.date().refine(v => { try { Temporal.PlainDate.from(v); return true; } catch { return false; } });
export const lessonSlotSchema = z.object({
  ordinal: z.union([z.literal(1), z.literal(2)]),
  weekday: z.enum(lessonWeekdays),
  localStartMinute: z.number().int().min(0).max(1439),
  durationMinutes: z.number().int().min(15).max(480),
  timeZone: z.literal("America/Chicago"),
  effectiveStartDate: civilDate,
  effectiveEndDate: civilDate.nullable(),
}).strict().refine(s => s.localStartMinute + s.durationMinutes <= 1440, "Lesson cannot cross midnight")
  .refine(s => !s.effectiveEndDate || s.effectiveEndDate >= s.effectiveStartDate, "Invalid effective dates");
export const lessonPairSchema = z.object({
  teacherAdminId: z.string().min(1),
  slots: z.array(lessonSlotSchema).length(2),
}).strict().superRefine(({ slots }, ctx) => {
  if (new Set(slots.map(s => s.ordinal)).size !== 2) ctx.addIssue({ code: "custom", message: "Use ordinals 1 and 2" });
  if (new Set(slots.map(s => s.weekday)).size !== 2) ctx.addIssue({ code: "custom", message: "Choose two different weekdays" });
  if (slots.some(s => s.effectiveStartDate !== slots[0].effectiveStartDate || s.effectiveEndDate !== slots[0].effectiveEndDate)) {
    ctx.addIssue({ code: "custom", message: "Both lessons require the same effective date window" });
  }
});
export type LessonRecurrence = z.infer<typeof lessonSlotSchema>;

/** Inclusive date windows; no finite search horizon and no UTC-week arithmetic. */
export function recurringLessonsConflict(a: LessonRecurrence, b: LessonRecurrence): boolean {
  if (a.weekday !== b.weekday || a.localStartMinute >= b.localStartMinute + b.durationMinutes || b.localStartMinute >= a.localStartMinute + a.durationMinutes) return false;
  const first = Temporal.PlainDate.from(a.effectiveStartDate > b.effectiveStartDate ? a.effectiveStartDate : b.effectiveStartDate);
  const ends = [a.effectiveEndDate, b.effectiveEndDate].filter((d): d is string => d !== null).sort();
  const occurrence = first.add({ days: (lessonWeekdays.indexOf(a.weekday) + 1 - first.dayOfWeek + 7) % 7 });
  return !ends.length || Temporal.PlainDate.compare(occurrence, Temporal.PlainDate.from(ends[0])) <= 0;
}

/** Resolve only an actual civil occurrence. Invalid/ambiguous endpoints fail closed.
 * Duration describes the local timetable interval, not a billing quantity.
 */
export function lessonOccurrence(slot: LessonRecurrence, date: string) {
  const day = Temporal.PlainDate.from(date);
  if (lessonWeekdays[day.dayOfWeek - 1] !== slot.weekday || date < slot.effectiveStartDate || (slot.effectiveEndDate && date > slot.effectiveEndDate)) throw new Error("Date is not a lesson occurrence");
  const start = day.toPlainDateTime({ hour: Math.floor(slot.localStartMinute / 60), minute: slot.localStartMinute % 60 });
  const end = start.add({ minutes: slot.durationMinutes });
  return {
    start: start.toZonedDateTime(slot.timeZone, { disambiguation: "reject" }).toInstant().toString(),
    end: end.toZonedDateTime(slot.timeZone, { disambiguation: "reject" }).toInstant().toString(),
  };
}
