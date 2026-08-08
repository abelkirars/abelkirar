import { getTranslations } from "next-intl/server";
import { sendEmail, adminEmailRecipients, type SendEmailResult } from "@/lib/notifications/email";
import { sendSmsToRecipients } from "@/lib/notifications/sms";
import { sendWhatsAppToRecipients } from "@/lib/notifications/whatsapp";
import { isTwilioNotificationsEnabled } from "@/lib/notifications/twilio-client";
import { sendOrderNotifications } from "@/lib/notifications/order-notifications";
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
  studentInviteEmail,
  studentPasswordResetEmail,
} from "@/lib/notifications/templates";
import type { OrderNotificationData } from "@/lib/notifications/types";

/**
 * Sends to every configured admin email address. If none are configured,
 * this does NOT report success — an empty ADMIN_NOTIFICATION_EMAILS is a
 * real, visible misconfiguration (the admin silently getting zero order
 * notifications), not a no-op. Never throws — a missing config must not
 * fail the order/action that triggered this call.
 */
async function sendToAdminEmails(subject: string, html: string): Promise<SendEmailResult> {
  const recipients = adminEmailRecipients();
  if (!recipients.length) {
    console.warn(
      `[notifications] ADMIN_NOTIFICATION_EMAILS is not configured — skipping admin email: ${subject}`
    );
    return { sent: false, error: "No admin recipients configured (ADMIN_NOTIFICATION_EMAILS is empty)" };
  }
  return sendEmail({ to: recipients, subject, html });
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
  /**
   * Both customer emails below use `order.locale` — the checkout locale
   * captured on the Order at creation time (see Order.locale) — rather than
   * the ambient request cookie. `notifyCustomerOrderPending` fires within the
   * same request the customer checked out in, so the two would agree anyway,
   * but `notifyCustomerPaymentConfirmed` fires later from an admin's request
   * (whose own locale cookie is irrelevant to the customer), so it relies on
   * the stored value.
   */
  async notifyCustomerOrderPending(order: OrderNotificationData): Promise<SendEmailResult> {
    const [t, tPaymentLabels, tInstructions] = await Promise.all([
      getTranslations({ locale: order.locale, namespace: "emails.orderPending" }),
      getTranslations({ locale: order.locale, namespace: "paymentLabels" }),
      getTranslations({ locale: order.locale, namespace: "paymentInstructions" }),
    ]);
    const { subject, html } = customerOrderPendingEmail(order, t, tPaymentLabels, tInstructions);
    return sendEmail({ to: order.customerEmail, subject, html });
  },

  async notifyCustomerPaymentConfirmed(order: OrderNotificationData): Promise<SendEmailResult> {
    const [t, tPaymentLabels] = await Promise.all([
      getTranslations({ locale: order.locale, namespace: "emails.paymentConfirmed" }),
      getTranslations({ locale: order.locale, namespace: "paymentLabels" }),
    ]);
    const { subject, html } = customerPaymentConfirmedEmail(order, t, tPaymentLabels);
    return sendEmail({ to: order.customerEmail, subject, html });
  },

  async notifyAdminNewOrder(order: OrderNotificationData): Promise<SendEmailResult> {
    const { subject, html } = adminNewOrderEmail(order);
    // The Twilio leg for this event uses the richer, idempotency-tracked
    // sendOrderNotifications (see order-notifications.ts) instead of the
    // generic sendToTwilioChannels used by the other four events below —
    // calling both would double-send SMS/WhatsApp for every new order. Only
    // the email leg's result is returned; Twilio manages its own delivery
    // status independently (Order.smsStatus/whatsappStatus).
    const [emailResult] = await Promise.all([
      sendToAdminEmails(subject, html),
      sendOrderNotifications(order),
    ]);
    return emailResult;
  },

  async notifyAdminPaymentSubmitted(order: OrderNotificationData): Promise<SendEmailResult> {
    const { subject, html } = adminPaymentSubmittedEmail(order);
    const [emailResult] = await Promise.all([
      sendToAdminEmails(subject, html),
      sendToTwilioChannels("Payment confirmation submitted", order),
    ]);
    return emailResult;
  },

  async notifyAdminPaymentConfirmed(
    order: OrderNotificationData,
    confirmedByDisplayName: string
  ): Promise<SendEmailResult> {
    const { subject, html } = adminPaymentConfirmedEmail(order, confirmedByDisplayName);
    const [emailResult] = await Promise.all([
      sendToAdminEmails(subject, html),
      sendToTwilioChannels("Payment confirmed", order),
    ]);
    return emailResult;
  },

  async notifyAdminPaymentNotFound(order: OrderNotificationData): Promise<SendEmailResult> {
    const { subject, html } = adminPaymentNotFoundEmail(order);
    const [emailResult] = await Promise.all([
      sendToAdminEmails(subject, html),
      sendToTwilioChannels("Payment not found", order),
    ]);
    return emailResult;
  },

  async notifyAdminOrderCancelled(
    order: OrderNotificationData,
    cancelledByDisplayName: string
  ): Promise<SendEmailResult> {
    const { subject, html } = adminOrderCancelledEmail(order, cancelledByDisplayName);
    const [emailResult] = await Promise.all([
      sendToAdminEmails(subject, html),
      sendToTwilioChannels("Order cancelled", order),
    ]);
    return emailResult;
  },

  /**
   * Delivers a student's invite (or resend) action link — never logs it,
   * only embeds it in the email body. Renders in the student's stored
   * StudentProfile.locale.
   */
  async notifyStudentInvite(
    email: string,
    fullName: string,
    actionLink: string,
    locale: string
  ): Promise<SendEmailResult> {
    const t = await getTranslations({ locale, namespace: "emails.studentInvite" });
    const { subject, html } = studentInviteEmail(fullName, actionLink, t);
    return sendEmail({ to: email, subject, html });
  },

  /**
   * Delivers a password-reset action link from the /student/forgot-password
   * flow. Distinct copy from notifyStudentInvite (see studentPasswordResetEmail)
   * even though the underlying Supabase mechanism (a one-time recovery link)
   * is identical.
   */
  async notifyStudentPasswordReset(
    email: string,
    fullName: string,
    actionLink: string,
    locale: string
  ): Promise<SendEmailResult> {
    const t = await getTranslations({ locale, namespace: "emails.studentPasswordReset" });
    const { subject, html } = studentPasswordResetEmail(fullName, actionLink, t);
    return sendEmail({ to: email, subject, html });
  },
};
