import { describe, expect, it } from "vitest";
import { formatUsdInput, parseUsdInput } from "./usd-input";

describe("USD admin inputs", () => {
  it.each([
    ["79.99", 7_999],
    ["80", 8_000],
    ["80.0", 8_000],
    ["0.01", 1],
    ["21474836.47", 2_147_483_647],
  ])("parses %s exactly as integer cents", (value, cents) => {
    expect(parseUsdInput(value)).toBe(cents);
  });

  it.each(["", " ", ".99", "0", "0.00", "79.999", "79.", "-1", "1e2", "21,00", "21474836.48"])(
    "rejects invalid dollar input %s",
    (value) => expect(parseUsdInput(value)).toBeNull(),
  );

  it.each([[7_999, "79.99"], [8_000, "80.00"], [1, "0.01"]])(
    "formats %i cents as %s",
    (cents, value) => expect(formatUsdInput(cents)).toBe(value),
  );
});
