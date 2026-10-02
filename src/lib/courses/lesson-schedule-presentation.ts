import { Temporal } from "@js-temporal/polyfill";
import type { LessonRecurrence } from "./lesson-schedule-rules";

export const LESSON_TIME_ZONE = "America/Chicago" as const;

export function lessonTimeInput(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function lessonTimeMinute(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function formatLessonTime(minute: number, locale: string): string {
  return Temporal.PlainTime.from({ hour: Math.floor(minute / 60), minute: minute % 60 })
    .toLocaleString(locale, { hour: "numeric", minute: "2-digit" });
}

export function formatLessonDate(date: string, locale: string): string {
  return Temporal.PlainDate.from(date).toLocaleString(locale, { dateStyle: "medium" });
}

export type MyLessonSchedule = {
  enrollmentId: string;
  plan: string;
  cohortName: string | null;
  slots: LessonRecurrence[];
  startsLater: boolean;
};
