import { z } from "zod";

const fieldsSchema = z.object({
  method: z.enum(["ZELLE", "CASH_APP"]),
  senderName: z.string().trim().min(1, "Enter the sender name").max(200),
  amountSent: z.string().trim().regex(/^\d{1,8}(?:\.\d{1,2})?$/, "Enter a valid amount with up to two decimal places"),
  sentAt: z.iso.datetime({ offset: true }),
  transactionReference: z.string().trim().max(200).optional(),
}).strict();

export type CoursePaymentProofFields = {
  method: "ZELLE" | "CASH_APP";
  senderName: string;
  amountSentCents: number;
  sentAt: Date;
  transactionReference: string | null;
};

export class InvalidCoursePaymentProofFieldsError extends Error {}

export function parseCoursePaymentProofFields(formData: FormData): CoursePaymentProofFields {
  const parsed = fieldsSchema.safeParse({
    method: formData.get("method"),
    senderName: formData.get("senderName"),
    amountSent: formData.get("amountSent"),
    sentAt: formData.get("sentAt"),
    transactionReference: formData.get("transactionReference") || undefined,
  });
  if (!parsed.success) {
    throw new InvalidCoursePaymentProofFieldsError(parsed.error.issues[0]?.message ?? "Invalid payment details");
  }

  const [whole, fraction = ""] = parsed.data.amountSent.split(".");
  const amountSentCents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amountSentCents) || amountSentCents <= 0) {
    throw new InvalidCoursePaymentProofFieldsError("Enter an amount greater than zero");
  }

  const sentAt = new Date(parsed.data.sentAt);
  if (Number.isNaN(sentAt.getTime())) {
    throw new InvalidCoursePaymentProofFieldsError("Enter a valid payment date and time");
  }

  return {
    method: parsed.data.method,
    senderName: parsed.data.senderName,
    amountSentCents,
    sentAt,
    transactionReference: parsed.data.transactionReference || null,
  };
}
