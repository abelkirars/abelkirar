const MAX_POSTGRES_INT = BigInt(2_147_483_647);

/** Formats stored integer cents for an editable USD input without using floats. */
export function formatUsdInput(cents: number) {
  const value = BigInt(cents);
  const centsPerDollar = BigInt(100);
  return `${value / centsPerDollar}.${String(value % centsPerDollar).padStart(2, "0")}`;
}

/** Parses dollars and up to two decimal places into integer cents exactly. */
export function parseUsdInput(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const cents = BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  if (cents <= BigInt(0) || cents > MAX_POSTGRES_INT) return null;
  return Number(cents);
}
