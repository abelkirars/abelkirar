import {
  formatMoney,
  paymentMethodLabel,
  paymentRegionLabel,
  paymentStatusLabel,
  translatedPaymentMethodLabel,
  type OrderNotificationData,
} from "@/lib/notifications/types";
import { getPaymentInstructions } from "@/lib/notifications/payment-instructions";

type EmailTranslator = (key: string, values?: Record<string, string | number>) => string;

/**
 * Shared field block for every admin-facing order email: order number,
 * customer name/email/phone, products + quantities, total, payment method,
 * payment status, order status, and date/time. Reused by every admin
 * notification so each one carries the full required detail set.
 */
function adminOrderSummaryHtml(order: OrderNotificationData): string {
  const itemsHtml = order.items
    .map((i) => `<li>${i.quantity} × ${i.name}</li>`)
    .join("");

  return `
    <p><strong>Order:</strong> ${order.orderNumber}</p>
    <p><strong>Customer:</strong> ${order.customerName}</p>
    <p><strong>Email:</strong> ${order.customerEmail}</p>
    <p><strong>Phone:</strong> ${order.customerPhone}</p>
    <ul>${itemsHtml}</ul>
    <p><strong>Total:</strong> ${formatMoney(order.total, order.currency)}</p>
    <p><strong>Payment region:</strong> ${paymentRegionLabel(order.paymentRegion)} (${order.currency.toUpperCase()})</p>
    <p><strong>Payment method:</strong> ${paymentMethodLabel(order.paymentMethod)}</p>
    <p><strong>Payment status:</strong> ${paymentStatusLabel(order.paymentStatus)}</p>
    <p><strong>Order status:</strong> ${order.orderStatus}</p>
    <p><strong>Order date/time:</strong> ${order.createdAt.toLocaleString()}</p>
  `;
}

/**
 * Customer-facing — translated per the recipient's locale. `t` resolves
 * "emails.orderPending" keys, `tPaymentLabels` resolves "paymentLabels",
 * and `tInstructions` resolves "paymentInstructions" (passed through to
 * `getPaymentInstructions`). Admin emails below intentionally stay English,
 * matching the English-only admin dashboard.
 */
export function customerOrderPendingEmail(
  order: OrderNotificationData,
  t: EmailTranslator,
  tPaymentLabels: EmailTranslator,
  tInstructions: EmailTranslator
) {
  const instructions = getPaymentInstructions(tInstructions, order.paymentMethod, order.orderNumber);
  const itemsHtml = order.items
    .map((i) => `<li>${i.quantity} × ${i.name}</li>`)
    .join("");

  return {
    subject: t("subject", { orderNumber: order.orderNumber }),
    html: `
      <p>${t("thankYou", { customerName: order.customerName })}</p>
      <p><strong>${t("orderNumber")}:</strong> ${order.orderNumber}</p>
      <p><strong>${t("total")}:</strong> ${formatMoney(order.total, order.currency)}</p>
      <p><strong>${t("paymentMethod")}:</strong> ${translatedPaymentMethodLabel(tPaymentLabels, order.paymentMethod)}</p>
      <ul>${itemsHtml}</ul>
      <h3>${instructions.heading}</h3>
      <ul>${instructions.lines.map((l) => `<li>${l}</li>`).join("")}</ul>
      <p><strong>${t("important")}:</strong> ${t("manualVerificationNotice")}</p>
      <p>${t("submitConfirmationNotice")}</p>
    `,
  };
}

export function customerPaymentConfirmedEmail(
  order: OrderNotificationData,
  t: EmailTranslator,
  tPaymentLabels: EmailTranslator
) {
  return {
    subject: t("subject", { orderNumber: order.orderNumber }),
    html: `
      <p>${t("greeting", { customerName: order.customerName })}</p>
      <p>${t("body", {
        paymentMethod: translatedPaymentMethodLabel(tPaymentLabels, order.paymentMethod),
        orderNumber: order.orderNumber,
        total: formatMoney(order.total, order.currency),
      })}</p>
      <p>${t("nextSteps")}</p>
    `,
  };
}

export function adminNewOrderEmail(order: OrderNotificationData) {
  return {
    subject: `New order ${order.orderNumber} — ${paymentMethodLabel(order.paymentMethod)} payment pending verification`,
    html: `
      ${adminOrderSummaryHtml(order)}
      <p><a href="${order.adminOrderUrl}">Review this order in the admin dashboard</a></p>
    `,
  };
}

export function adminPaymentSubmittedEmail(order: OrderNotificationData) {
  return {
    subject: `Order ${order.orderNumber} — customer submitted payment confirmation`,
    html: `
      <p>The customer has submitted payment confirmation details for this order. A screenshot alone does not confirm payment — please verify against your actual Zelle/Cash App account activity before marking it paid.</p>
      ${adminOrderSummaryHtml(order)}
      <p><a href="${order.adminOrderUrl}">Review this order in the admin dashboard</a></p>
    `,
  };
}

export function adminPaymentConfirmedEmail(
  order: OrderNotificationData,
  confirmedByDisplayName: string
) {
  return {
    subject: `Order ${order.orderNumber} marked as paid by ${confirmedByDisplayName}`,
    html: `
      <p><strong>Confirmed by:</strong> ${confirmedByDisplayName}</p>
      ${adminOrderSummaryHtml(order)}
      <p><a href="${order.adminOrderUrl}">View order</a></p>
    `,
  };
}

export function adminPaymentNotFoundEmail(order: OrderNotificationData) {
  return {
    subject: `Order ${order.orderNumber} — payment not found`,
    html: `
      <p>This order's payment was marked as <strong>not found</strong> during manual verification.</p>
      ${adminOrderSummaryHtml(order)}
      <p><a href="${order.adminOrderUrl}">View order</a></p>
    `,
  };
}

export function adminOrderCancelledEmail(
  order: OrderNotificationData,
  cancelledByDisplayName: string
) {
  return {
    subject: `Order ${order.orderNumber} cancelled by ${cancelledByDisplayName}`,
    html: `
      <p><strong>Cancelled by:</strong> ${cancelledByDisplayName}</p>
      ${adminOrderSummaryHtml(order)}
      <p><a href="${order.adminOrderUrl}">View order</a></p>
    `,
  };
}

/**
 * Concise SMS/WhatsApp body shared by all five admin events. Deliberately
 * minimal: event type, order number, customer name, total, payment method,
 * payment status, order status, and the secure admin link — no screenshot
 * links, no full confirmation details, no customer address, no secrets.
 */
export function adminConciseMessage(eventLabel: string, order: OrderNotificationData): string {
  return (
    `${eventLabel}: ${order.orderNumber}\n` +
    `Customer: ${order.customerName}\n` +
    `Total: ${formatMoney(order.total, order.currency)} (${paymentRegionLabel(order.paymentRegion)})\n` +
    `Payment: ${paymentMethodLabel(order.paymentMethod)} — ${paymentStatusLabel(order.paymentStatus)}\n` +
    `Order status: ${order.orderStatus}\n` +
    `${order.adminOrderUrl}`
  );
}
