import { describe, expect, it } from "vitest";
import { lessonOccurrence, lessonPairSchema, recurringLessonsConflict, type LessonRecurrence } from "./lesson-schedule-rules";
const slot: LessonRecurrence = { ordinal: 1, weekday: "SUNDAY", localStartMinute: 600, durationMinutes: 60,
  timeZone: "America/Chicago", effectiveStartDate: "2026-01-01", effectiveEndDate: null };
describe("lesson recurrence civil rules", () => {
  it("requires explicit teacher, two ordinals and different weekdays", () => {
    const pair = { teacherAdminId: "teacher", slots: [slot, { ...slot, ordinal: 2, weekday: "TUESDAY" }] };
    expect(lessonPairSchema.safeParse(pair).success).toBe(true);
    for (const invalid of [{ ...pair, teacherAdminId: "" }, { ...pair, slots: [slot] }, { ...pair, slots: [slot, slot, slot] },
      { ...pair, slots: [slot, { ...slot, ordinal: 2, localStartMinute: 800 }] }, { ...pair, slots: [slot, { ...slot, weekday: "TUESDAY" }] }]) {
      expect(lessonPairSchema.safeParse(invalid).success).toBe(false);
    }
  });
  it.each([-1,1440])("rejects start %i", localStartMinute => {
    expect(lessonPairSchema.safeParse({teacherAdminId:"t",slots:[{...slot,localStartMinute},{...slot,ordinal:2,weekday:"MONDAY"}]}).success).toBe(false);
  });
  it("detects overlaps but permits adjacency and disjoint dates", () => {
    expect(recurringLessonsConflict(slot,{...slot,localStartMinute:659})).toBe(true);
    expect(recurringLessonsConflict(slot,{...slot,localStartMinute:660})).toBe(false);
    expect(recurringLessonsConflict({...slot,effectiveEndDate:"2026-01-05"},{...slot,effectiveStartDate:"2026-01-06"})).toBe(false);
    expect(recurringLessonsConflict({...slot,effectiveStartDate:"2026-01-05",effectiveEndDate:"2026-01-07"},{...slot,effectiveStartDate:"2026-01-06",effectiveEndDate:"2026-01-08"})).toBe(false);
  });
  it("winter and summer use their actual offsets, independent of billing", () => {
    expect(lessonOccurrence(slot,"2026-01-04").start).toBe("2026-01-04T16:00:00Z");
    expect(lessonOccurrence(slot,"2026-07-05").start).toBe("2026-07-05T15:00:00Z");
  });
  it("rejects nonexistent and ambiguous occurrences without banning Sundays", () => {
    expect(()=>lessonOccurrence({...slot,localStartMinute:150},"2026-03-08")).toThrow();
    expect(()=>lessonOccurrence({...slot,localStartMinute:90},"2026-11-01")).toThrow();
    expect(lessonOccurrence(slot,"2026-03-08").start).toBe("2026-03-08T15:00:00Z");
    expect(lessonOccurrence(slot,"2026-11-01").start).toBe("2026-11-01T16:00:00Z");
  });
  it("rejects ambiguous endpoints, supports exact midnight, and rejects wrong dates", () => {
    expect(()=>lessonOccurrence({...slot,localStartMinute:30,durationMinutes:60},"2026-11-01")).toThrow();
    expect(lessonOccurrence({...slot,localStartMinute:1380},"2026-07-05").end).toBe("2026-07-06T05:00:00Z");
    expect(()=>lessonOccurrence(slot,"2026-07-06")).toThrow();
  });
});
