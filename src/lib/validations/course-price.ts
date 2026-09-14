import { z } from "zod";

// Accept digit strings from inputs, but never coerce blank strings, booleans,
// decimal values, or exponential notation into cents. Bound to Postgres Int.
const integer = z.preprocess(
  (value) => typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value,
  z.number().int().positive().max(2_147_483_647),
);

export const coursePriceSchema = z.object({
  priceCents: integer,
  discountType: z.enum(["PERCENT", "FIXED"]).nullable(),
  discountValue: integer.nullable(),
  discountActive: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.discountType === null) {
    if (value.discountValue !== null || value.discountActive) {
      ctx.addIssue({ code: "custom", path: ["discountType"], message: "invalidDiscount" });
    }
    return;
  }
  if (value.discountValue === null ||
    (value.discountType === "PERCENT" && value.discountValue > 100) ||
    (value.discountType === "FIXED" && value.discountValue >= value.priceCents)) {
    ctx.addIssue({ code: "custom", path: ["discountValue"], message: "invalidDiscount" });
  }
});

export type CoursePriceInput = z.output<typeof coursePriceSchema>;
