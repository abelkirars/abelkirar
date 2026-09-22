import type { CourseDiscountType } from "@prisma/client";
import { PreparationValidationError } from "./preparation-rules";

export type EligiblePromotion = {
  id: string;
  name: string;
  discountType: CourseDiscountType;
  discountValue: number;
};

export type PaymentPriceSnapshot = {
  promotionId: string | null;
  promotionNameSnapshot: string | null;
  discountTypeSnapshot: CourseDiscountType | null;
  discountValueSnapshot: number | null;
  baseAmountCents: number;
  discountAmountCents: number;
  finalAmountCents: number;
  currency: string;
};

/**
 * Integer-money convention already used by the project: percentage discounts
 * round to the nearest cent, with positive half cents rounded up. FIXED values
 * are stored cents. Financial snapshots must always retain a positive balance.
 */
export function paymentPriceSnapshot(
  baseAmountCents: number,
  currency: string,
  promotion: EligiblePromotion | null,
): PaymentPriceSnapshot {
  if (!Number.isSafeInteger(baseAmountCents) || baseAmountCents <= 0 || currency !== "USD") {
    throw new PreparationValidationError("Course plan has an invalid authoritative price");
  }
  if (!promotion) {
    return {
      promotionId: null,
      promotionNameSnapshot: null,
      discountTypeSnapshot: null,
      discountValueSnapshot: null,
      baseAmountCents,
      discountAmountCents: 0,
      finalAmountCents: baseAmountCents,
      currency,
    };
  }

  const base = BigInt(baseAmountCents);
  const value = BigInt(promotion.discountValue);
  const discount = promotion.discountType === "PERCENT"
    ? (base * value + BigInt(50)) / BigInt(100)
    : value;
  const final = base - discount;
  if (discount <= BigInt(0) || final <= BigInt(0) || discount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PreparationValidationError("Promotion would create an invalid payment amount");
  }
  return {
    promotionId: promotion.id,
    promotionNameSnapshot: promotion.name,
    discountTypeSnapshot: promotion.discountType,
    discountValueSnapshot: promotion.discountValue,
    baseAmountCents,
    discountAmountCents: Number(discount),
    finalAmountCents: Number(final),
    currency,
  };
}
