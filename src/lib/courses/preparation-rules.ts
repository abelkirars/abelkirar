import { z } from "zod";
export class PreparationValidationError extends Error {}

export const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export function isIanaTimeZone(value: string): boolean {
  if (!value || /^[+-]/.test(value)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}
export const dateOnly = z.iso.date().refine(value => value >= "1900-01-01" && value < "9999-12-01", "Date outside supported range");
export function monthlyPeriod(start: string) {
  dateOnly.parse(start);
  const [year, month, day] = start.split("-").map(Number);
  const end = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return { periodStart: start, periodEnd: end.toISOString().slice(0, 10) };
}
export function dateOnlyToUtc(value: string): Date {
  dateOnly.parse(value);
  return new Date(`${value}T00:00:00.000Z`);
}
export const cohortCreateSchema = z.object({
  code: z.string().trim().min(1).max(60).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(1).max(150),
  coursePlanId: z.string().min(1),
}).strict();
export const scheduleSchema = z.object({
  weeklyDay: z.enum(WEEKDAYS),
  localStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().min(15).max(480),
  timeZone: z.string().trim().refine(isIanaTimeZone, "Choose a valid IANA timezone"),
  courseStartDate: dateOnly,
  courseEndDate: dateOnly.nullable(),
}).strict().refine(v => !v.courseEndDate || v.courseEndDate >= v.courseStartDate, "End date precedes start date");
export const preparationSchema = z.object({
  relationship: z.enum(["SELF", "GUARDIAN"]),
  supabaseUserId: z.uuid(),
  learner: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("EXISTING"), studentId: z.string().min(1) }).strict(),
    z.object({ mode: z.literal("NEW"), fullName: z.string().trim().min(1).max(200) }).strict(),
  ]),
  coursePlanId: z.string().min(1),
  cohortId: z.string().min(1).nullable(),
  agreedStartDate: dateOnly.nullable(),
}).strict();
export type PreparationInput = z.infer<typeof preparationSchema>;
export const finalEnrollmentSchema = preparationSchema.extend({ confirmation: z.literal(true) }).strict();
export type FinalEnrollmentInput = z.infer<typeof finalEnrollmentSchema>;
export const PAYMENT_DEADLINE_RULE = "7 days after the enrollment payment obligation is created. Course start is independent.";

type Seats = { position: number; currentEnrollmentId: string | null; assignedAt: Date | null; reservedUntil: Date | null }[];
export function assertFourSeats(seats: Seats) {
  if (seats.length !== 4 || [...seats].map(s => s.position).sort().join(",") !== "1,2,3,4") throw new PreparationValidationError("Cohort must have exactly four unique seats (1–4)");
  if (seats.some(s => !s.currentEnrollmentId && (s.assignedAt || s.reservedUntil))) throw new PreparationValidationError("Cohort seat state requires review");
}
export function assertRelationship(type: "SELF" | "GUARDIAN", customerAuthId: string, learnerAuthId: string | null) {
  if (type === "SELF" && learnerAuthId !== customerAuthId) throw new PreparationValidationError("SELF requires the learner's own verified login identity");
  if (type === "GUARDIAN" && learnerAuthId === customerAuthId) throw new PreparationValidationError("A guardian account cannot be the learner's login");
}
