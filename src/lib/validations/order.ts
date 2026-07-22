import { z } from "zod";

export const checkoutItemSchema = z.object({
  productId: z.string().min(1),
  customization: z.record(z.string(), z.string()),
  quantity: z.number().int().min(1).max(10),
});

export const createOrderSchema = z.object({
  items: z.array(checkoutItemSchema).min(1, "Your cart is empty"),
  paymentMethod: z.enum(["ZELLE", "CASH_APP"]),
  customerName: z.string().min(1, "Enter your full name").max(200),
  customerEmail: z.email("Enter a valid email address"),
  customerPhone: z.string().min(7, "Enter a valid phone number").max(30),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
