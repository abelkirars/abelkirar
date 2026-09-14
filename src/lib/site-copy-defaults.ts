import englishMessages from "../../messages/en.json";
import amharicMessages from "../../messages/am.json";
import { flattenMessages, type FlatMessages } from "@/lib/site-copy-keys";
import type { Locale } from "@/i18n/locale";

/**
 * The shipped wording, flattened to dot paths, for every locale.
 *
 * Computed once at module load from the same JSON the render path imports, so
 * "what is the default for this key" has a single answer that the write API
 * validates against and the editor's reset button restores. Adding a locale
 * means adding a file and a line here — the type annotation makes forgetting
 * the line a compile error rather than a runtime surprise.
 */
const DEFAULT_COPY: Record<Locale, FlatMessages> = {
  en: flattenMessages(englishMessages),
  am: flattenMessages(amharicMessages),
};

export function defaultCopy(locale: Locale): FlatMessages {
  return DEFAULT_COPY[locale];
}

/**
 * Every editable key, in the order it appears in the English file. Source
 * order groups related strings together far better than alphabetical would —
 * `eyebrow`, `title`, `description` is the order they appear on the page.
 */
export const COPY_KEYS: readonly string[] = Object.keys(DEFAULT_COPY.en);
