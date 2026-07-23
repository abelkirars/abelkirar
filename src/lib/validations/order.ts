import { z } from "zod";

type Translator = (key: string) => string;

export const checkoutItemSchema = z.object({
  productId: z.string().min(1),
  customization: z.record(z.string(), z.string()),
  quantity: z.number().int().min(1).max(10),
});

const US_PAYMENT_METHODS = new Set(["ZELLE", "CASH_APP"]);

export function createOrderSchema(t: Translator) {
  return z
    .object({
      items: z.array(checkoutItemSchema).min(1, t("cartEmpty")),
      paymentRegion: z.enum(["US", "EUROZONE"]),
      paymentMethod: z.enum(["ZELLE", "CASH_APP", "EUR_BANK_TRANSFER"]),
      customerName: z.string().min(1, t("enterFullName")).max(200),
      customerEmail: z.email(t("enterValidEmail")),
      customerPhone: z.string().min(7, t("enterValidPhone")).max(30),
    })
    .refine(
      (data) =>
        data.paymentRegion === "US"
          ? US_PAYMENT_METHODS.has(data.paymentMethod)
          : data.paymentMethod === "EUR_BANK_TRANSFER",
      { message: t("paymentMethodMismatch"), path: ["paymentMethod"] }
    );
}

export type CreateOrderInput = z.infer<ReturnType<typeof createOrderSchema>>;
