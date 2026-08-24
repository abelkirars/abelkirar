import { describe, expect, it } from "vitest";
import { getPracticeSummary } from "@/lib/student/practice-summary";

function entry(practicedAt: string, durationMinutes: number) {
  return { practicedAt: new Date(practicedAt), durationMinutes };
}

describe("getPracticeSummary", () => {
  it("returns an empty summary when no practice has been logged", () => {
    expect(getPracticeSummary([], new Date("2026-08-19T12:00:00Z"))).toEqual({
      sessionsThisWeek: 0,
      minutesThisWeek: 0,
      latestPracticeAt: null,
    });
  });

  it("counts Monday through Sunday in the current UTC week", () => {
    const summary = getPracticeSummary(
      [
        entry("2026-08-16T00:00:00Z", 15),
        entry("2026-08-17T00:00:00Z", 20),
        entry("2026-08-23T00:00:00Z", 35),
        entry("2026-08-24T00:00:00Z", 45),
      ],
      new Date("2026-08-19T12:00:00Z"),
    );

    expect(summary.sessionsThisWeek).toBe(2);
    expect(summary.minutesThisWeek).toBe(55);
  });

  it("uses the preceding Monday when today is Sunday", () => {
    const summary = getPracticeSummary(
      [entry("2026-08-17T00:00:00Z", 25), entry("2026-08-23T00:00:00Z", 30)],
      new Date("2026-08-23T18:00:00Z"),
    );

    expect(summary.sessionsThisWeek).toBe(2);
    expect(summary.minutesThisWeek).toBe(55);
  });

  it("finds the latest practice date even when entries are unsorted", () => {
    const summary = getPracticeSummary(
      [
        entry("2026-08-18T00:00:00Z", 20),
        entry("2026-08-14T00:00:00Z", 10),
        entry("2026-08-22T00:00:00Z", 30),
      ],
      new Date("2026-08-22T12:00:00Z"),
    );

    expect(summary.latestPracticeAt).toEqual(new Date("2026-08-22T00:00:00Z"));
  });
});
