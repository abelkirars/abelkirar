import { describe, expect, it } from "vitest";
import { formatPaymentDeadline } from "./payment-deadline";

describe("payment page deadline formatter", () => {
  it.each(["en", "am"])("executes the real formatter for %s without invalid Intl options", locale => {
    const instant = new Date("2026-09-08T13:05:00Z");
    const output = formatPaymentDeadline(locale, instant);
    expect(output).toContain("2026");
    expect(output).toMatch(/UTC|ጂኤምቲ|GMT/);
    expect(output).toContain("05");
    expect(instant.toISOString()).toBe("2026-09-08T13:05:00.000Z");
  });
  it("preserves the instant and UTC calendar day across source offsets", () => {
    expect(formatPaymentDeadline("en", new Date("2026-09-08T23:30:00-04:00")))
      .toBe(formatPaymentDeadline("en", new Date("2026-09-09T03:30:00Z")));
  });
});
