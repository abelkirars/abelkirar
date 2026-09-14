import { z } from "zod";
import { locales } from "@/i18n/locale";

/**
 * Generous enough for the longest paragraph on the site (About is the
 * ceiling today at a few hundred characters) while still bounding what one
 * request can push into a column every page render reads.
 */
export const MAX_COPY_LENGTH = 4000;

/**
 * One edited string. There is no "reset" flag: a value equal to the wording
 * in messages/{locale}.json *is* the reset, and the route deletes the row
 * rather than storing a copy of the default. That keeps exactly one
 * representation of "unedited" in the table.
 */
export const copyChangeSchema = z.object({
  locale: z.enum(locales),
  key: z.string().min(1).max(200),
  value: z.string().max(MAX_COPY_LENGTH),
});

/**
 * Bounded so a single request cannot rewrite the entire site in one
 * unreviewable transaction; the editor saves one section at a time and the
 * largest section is well under this.
 */
export const copyUpdateSchema = z.object({
  changes: z.array(copyChangeSchema).min(1).max(200),
});

export type CopyChange = z.infer<typeof copyChangeSchema>;
