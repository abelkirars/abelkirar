import { z } from "zod";

/**
 * z.coerce.boolean() calls Boolean(value), so the literal string "false" —
 * which is what our admin forms send for an unchecked box — coerces to
 * `true` (any non-empty string is truthy). That silently breaks "uncheck
 * and save". This preprocesses "true"/"false" strings (and real booleans)
 * correctly before validating as a boolean.
 */
export function strictBoolean(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === null) return undefined;
    return value;
  }, z.boolean().default(defaultValue));
}
