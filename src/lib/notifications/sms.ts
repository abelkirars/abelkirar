import { getTwilioClient, isTwilioNotificationsEnabled } from "@/lib/notifications/twilio-client";
import { maskPhone } from "@/lib/phone";

/**
 * Sends an SMS to every recipient independently (Promise.allSettled) so one
 * failed or unreachable number never blocks delivery to the others. No
 * automatic retry on failure/timeout — retrying an ambiguous-outcome Twilio
 * request risks sending a duplicate SMS to a real person, which is worse
 * than an occasional missed notification (email remains the primary,
 * reliable channel).
 */
export async function sendSmsToRecipients(recipients: string[], body: string): Promise<void> {
  if (!isTwilioNotificationsEnabled() || recipients.length === 0) return;

  const client = getTwilioClient();
  const from = process.env.TWILIO_SMS_FROM_NUMBER;
  if (!client || !from) {
    console.warn("[notifications] Twilio SMS not configured — skipping SMS send");
    return;
  }

  const results = await Promise.allSettled(
    recipients.map((to) => client.messages.create({ to, from, body }))
  );

  results.forEach((result, i) => {
    const maskedTo = maskPhone(recipients[i]);
    if (result.status === "fulfilled") {
      console.log(
        `[notifications] SMS sent — to: ${maskedTo}, sid: ${result.value.sid}, status: ${result.value.status}`
      );
    } else {
      console.error(
        `[notifications] SMS failed — to: ${maskedTo}, error: ${errorCategory(result.reason)}`
      );
    }
  });
}

/** Extracts a safe, non-sensitive error category from a Twilio error (never logs full error payloads). */
export function errorCategory(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    return `twilio_error_code_${(err as { code: unknown }).code}`;
  }
  if (err instanceof Error) return err.name || "unknown_error";
  return "unknown_error";
}
