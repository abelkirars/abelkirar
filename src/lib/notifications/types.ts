export interface OrderNotificationItem {
  name: string;
  quantity: number;
}

export type PaymentMethodValue = "ZELLE" | "CASH_APP" | "EUR_BANK_TRANSFER";
export type PaymentRegionValue = "US" | "EUROZONE";

export interface OrderNotificationData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  total: number; // cents
  currency: string;
  paymentMethod: PaymentMethodValue;
  paymentRegion: PaymentRegionValue;
  paymentStatus: string;
  orderStatus: string;
  createdAt: Date;
  items: OrderNotificationItem[];
  adminOrderUrl: string;
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function paymentMethodLabel(method: PaymentMethodValue): string {
  if (method === "ZELLE") return "Zelle";
  if (method === "CASH_APP") return "Cash App";
  return "Euro Bank Transfer";
}

export function paymentRegionLabel(region: PaymentRegionValue): string {
  return region === "US" ? "United States" : "Eurozone";
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING_VERIFICATION: "Pending verification",
  PAID: "Paid",
  PAYMENT_NOT_FOUND: "Payment not found",
  REFUNDED: "Refunded",
};

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

type PaymentLabelTranslator = (key: string) => string;

/**
 * Customer-facing equivalents of the label helpers above, translated via the
 * "paymentLabels" message namespace. The admin dashboard and admin
 * notifications intentionally keep using the English-only helpers above.
 */
export function translatedPaymentMethodLabel(
  t: PaymentLabelTranslator,
  method: PaymentMethodValue
): string {
  if (method === "ZELLE") return t("zelle");
  if (method === "CASH_APP") return t("cashApp");
  return t("eurBankTransfer");
}

export function translatedPaymentRegionLabel(
  t: PaymentLabelTranslator,
  region: PaymentRegionValue
): string {
  return region === "US" ? t("us") : t("eurozone");
}

const PAYMENT_STATUS_KEYS: Record<string, string> = {
  PENDING_VERIFICATION: "pendingVerification",
  PAID: "paid",
  PAYMENT_NOT_FOUND: "paymentNotFound",
  REFUNDED: "refunded",
};

export function translatedPaymentStatusLabel(
  t: PaymentLabelTranslator,
  status: string
): string {
  const key = PAYMENT_STATUS_KEYS[status];
  return key ? t(key) : status;
}
