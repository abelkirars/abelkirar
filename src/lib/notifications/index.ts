import { sendEmail, adminEmailRecipients } from "@/lib/notifications/email";
import { sendSmsToRecipients } from "@/lib/notifications/sms";
import { sendWhatsAppToRecipients } from "@/lib/notifications/whatsapp";
import { isTwilioNotificationsEnabled } from "@/lib/notifications/twilio-client";
import { parseRecipientList } from "@/lib/phone";
import {
  adminConciseMessage,
  adminNewOrderEmail,
  adminOrderCancelledEmail,
  adminPaymentConfirmedEmail,
  adminPaymentNotFoundEmail,
  adminPaymentSubmittedEmail,
  customerOrderPendingEmail,
  customerPaymentConfirmedEmail,
} from "@/lib/notifications/templates";
import type { OrderNotificationData } from "@/lib/notifications/types";

/** Sends to every configured admin email address; no-ops if none are set. */
async function sendToAdminEmails(subject: string, html: string) {
  const recipients = adminEmailRecipients();
  if (!recipients.length) return;
  await sendEmail({ to: recipients, subject, html });
}

/**
 * Sends the same concise event notification over SMS and WhatsApp, to every
 * configured recipient on each channel. A no-op (zero Twilio requests) when
 * TWILIO_NOTIFICATIONS_ENABLED isn't "true" — checked once here so invalid
 * recipient parsing/logging doesn't happen at all while the feature is off.
 */
async function sendToTwilioChannels(eventLabel: string, order: OrderNotificationData) {
  if (!isTwilioNotificationsEnabled()) return;

  const body = adminConciseMessage(eventLabel, order);
  const smsRecipients = parseRecipientList(process.env.TWILIO_SMS_RECIPIENTS, "SMS");
  const whatsappRecipients = parseRecipientList(process.env.TWILIO_WHATSAPP_RECIPIENTS, "WhatsApp");

  await Promise.all([
    sendSmsToRecipients(smsRecipients, body),
    sendWhatsAppToRecipients(whatsappRecipients, body),
  ]);
}

/**
 * Single entry point for order notifications. Email is always the primary,
 * guaranteed channel (Resend is already configured in this project). SMS and
 * WhatsApp go through Twilio and only ever fire when TWILIO_NOTIFICATIONS_ENABLED
 * is "true" — see notifications/twilio-client.ts.
 */
export const notificationService = {
  async notifyCustomerOrderPending(order: OrderNotificationData) {
    const { subject, html } = customerOrderPendingEmail(order);
    await sendEmail({ to: order.customerEmail, subject, html });
  },

  async notifyCustomerPaymentConfirmed(order: OrderNotificationData) {
    const { subject, html } = customerPaymentConfirmedEmail(order);
    await sendEmail({ to: order.customerEmail, subject, html });
  },

  async notifyAdminNewOrder(order: OrderNotificationData) {
    const { subject, html } = adminNewOrderEmail(order);
    await Promise.all([
      sendToAdminEmails(subject, html),
      sendToTwilioChannels("New order", order),
    ]);
  },

  async notifyAdminPaymentSubmitted(order: OrderNotificationData) {
    const { subject, html } = adminPaymentSubmittedEmail(order);
    await Promise.all([
      sendToAdminEmails(subject, html),
      sendToTwilioChannels("Payment confirmation submitted", order),
    ]);
  },

  async notifyAdminPaymentConfirmed(order: OrderNotificationData, confirmedByDisplayName: string) {
    const { subject, html } = adminPaymentConfirmedEmail(order, confirmedByDisplayName);
    await Promise.all([
      sendToAdminEmails(subject, html),
      sendToTwilioChannels("Payment confirmed", order),
    ]);
  },

  async notifyAdminPaymentNotFound(order: OrderNotificationData) {
    const { subject, html } = adminPaymentNotFoundEmail(order);
    await Promise.all([
      sendToAdminEmails(subject, html),
      sendToTwilioChannels("Payment not found", order),
    ]);
  },

  async notifyAdminOrderCancelled(order: OrderNotificationData, cancelledByDisplayName: string) {
    const { subject, html } = adminOrderCancelledEmail(order, cancelledByDisplayName);
    await Promise.all([
      sendToAdminEmails(subject, html),
      sendToTwilioChannels("Order cancelled", order),
    ]);
  },
};
