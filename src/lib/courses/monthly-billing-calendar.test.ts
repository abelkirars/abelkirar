import { describe, expect, it } from "vitest";
import { anchoredMonthlyPeriod, monthlyBoundaryInstants } from "./monthly-billing-calendar";

describe("anchored monthly billing calendar", () => {
  it.each([
    ["2026-01-31", 0, "2026-01-31", "2026-02-28"],
    ["2026-01-31", 1, "2026-02-28", "2026-03-31"],
    ["2028-01-31", 1, "2028-02-29", "2028-03-31"],
    ["2026-03-31", 1, "2026-04-30", "2026-05-31"],
    ["2026-09-15", 1, "2026-10-15", "2026-11-15"],
  ])("anchors %s period %i", (anchor, ordinal, start, end) => {
    expect(anchoredMonthlyPeriod(anchor, ordinal)).toEqual({ periodStart: start, periodEnd: end });
  });

  it.each([
    ["America/Chicago", "2026-03-08", 167],
    ["America/New_York", "2026-11-01", 169],
    ["Africa/Addis_Ababa", "2026-03-08", 168],
  ])("uses seven local dates across DST in %s", (zone, date, expectedHours) => {
    const { dueAt, expiresAt } = monthlyBoundaryInstants(date, zone);
    expect((expiresAt.getTime() - dueAt.getTime()) / 3_600_000).toBe(expectedHours);
  });
});
