import { describe, expect, it } from "vitest";
import { assertFourSeats, assertRelationship, isIanaTimeZone, monthlyPeriod, PAYMENT_DEADLINE_RULE, preparationSchema, scheduleSchema } from "./preparation-rules";
describe("billing calendar dates", () => {
  it.each([["2026-09-15","2026-10-15"],["2026-01-31","2026-02-28"],["2028-01-31","2028-02-29"],["2026-03-31","2026-04-30"],["2026-12-31","2027-01-31"]])("%s -> %s, end exclusive", (start,end) => expect(monthlyPeriod(start)).toEqual({periodStart:start,periodEnd:end}));
  it("rejects invalid dates", () => expect(() => monthlyPeriod("2026-02-30")).toThrow());
  it("does not manufacture a payment timestamp", () => { expect(Object.keys(monthlyPeriod("2026-09-15"))).toEqual(["periodStart","periodEnd"]); expect(PAYMENT_DEADLINE_RULE).toContain("7 days after"); });
});
it.each(["America/New_York","Europe/London","Europe/Berlin","Africa/Nairobi"])("accepts IANA zone %s", zone => expect(isIanaTimeZone(zone)).toBe(true));
it.each(["","+03:00","Invalid/Zone"])("rejects invalid/offset zone %s", zone => expect(isIanaTimeZone(zone)).toBe(false));
it("requires an explicit complete schedule", () => expect(scheduleSchema.safeParse({weeklyDay:"MONDAY"}).success).toBe(false));
it("does not infer a relationship from an email", () => expect(preparationSchema.safeParse({email:"guardian@example.invalid"}).success).toBe(false));
it("validates SELF by ID, not contact email", () => { expect(() => assertRelationship("SELF","auth","auth")).not.toThrow(); expect(() => assertRelationship("SELF","auth",null)).toThrow(); });
it("permits loginless GUARDIAN but never guardian credentials as learner", () => { expect(() => assertRelationship("GUARDIAN","guardian",null)).not.toThrow(); expect(() => assertRelationship("GUARDIAN","guardian","guardian")).toThrow(); });
it("rejects duplicate positions and a fifth seat", () => {
  const seats=[1,2,3,4].map(position=>({position,currentEnrollmentId:null,assignedAt:null,reservedUntil:null}));
  expect(()=>assertFourSeats(seats)).not.toThrow();
  expect(()=>assertFourSeats([...seats,seats[0]])).toThrow();
  expect(()=>assertFourSeats([...seats.slice(0,3),seats[0]])).toThrow();
});
