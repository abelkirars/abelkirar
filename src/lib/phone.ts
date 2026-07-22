/** E.164: a leading "+", first digit 1-9, then up to 14 more digits (max 15 digits total). */
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export function isValidE164(phone: string): boolean {
  return E164_PATTERN.test(phone);
}

/**
 * Parses a comma-separated env var into a list of valid E.164 numbers.
 * Invalid entries are dropped (with a masked warning logged), never thrown —
 * one malformed recipient must not block the rest.
 */
export function parseRecipientList(raw: string | undefined, context: string): string[] {
  if (!raw) return [];

  const candidates = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const valid: string[] = [];
  for (const candidate of candidates) {
    if (isValidE164(candidate)) {
      valid.push(candidate);
    } else {
      console.warn(
        `[notifications] Skipping invalid ${context} phone number (not E.164): ${maskPhone(candidate)}`
      );
    }
  }
  return valid;
}

/** Masks a phone number for safe logging — keeps only the country code and last 2 digits. */
export function maskPhone(phone: string): string {
  if (phone.length <= 5) return "***";
  const country = phone.slice(0, phone.length > 12 ? 3 : 2);
  const last = phone.slice(-2);
  return `${country}${"*".repeat(Math.max(phone.length - country.length - 2, 3))}${last}`;
}
