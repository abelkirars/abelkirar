export interface PaymentInstructions {
  heading: string;
  lines: string[];
}

type PaymentInstructionsTranslator = (
  key: string,
  values?: Record<string, string | number>
) => string;

/**
 * Zelle/Cash App recipient details, read from env so they never need to be
 * hard-coded in frontend/public code. Configure these in .env.local.
 * `t` must resolve keys from the "paymentInstructions" message namespace —
 * pass a translator from either `getTranslations` (RSC) or `createTranslator`
 * (email templates, outside of React).
 */
export function getPaymentInstructions(
  t: PaymentInstructionsTranslator,
  method: "ZELLE" | "CASH_APP" | "EUR_BANK_TRANSFER",
  orderNumber: string
): PaymentInstructions {
  if (method === "EUR_BANK_TRANSFER") {
    return {
      heading: t("eurHeading"),
      lines: [
        t("eurDetailsLater"),
        t("eurIncludeOrderNumber", { orderNumber }),
      ],
    };
  }

  if (method === "ZELLE") {
    const name = process.env.ZELLE_RECIPIENT_NAME || "(Zelle recipient name not configured)";
    const target = process.env.ZELLE_RECIPIENT_EMAIL_OR_PHONE || "(not configured)";
    const extra = process.env.ZELLE_ADDITIONAL_INSTRUCTIONS?.trim();
    return {
      heading: t("zelleHeading"),
      lines: [
        t("zelleSendTo", { name, target }),
        t("includeOrderNumberInNote", { orderNumber }),
        ...(extra ? [extra] : []),
      ],
    };
  }

  const cashtag = process.env.CASHAPP_CASHTAG || "(Cash App $cashtag not configured)";
  const extra = process.env.CASHAPP_ADDITIONAL_INSTRUCTIONS?.trim();
  return {
    heading: t("cashAppHeading"),
    lines: [
      t("cashAppSendTo", { cashtag }),
      t("includeOrderNumberInMemo", { orderNumber }),
      ...(extra ? [extra] : []),
    ],
  };
}
