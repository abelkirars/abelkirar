import { z } from "zod";

export const PRODUCT_CATEGORIES = [
  "KIRAR",
  "BEGENA",
  "MESENKO",
  "TSENATSL",
  "MEKWAMIYA",
  "PICK_UPS",
  "KABA",
  "OTHER",
] as const;

export const productSchema = z.object({
  name: z.string().min(1).max(200),
  variantName: z.string().max(200).optional().or(z.literal("")),
  description: z.string().min(1).max(4000),
  category: z.enum(PRODUCT_CATEGORIES),
  // Dollars as typed by the admin; converted to integer cents before saving.
  price: z.coerce.number().positive(),
  published: z.coerce.boolean().default(true),
  isCustomMade: z.coerce.boolean().default(false),
  customMadeDetails: z.string().max(4000).optional().or(z.literal("")),
});

export type ProductInput = z.infer<typeof productSchema>;
