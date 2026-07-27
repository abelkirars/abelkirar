import { prisma } from "@/lib/db";
import { getTwilioClient, isTwilioNotificationsEnabled } from "@/lib/notifications/twilio-client";
import { parseRecipientList, maskPhone } from "@/lib/phone";
import { errorCategory } from "@/lib/notifications/sms";
import { newOrderTwilioMessage } from "@/lib/notifications/templates";
import type { OrderNotificationData } from "@/lib/notifications/types";

type Channel = "sms" | "whatsapp";

function toWhatsAppAddress(e164: string): string {
  return e164.startsWith("whatsapp:") ? e164 : `whatsapp:${e164}`;
}

/**
 * Atomically claims the right to send once for this order+channel via a
 * conditional update (only succeeds if the status column is still null).
 * This is the idempotency guard: a retried/duplicate call for the same
 * order.id will find the column already non-null and get count === 0.
 */
async function claimSendSlot(orderId: string, channel: Channel): Promise<boolean> {
  const result =
    channel === "sms"
      ? await prisma.order.updateMany({
          where: { id: orderId, smsStatus: null },
          data: { smsStatus: "PENDING" },
        })
      : await prisma.order.updateMany({
          where: { id: orderId, whatsappStatus: null },
          data: { whatsappStatus: "PENDING" },
        });
  return result.count === 1;
}

async function recordResult(
  orderId: string,
  channel: Channel,
  outcome: { status: "SENT" | "FAILED"; messageSid?: string; error?: string }
): Promise<void> {
  const sentAt = outcome.status === "SENT" ? new Date() : null;
  if (channel === "sms") {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        smsStatus: outcome.status,
        smsMessageSid: outcome.messageSid ?? null,
        smsSentAt: sentAt,
        smsError: outcome.error ?? null,
      },
    });
  } else {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        whatsappStatus: outcome.status,
        whatsappMessageSid: outcome.messageSid ?? null,
        whatsappSentAt: sentAt,
        whatsappError: outcome.error ?? null,
      },
    });
  }
}

/** Prints what would have been sent, with recipients masked — never a real Twilio request. */
function logPreview(channel: Channel, recipients: string[], body: string, orderNumber: string): void {
  const maskedRecipients = recipients.length > 0 ? recipients.map(maskPhone).join(", ") : "(none configured)";
  console.log(
    `[notifications] [DEV PREVIEW] ${channel.toUpperCase()} for order ${orderNumber} — would send to: ${maskedRecipients}\n${body}`
  );
}

/**
 * Sends the new-order SMS to every number in TWILIO_SMS_RECIPIENTS.
 * No-ops (with a console preview) if Twilio isn't fully configured. Safe to
 * call more than once for the same order — a second call for an order whose
 * smsStatus is already non-null is skipped before any Twilio request is made.
 */
export async function sendOrderSms(order: OrderNotificationData): Promise<void> {
  const recipients = parseRecipientList(process.env.TWILIO_SMS_RECIPIENTS, "SMS");
  const from = process.env.TWILIO_SMS_FROM_NUMBER;
  const client = getTwilioClient();
  const body = newOrderTwilioMessage(order);

  if (!isTwilioNotificationsEnabled() || !client || !from || recipients.length === 0) {
    logPreview("sms", recipients, body, order.orderNumber);
    return;
  }

  const claimed = await claimSendSlot(order.id, "sms");
  if (!claimed) {
    console.log(`[notifications] SMS for order ${order.orderNumber} already attempted — skipping`);
    return;
  }

  const results = await Promise.allSettled(
    recipients.map((to) => client.messages.create({ to, from, body }))
  );

  const sids: string[] = [];
  const errors: string[] = [];
  results.forEach((result, i) => {
    const maskedTo = maskPhone(recipients[i]);
    if (result.status === "fulfilled") {
      sids.push(result.value.sid);
      console.log(
        `[notifications] SMS sent — order: ${order.orderNumber}, to: ${maskedTo}, sid: ${result.value.sid}`
      );
    } else {
      const category = errorCategory(result.reason);
      errors.push(category);
      console.error(
        `[notifications] SMS failed — order: ${order.orderNumber}, to: ${maskedTo}, error: ${category}`
      );
    }
  });

  await recordResult(
    order.id,
    "sms",
    sids.length > 0
      ? { status: "SENT", messageSid: sids.join(",") }
      : { status: "FAILED", error: errors.join(",") || "unknown_error" }
  );
}

/**
 * Sends the new-order WhatsApp message to every number in
 * TWILIO_WHATSAPP_RECIPIENTS. Same no-op-with-preview and idempotency
 * behavior as sendOrderSms.
 */
export async function sendOrderWhatsApp(order: OrderNotificationData): Promise<void> {
  const recipients = parseRecipientList(process.env.TWILIO_WHATSAPP_RECIPIENTS, "WhatsApp");
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const client = getTwilioClient();
  const body = newOrderTwilioMessage(order);

  if (!isTwilioNotificationsEnabled() || !client || !from || recipients.length === 0) {
    logPreview("whatsapp", recipients, body, order.orderNumber);
    return;
  }

  const claimed = await claimSendSlot(order.id, "whatsapp");
  if (!claimed) {
    console.log(`[notifications] WhatsApp for order ${order.orderNumber} already attempted — skipping`);
    return;
  }

  const fromAddress = toWhatsAppAddress(from);
  const results = await Promise.allSettled(
    recipients.map((to) =>
      client.messages.create({ to: toWhatsAppAddress(to), from: fromAddress, body })
    )
  );

  const sids: string[] = [];
  const errors: string[] = [];
  results.forEach((result, i) => {
    const maskedTo = maskPhone(recipients[i]);
    if (result.status === "fulfilled") {
      sids.push(result.value.sid);
      console.log(
        `[notifications] WhatsApp sent — order: ${order.orderNumber}, to: ${maskedTo}, sid: ${result.value.sid}`
      );
    } else {
      const category = errorCategory(result.reason);
      errors.push(category);
      console.error(
        `[notifications] WhatsApp failed — order: ${order.orderNumber}, to: ${maskedTo}, error: ${category}`
      );
    }
  });

  await recordResult(
    order.id,
    "whatsapp",
    sids.length > 0
      ? { status: "SENT", messageSid: sids.join(",") }
      : { status: "FAILED", error: errors.join(",") || "unknown_error" }
  );
}

/**
 * Fires both channels independently (Promise.allSettled) so a failure in one
 * never blocks or fails the other — and, critically, never throws back to
 * the caller. Order creation must never fail because a notification did.
 */
export async function sendOrderNotifications(order: OrderNotificationData): Promise<void> {
  await Promise.allSettled([sendOrderSms(order), sendOrderWhatsApp(order)]);
}
