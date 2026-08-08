import { z } from "zod";

type Translator = (key: string) => string;

export function createCustomOrderSchema(t: Translator) {
  return z.object({
    productId: z.string().min(1),
    description: z
      .string()
      .min(10, t("enterCustomOrderDescription"))
      .max(4000, t("customOrderDescriptionTooLong")),
    customerName: z.string().min(1, t("enterFullName")).max(200),
    customerEmail: z.email(t("enterValidEmail")),
    customerPhone: z.string().min(7, t("enterValidPhone")).max(30),
    paymentRegion: z.enum(["US", "EUROZONE"]),
  });
}

export type CreateCustomOrderInput = z.infer<ReturnType<typeof createCustomOrderSchema>>;
