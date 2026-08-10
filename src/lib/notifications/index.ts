import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { sendEmail, adminEmailRecipients, type SendEmailResult } from "@/lib/notifications/email";
import { sendSmsToRecipients } from "@/lib/notifications/sms";
import { sendWhatsAppToRecipients } from "@/lib/notifications/whatsapp";
import { isTwilioNotificationsEnabled } from "@/lib/notifications/twilio-client";
import { sendOrderNotifications } from "@/lib/notifications/order-notifications";
import { parseRecipientList } from "@/lib/phone";
import {
  adminConciseMessage,
  adminNewOrderEmail,
  adminNewCustomOrderEmail,
  adminOrderCancelledEmail,
  adminPaymentConfirmedEmail,
  adminPaymentNotFoundEmail,
  adminPaymentSubmittedEmail,
  adminQuoteSentEmail,
  customerOrderPendingEmail,
  customerCustomOrderPendingEmail,
  customerQuoteReadyEmail,
  customerPaymentConfirmedEmail,
  studentInviteEmail,
  studentPasswordResetEmail,
} from "@/lib/notifications/templates";
import type { OrderNotificationData, CustomOrderNotificationData } from "@/lib/notifications/types";

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
 * Wraps an order-related email send with a failure record in
 * OrderNotificationLog — failures only, not successes: there's no UI that
 * consumes success history yet, and a table containing only failures is
 * simpler to badge and to read. The schema still supports SENT if that's
 * wanted later.
 *
 * The log write happens strictly after the real send already resolved, so
 * it can never affect whether the email itself succeeded. If the write
 * itself fails, that's logged and swallowed — an observability failure must
 * never look like, or cause, a notification failure.
 */
async function withOrderNotificationLog(
  orderId: string,
  kind: string,
  send: () => Promise<SendEmailResult>
): Promise<SendEmailResult> {
  const result = await send();

  if (!result.sent) {
    try {
      await prisma.orderNotificationLog.create({
        data: { orderId, kind, status: "FAILED", error: result.error },
      });
    } catch (err) {
      console.error(
        `[notifications] Failed to write OrderNotificationLog (order ${orderId}, kind ${kind}):`,
        err
      );
    }
  }

  return result;
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
    return withOrderNotificationLog(order.id, "customerOrderPending", () =>
      sendEmail({ to: order.customerEmail, subject, html })
    );
  },

  /**
   * Sent by the admin quote action (and its resend companion) once a
   * Custom Made request has a real price. By now the order carries a real
   * total/paymentMethod, so this is a normal OrderNotificationData send —
   * same shape as notifyCustomerPaymentConfirmed below.
   */
  async notifyCustomerQuoteReady(order: OrderNotificationData): Promise<SendEmailResult> {
    const [t, tPaymentLabels, tInstructions] = await Promise.all([
      getTranslations({ locale: order.locale, namespace: "emails.quoteReady" }),
      getTranslations({ locale: order.locale, namespace: "paymentLabels" }),
      getTranslations({ locale: order.locale, namespace: "paymentInstructions" }),
    ]);
    const { subject, html } = customerQuoteReadyEmail(order, t, tPaymentLabels, tInstructions);
    return withOrderNotificationLog(order.id, "customerQuoteReady", () =>
      sendEmail({ to: order.customerEmail, subject, html })
    );
  },

  async notifyCustomerPaymentConfirmed(order: OrderNotificationData): Promise<SendEmailResult> {
    const [t, tPaymentLabels] = await Promise.all([
      getTranslations({ locale: order.locale, namespace: "emails.paymentConfirmed" }),
      getTranslations({ locale: order.locale, namespace: "paymentLabels" }),
    ]);
    const { subject, html } = customerPaymentConfirmedEmail(order, t, tPaymentLabels);
    return withOrderNotificationLog(order.id, "customerPaymentConfirmed", () =>
      sendEmail({ to: order.customerEmail, subject, html })
    );
  },

  /**
   * Custom Made quote-request flow (OrderType.CUSTOM_QUOTE) — no price or
   * payment method exists yet, so neither is mentioned. No Twilio leg (out
   * of scope for this phase).
   */
  async notifyCustomerCustomOrderPending(order: CustomOrderNotificationData): Promise<SendEmailResult> {
    const t = await getTranslations({ locale: order.locale, namespace: "emails.customOrderPending" });
    const { subject, html } = customerCustomOrderPendingEmail(order, t);
    return withOrderNotificationLog(order.id, "customerCustomOrderPending", () =>
      sendEmail({ to: order.customerEmail, subject, html })
    );
  },

  async notifyAdminNewCustomOrder(order: CustomOrderNotificationData): Promise<SendEmailResult> {
    const { subject, html } = adminNewCustomOrderEmail(order);
    return withOrderNotificationLog(order.id, "adminNewCustomOrder", () =>
      sendToAdminEmails(subject, html)
    );
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
      withOrderNotificationLog(order.id, "adminNewOrder", () => sendToAdminEmails(subject, html)),
      sendOrderNotifications(order),
    ]);
    return emailResult;
  },

  async notifyAdminPaymentSubmitted(order: OrderNotificationData): Promise<SendEmailResult> {
    const { subject, html } = adminPaymentSubmittedEmail(order);
    const [emailResult] = await Promise.all([
      withOrderNotificationLog(order.id, "adminPaymentSubmitted", () => sendToAdminEmails(subject, html)),
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
      withOrderNotificationLog(order.id, "adminPaymentConfirmed", () => sendToAdminEmails(subject, html)),
      sendToTwilioChannels("Payment confirmed", order),
    ]);
    return emailResult;
  },

  async notifyAdminPaymentNotFound(order: OrderNotificationData): Promise<SendEmailResult> {
    const { subject, html } = adminPaymentNotFoundEmail(order);
    const [emailResult] = await Promise.all([
      withOrderNotificationLog(order.id, "adminPaymentNotFound", () => sendToAdminEmails(subject, html)),
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
      withOrderNotificationLog(order.id, "adminOrderCancelled", () => sendToAdminEmails(subject, html)),
      sendToTwilioChannels("Order cancelled", order),
    ]);
    return emailResult;
  },

  /**
   * Tells the admin list a quote went out and who sent it — fired from both
   * /quote and /quote/resend. Email only, no Twilio leg (out of scope), so
   * unlike notifyAdminOrderCancelled above this doesn't need the
   * Promise.all/sendToTwilioChannels pairing.
   */
  async notifyAdminQuoteSent(
    order: OrderNotificationData,
    quotedByDisplayName: string
  ): Promise<SendEmailResult> {
    const { subject, html } = adminQuoteSentEmail(order, quotedByDisplayName);
    return withOrderNotificationLog(order.id, "adminQuoteSent", () =>
      sendToAdminEmails(subject, html)
    );
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
