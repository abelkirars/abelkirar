import { expect, it } from "vitest";
import { formatLessonDate, formatLessonTime, lessonTimeInput, lessonTimeMinute } from "./lesson-schedule-presentation";
import { lessonDraftSchema, lessonPairSchema } from "./lesson-schedule-rules";
const slot = { ordinal: 1, weekday: "TUESDAY", localStartMinute: 600, durationMinutes: 60, timeZone: "America/Chicago", effectiveStartDate: "2026-10-03", effectiveEndDate: null };
it("permits a complete one-lesson draft but never publishes it as a pair", () => {
  const draft = { teacherAdminId: "teacher", slots: [slot] };
  expect(lessonDraftSchema.safeParse(draft).success).toBe(true);
  expect(lessonPairSchema.safeParse(draft).success).toBe(false);
});
it.each(["", "25:00", "24:00", "10:60", "1:00", "10:00:30"])("does not coerce invalid wall time %s", value => expect(lessonTimeMinute(value)).toBeNaN());
it.each([0, 600, 990, 1439])("round-trips civil minute %i without a Date/UTC offset", minute => expect(lessonTimeMinute(lessonTimeInput(minute))).toBe(minute));
it("renders the civil time/date without changing the day or billing timezone", () => {
  expect(formatLessonTime(600, "en")).toMatch(/10:00\s*AM/);
  expect(formatLessonTime(1080, "en")).toMatch(/6:00\s*PM/);
  expect(formatLessonDate("2026-10-03", "en")).toBe("Oct 3, 2026");
  expect(formatLessonTime(600, "am")).not.toBe("");
});
