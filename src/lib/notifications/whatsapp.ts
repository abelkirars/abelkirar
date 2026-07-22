import { getTwilioClient, isTwilioNotificationsEnabled } from "@/lib/notifications/twilio-client";
import { maskPhone } from "@/lib/phone";
import { errorCategory } from "@/lib/notifications/sms";

function toWhatsAppAddress(e164: string): string {
  return e164.startsWith("whatsapp:") ? e164 : `whatsapp:${e164}`;
}

/**
 * Sends a WhatsApp message via Twilio's official WhatsApp API (not an
 * unofficial automation/bot) to every recipient independently, so one
 * failure never blocks the others. Recipients are configured as plain E.164
 * numbers — the required "whatsapp:" transport prefix is applied here
 * internally, never stored in env vars or exposed further up the stack.
 */
export async function sendWhatsAppToRecipients(recipients: string[], body: string): Promise<void> {
  if (!isTwilioNotificationsEnabled() || recipients.length === 0) return;

  const client = getTwilioClient();
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!client || !from) {
    console.warn("[notifications] Twilio WhatsApp not configured — skipping WhatsApp send");
    return;
  }

  const fromAddress = toWhatsAppAddress(from);

  const results = await Promise.allSettled(
    recipients.map((to) =>
      client.messages.create({ to: toWhatsAppAddress(to), from: fromAddress, body })
    )
  );

  results.forEach((result, i) => {
    const maskedTo = maskPhone(recipients[i]);
    if (result.status === "fulfilled") {
      console.log(
        `[notifications] WhatsApp sent — to: ${maskedTo}, sid: ${result.value.sid}, status: ${result.value.status}`
      );
    } else {
      console.error(
        `[notifications] WhatsApp failed — to: ${maskedTo}, error: ${errorCategory(result.reason)}`
      );
    }
  });
}
