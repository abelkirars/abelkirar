import { z } from "zod";

export const quoteSchema = z.object({
  // Dollars as typed by the admin; converted to integer cents in the route,
  // same convention as createPaymentConfirmationSchema's amountSent.
  total: z.coerce.number().positive(),
  paymentMethod: z.enum(["ZELLE", "CASH_APP"]).optional(),
});

export type QuoteInput = z.infer<typeof quoteSchema>;
