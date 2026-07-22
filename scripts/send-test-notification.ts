/**
 * Sends one test SMS and one test WhatsApp message using synthetic order
 * data — no real order is created or touched. Safe by default: if
 * TWILIO_NOTIFICATIONS_ENABLED isn't exactly "true", this exits without
 * making any Twilio API request at all.
 *
 * Usage: npx tsx scripts/send-test-notification.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { isTwilioNotificationsEnabled } = await import("../src/lib/notifications/twilio-client");
  const { sendSmsToRecipients } = await import("../src/lib/notifications/sms");
  const { sendWhatsAppToRecipients } = await import("../src/lib/notifications/whatsapp");
  const { adminConciseMessage } = await import("../src/lib/notifications/templates");
  const { parseRecipientList } = await import("../src/lib/phone");

  if (!isTwilioNotificationsEnabled()) {
    console.log(
      "TWILIO_NOTIFICATIONS_ENABLED is not \"true\" — no Twilio request will be made. " +
        "Set it to \"true\" in .env.local once your credentials are filled in and you're ready to test for real."
    );
    return;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const testOrder = {
    orderNumber: "TEST-0000",
    customerName: "Test Customer",
    customerEmail: "test-customer@example.com",
    customerPhone: "+10000000000",
    total: 12345,
    currency: "usd",
    paymentMethod: "ZELLE" as const,
    paymentRegion: "US" as const,
    paymentStatus: "PENDING_VERIFICATION",
    orderStatus: "PENDING",
    createdAt: new Date(),
    items: [{ name: "Test Product", quantity: 1 }],
    adminOrderUrl: `${siteUrl}/admin/orders/TEST-0000`,
  };

  const body = adminConciseMessage("TEST NOTIFICATION", testOrder);
  const smsRecipients = parseRecipientList(process.env.TWILIO_SMS_RECIPIENTS, "SMS");
  const whatsappRecipients = parseRecipientList(process.env.TWILIO_WHATSAPP_RECIPIENTS, "WhatsApp");

  console.log(`Sending test SMS to ${smsRecipients.length} recipient(s)...`);
  await sendSmsToRecipients(smsRecipients, body);

  console.log(`Sending test WhatsApp message to ${whatsappRecipients.length} recipient(s)...`);
  await sendWhatsAppToRecipients(whatsappRecipients, body);

  console.log("Done. Check the logs above for per-recipient delivery status.");
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
