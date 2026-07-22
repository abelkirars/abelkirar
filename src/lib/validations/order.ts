import { z } from "zod";

export const checkoutItemSchema = z.object({
  productId: z.string().min(1),
  customization: z.record(z.string(), z.string()),
  quantity: z.number().int().min(1).max(10),
});

const US_PAYMENT_METHODS = new Set(["ZELLE", "CASH_APP"]);

export const createOrderSchema = z
  .object({
    items: z.array(checkoutItemSchema).min(1, "Your cart is empty"),
    paymentRegion: z.enum(["US", "EUROZONE"]),
    paymentMethod: z.enum(["ZELLE", "CASH_APP", "EUR_BANK_TRANSFER"]),
    customerName: z.string().min(1, "Enter your full name").max(200),
    customerEmail: z.email("Enter a valid email address"),
    customerPhone: z.string().min(7, "Enter a valid phone number").max(30),
  })
  .refine(
    (data) =>
      data.paymentRegion === "US"
        ? US_PAYMENT_METHODS.has(data.paymentMethod)
        : data.paymentMethod === "EUR_BANK_TRANSFER",
    { message: "Payment method does not match the selected payment region", path: ["paymentMethod"] }
  );

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
