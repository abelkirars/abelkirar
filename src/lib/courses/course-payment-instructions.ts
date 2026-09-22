import "server-only";

export type CoursePaymentMethod = "ZELLE" | "CASH_APP";

export type CoursePaymentInstruction = {
  method: CoursePaymentMethod;
  label: string;
  destination: string;
  recipientName: string | null;
  additionalInstructions: string | null;
};

function configured(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Returns only configured payment destinations and never emits placeholder credentials. */
export function getConfiguredCoursePaymentInstructions(): CoursePaymentInstruction[] {
  const instructions: CoursePaymentInstruction[] = [];
  const zelleTarget = configured(process.env.ZELLE_RECIPIENT_EMAIL_OR_PHONE);
  const zelleName = configured(process.env.ZELLE_RECIPIENT_NAME);
  if (zelleTarget && zelleName) {
    instructions.push({
      method: "ZELLE",
      label: "Zelle",
      destination: zelleTarget,
      recipientName: zelleName,
      additionalInstructions: configured(process.env.ZELLE_ADDITIONAL_INSTRUCTIONS),
    });
  }

  const cashTag = configured(process.env.CASHAPP_CASHTAG);
  if (cashTag) {
    instructions.push({
      method: "CASH_APP",
      label: "Cash App",
      destination: cashTag,
      recipientName: null,
      additionalInstructions: configured(process.env.CASHAPP_ADDITIONAL_INSTRUCTIONS),
    });
  }
  return instructions;
}

export function isConfiguredCoursePaymentMethod(method: CoursePaymentMethod): boolean {
  return getConfiguredCoursePaymentInstructions().some((item) => item.method === method);
}
