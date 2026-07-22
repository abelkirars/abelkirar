import { randomInt } from "node:crypto";

/**
 * Human-readable order number shown to customers and used to look up an
 * order without exposing the internal cuid, e.g. "ABK-20260721-4Q7K".
 * Not guaranteed unique by construction — callers must retry on a unique
 * constraint violation (see createOrderWithUniqueNumber in src/lib/orders.ts).
 */
export function generateOrderNumber(now: Date = new Date()): string {
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  let suffix = "";
  for (let i = 0; i < 5; i++) {
    suffix += alphabet[randomInt(alphabet.length)];
  }
  return `ABK-${datePart}-${suffix}`;
}
