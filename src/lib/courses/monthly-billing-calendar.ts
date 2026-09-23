import { Temporal } from "@js-temporal/polyfill";
import { dateOnly, isIanaTimeZone } from "./preparation-rules";

export const MONTHLY_GENERATION_DAYS = 7;
export const MONTHLY_GRACE_DAYS = 7;

function boundary(anchor: Temporal.PlainDate, ordinal: number) {
  if (!Number.isInteger(ordinal) || ordinal < 0) throw new Error("Billing period ordinal must be nonnegative");
  const month = anchor.with({ day: 1 }).add({ months: ordinal });
  return month.with({ day: Math.min(anchor.day, month.daysInMonth) });
}

export function anchoredMonthlyPeriod(anchorDate: string, ordinal: number) {
  dateOnly.parse(anchorDate);
  const anchor = Temporal.PlainDate.from(anchorDate);
  return {
    periodStart: boundary(anchor, ordinal).toString(),
    periodEnd: boundary(anchor, ordinal + 1).toString(),
  };
}

export function monthlyBoundaryInstants(periodStart: string, billingTimeZone: string) {
  dateOnly.parse(periodStart);
  if (!isIanaTimeZone(billingTimeZone)) throw new Error("Invalid billing timezone");
  const due = Temporal.PlainDate.from(periodStart).toZonedDateTime({
    timeZone: billingTimeZone,
    plainTime: Temporal.PlainTime.from("00:00"),
  });
  return {
    dueAt: new Date(due.epochMilliseconds),
    expiresAt: new Date(due.add({ days: MONTHLY_GRACE_DAYS }).epochMilliseconds),
    generationAt: new Date(due.subtract({ days: MONTHLY_GENERATION_DAYS }).epochMilliseconds),
  };
}

export function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function nextMonthlyPeriod(anchorDate: string, latestPeriodStart: string) {
  for (let ordinal = 0; ordinal < 1200; ordinal++) {
    const period = anchoredMonthlyPeriod(anchorDate, ordinal);
    if (period.periodStart === latestPeriodStart) return { ordinal: ordinal + 1, ...anchoredMonthlyPeriod(anchorDate, ordinal + 1) };
  }
  throw new Error("Existing billing period is not aligned to its anchor");
}
