import { describe, expect, it } from "vitest";
import { paymentPriceSnapshot } from "./course-payment-pricing";

const promotion = (discountType: "PERCENT" | "FIXED", discountValue: number) => ({
  id: "promotion-1",
  name: "Launch offer",
  discountType,
  discountValue,
});

describe("initial tuition price snapshots", () => {
  it("keeps the authoritative base amount when no promotion is eligible", () => {
    expect(paymentPriceSnapshot(5000, "USD", null)).toEqual({
      promotionId: null,
      promotionNameSnapshot: null,
      discountTypeSnapshot: null,
      discountValueSnapshot: null,
      baseAmountCents: 5000,
      discountAmountCents: 0,
      finalAmountCents: 5000,
      currency: "USD",
    });
  });

  it.each([
    [5000, 15, 750, 4250],
    [5001, 10, 500, 4501],
    [5005, 10, 501, 4504],
  ])("rounds %i cents at %i percent using the established integer convention", (base, value, discount, final) => {
    expect(paymentPriceSnapshot(base, "USD", promotion("PERCENT", value))).toMatchObject({
      discountAmountCents: discount,
      finalAmountCents: final,
      discountTypeSnapshot: "PERCENT",
      discountValueSnapshot: value,
    });
  });

  it("snapshots a fixed-cent promotion", () => {
    expect(paymentPriceSnapshot(8500, "USD", promotion("FIXED", 1250))).toMatchObject({
      promotionId: "promotion-1",
      promotionNameSnapshot: "Launch offer",
      discountAmountCents: 1250,
      finalAmountCents: 7250,
    });
  });

  it.each([
    [5000, "EUR", null],
    [0, "USD", null],
    [5000, "USD", promotion("FIXED", 5000)],
    [5000, "USD", promotion("FIXED", 5001)],
  ] as const)("rejects invalid authoritative financial state", (base, currency, offer) => {
    expect(() => paymentPriceSnapshot(base, currency, offer)).toThrow();
  });
});
