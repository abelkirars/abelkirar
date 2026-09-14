import "server-only";
import { prisma } from "@/lib/db";
import { COURSE_LEVELS } from "@/lib/courses-data";
import { coursePriceSchema, type CoursePriceInput } from "@/lib/validations/course-price";

export interface CoursePricing {
  basePriceCents: number;
  finalPriceCents: number;
  discountAmountCents: number;
  percentOff: number;
  isDiscounted: boolean;
}

// Deliberately no persistent cache: saved prices are read on the next request.
// Drafts are only used by the authenticated server preview; never public input.
export async function getCoursePricing(slug: string, draft?: CoursePriceInput): Promise<CoursePricing> {
  const course = COURSE_LEVELS.find((entry) => entry.slug === slug);
  if (!course) throw new Error("Unknown course slug");
  const row = draft ?? await prisma.coursePrice.findUnique({ where: { slug } });
  const price = row ?? {
    priceCents: course.price, discountType: null, discountValue: null, discountActive: false,
  };
  if (draft) coursePriceSchema.parse(draft);
  const base = BigInt(price.priceCents);
  let discount = BigInt(0);
  if (price.discountActive && price.discountType !== null && price.discountValue !== null) {
    // PERCENT: integer 1–100; FIXED: CENTS. BigInt implements positive
    // Math.round(base * percent / 100) exactly, without fractional cents.
    discount = price.discountType === "PERCENT"
      ? (base * BigInt(price.discountValue) + BigInt(50)) / BigInt(100)
      : BigInt(price.discountValue);
  }
  if (discount > base) discount = base;
  return {
    basePriceCents: Number(base),
    finalPriceCents: Number(base - discount),
    discountAmountCents: Number(discount),
    // Fixed discounts round DOWN for display: never advertise 100% off when
    // a balance remains. The display labels sub-1% fixed discounts explicitly.
    percentOff: discount === BigInt(0) ? 0 : price.discountType === "PERCENT"
      ? price.discountValue! : Number(discount * BigInt(100) / base),
    isDiscounted: discount > BigInt(0),
  };
}
