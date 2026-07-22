import { z } from "zod";

export const paymentConfirmationSchema = z.object({
  senderName: z.string().min(1, "Enter the name the payment was sent from").max(200),
  amountSent: z.number().positive("Enter the amount you sent"),
  sentAt: z.iso.datetime({ offset: true }).or(z.iso.datetime()),
  transactionReference: z.string().max(200).optional(),
});

export type PaymentConfirmationInput = z.infer<typeof paymentConfirmationSchema>;

export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024; // 8MB
// PNG, JPG/JPEG, and PDF only — JPG and JPEG share the "image/jpeg" MIME type.
export const ALLOWED_SCREENSHOT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "application/pdf",
]);
