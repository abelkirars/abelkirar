const MAX_POSTGRES_INT = 2_147_483_647n;

/** Formats stored integer cents for an editable USD input without using floats. */
export function formatUsdInput(cents: number) {
  const value = BigInt(cents);
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

/** Parses dollars and up to two decimal places into integer cents exactly. */
export function parseUsdInput(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  if (cents <= 0n || cents > MAX_POSTGRES_INT) return null;
  return Number(cents);
}
