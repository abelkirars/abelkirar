import { z } from "zod";

type Translator = (key: string) => string;

export function createPaymentConfirmationSchema(t: Translator) {
  return z.object({
    senderName: z.string().min(1, t("enterSenderName")).max(200),
    amountSent: z.number().positive(t("enterAmountSent")),
    sentAt: z.iso.datetime({ offset: true }).or(z.iso.datetime()),
    transactionReference: z.string().max(200).optional(),
  });
}

export type PaymentConfirmationInput = z.infer<
  ReturnType<typeof createPaymentConfirmationSchema>
>;

export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024; // 8MB
// PNG, JPG/JPEG, and PDF only — JPG and JPEG share the "image/jpeg" MIME type.
export const ALLOWED_SCREENSHOT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "application/pdf",
]);
