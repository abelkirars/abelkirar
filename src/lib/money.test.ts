import { expect, it } from "vitest";
import { formatUsd, formatPriceAdjustment } from "./money";

it("preserves cents and positions adjustment signs before the currency", () => {
  expect(formatUsd(12345)).toBe("$123.45");
  expect(formatUsd(15000)).toBe("$150");
  expect(formatPriceAdjustment(-1500)).toBe("-$15");
  expect(formatPriceAdjustment(1550)).toBe("+$15.50");
});
