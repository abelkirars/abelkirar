import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import en from "../../../messages/en.json";
import am from "../../../messages/am.json";
import { MyLessonsView } from "./my-lessons";
import type { MyLessonSchedule } from "@/lib/courses/lesson-schedule-presentation";
vi.mock("@/lib/courses/lesson-schedule-views", () => ({ readMyLessonSchedules: vi.fn() }));
vi.mock("next-intl/server", () => ({}));
const schedules: MyLessonSchedule[] = [{ enrollmentId: "owned", plan: "BEGINNER_GROUP", cohortName: "Local group", startsLater: false, slots: [
  { ordinal: 1, weekday: "TUESDAY", localStartMinute: 1080, durationMinutes: 60, timeZone: "America/Chicago", effectiveStartDate: "2026-10-03", effectiveEndDate: "2027-01-03" },
  { ordinal: 2, weekday: "SATURDAY", localStartMinute: 600, durationMinutes: 45, timeZone: "America/Chicago", effectiveStartDate: "2026-10-03", effectiveEndDate: "2027-01-03" },
] }];
function render(rows = schedules, locale = "en") {
  const messages = (locale === "en" ? en : am).lessonScheduling;
  const t = (key: string, values: Record<string, string | number> = {}) => {
    const message = key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], messages);
    if (typeof message !== "string") throw new Error(`Missing translation: ${key}`);
    return message.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]));
  };
  return renderToStaticMarkup(<MyLessonsView schedules={rows} locale={locale} t={t} />);
}
it("renders exactly two live lessons, distinct durations, explicit timezone and effective window", () => {
  const html = render();
  expect(html.match(/Lesson [12]/g)).toHaveLength(2);
  for (const text of ["Tuesday", "Saturday", "60 minutes", "45 minutes", "America/Chicago", "Central Time", "Oct 3, 2026", "Jan 3, 2027", "2 live lessons per week"]) expect(html).toContain(text);
  expect(html).not.toContain("Lesson 3");
});
it("keeps guided practice separate and links to the existing authorized assignment section", () => {
  const html = render();
  expect(html).toContain("Weekly guided practice"); expect(html).toContain("not a third live lesson"); expect(html).toContain('href="#weekly-practice"');
});
it("renders a useful empty state without inventing lesson times", () => {
  const html = render([]);
  expect(html).toContain("has not published a current lesson schedule"); expect(html).not.toContain("Lesson 1"); expect(html).not.toContain("10:00");
});
it("labels a future effective window as upcoming, not applicable today", () => {
  expect(render([{ ...schedules[0], startsLater: true }])).toContain("Upcoming schedule");
});
it("renders Amharic labels with the same authoritative timezone", () => {
  const html = render(schedules, "am");
  expect(html).toContain("የእኔ ትምህርቶች"); expect(html).toContain("ማክሰኞ"); expect(html).toContain("America/Chicago"); expect(html).toContain("ሳምንታዊ የተመራ ልምምድ");
});
