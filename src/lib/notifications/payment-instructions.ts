export interface PaymentInstructions {
  heading: string;
  lines: string[];
}

/**
 * Zelle/Cash App recipient details, read from env so they never need to be
 * hard-coded in frontend/public code. Configure these in .env.local.
 */
export function getPaymentInstructions(
  method: "ZELLE" | "CASH_APP" | "EUR_BANK_TRANSFER",
  orderNumber: string
): PaymentInstructions {
  if (method === "EUR_BANK_TRANSFER") {
    return {
      heading: "Euro Bank Transfer",
      lines: [
        "EUR payment details will be provided after the order is placed.",
        `Include your order number ${orderNumber} in the payment reference once you receive those details.`,
      ],
    };
  }

  if (method === "ZELLE") {
    const name = process.env.ZELLE_RECIPIENT_NAME || "(Zelle recipient name not configured)";
    const target = process.env.ZELLE_RECIPIENT_EMAIL_OR_PHONE || "(not configured)";
    const extra = process.env.ZELLE_ADDITIONAL_INSTRUCTIONS?.trim();
    return {
      heading: "Pay with Zelle",
      lines: [
        `Send payment via Zelle to: ${name} (${target})`,
        `Include your order number ${orderNumber} in the payment note/memo.`,
        ...(extra ? [extra] : []),
      ],
    };
  }

  const cashtag = process.env.CASHAPP_CASHTAG || "(Cash App $cashtag not configured)";
  const extra = process.env.CASHAPP_ADDITIONAL_INSTRUCTIONS?.trim();
  return {
    heading: "Pay with Cash App",
    lines: [
      `Send payment via Cash App to: ${cashtag}`,
      `Include your order number ${orderNumber} in the payment note.`,
      ...(extra ? [extra] : []),
    ],
  };
}
