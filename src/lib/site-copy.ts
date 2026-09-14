import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import type { FlatMessages } from "@/lib/site-copy-keys";
import { readCopyRows } from "@/lib/site-copy-reader";
import { isLocale, locales } from "@/i18n/locale";
import { SITE_COPY_CACHE_SECONDS, SITE_COPY_READ_TIMEOUT_MS, SITE_COPY_RENDER_TIMEOUT_MS, siteCopyCacheTag } from "@/lib/site-copy-cache";

/**
 * Reads the admin's copy overrides for one locale.
 *
 * React cache deduplicates within a render; Next's Data Cache reuses results
 * across requests for 60 seconds, separately per locale. The save endpoint
 * expires affected locale tags after commit, including resets to defaults.
 * This project does not enable Cache Components, so use unstable_cache rather
 * than changing the site's rendering architecture to adopt `use cache`.
 *
 * Rendering waits at most 300ms for the entire lookup. A slower cold read
 * continues via Next after(), with a separate 2-second read deadline. Its
 * eventual successful result warms the Data Cache: a render timeout must
 * never replace that result with empty overrides cached for a minute.
 * Only an actual read failure is cached as empty overrides for 60 seconds.
 * Healthy cache hits require no Postgres connection. Timers bound waiting,
 * not cancellation: the dedicated reader also sets short driver/server
 * timeouts and uses a separate, single-connection pool.
 */
async function withDeadline<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Site copy deadline exceeded")), milliseconds);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

// Coalesce simultaneous cold reads for the same locale in this instance.
const inFlight = new Map<string, Promise<FlatMessages>>();
function loadCopyOverrides(locale: string): Promise<FlatMessages> {
  const pending = inFlight.get(locale);
  if (pending) return pending;
  const work = (async () => {
    try {
      const rows = await withDeadline(readCopyRows(locale), SITE_COPY_READ_TIMEOUT_MS);
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    } catch {
      console.warn(`[site-copy] using file defaults for ${locale}`);
      return {};
    }
  })().finally(() => inFlight.delete(locale));
  inFlight.set(locale, work);
  return work;
}

const readers = Object.fromEntries(locales.map((locale) => [locale,
  unstable_cache(() => loadCopyOverrides(locale), ["site-copy-v3", locale], {
    revalidate: SITE_COPY_CACHE_SECONDS,
    tags: [siteCopyCacheTag(locale)],
  }),
]));

export const getCopyOverrides = cache(async (locale: string): Promise<FlatMessages> => {
  if (!isLocale(locale)) return {};
  const pending = readers[locale]();
  try {
    return await withDeadline(pending, SITE_COPY_RENDER_TIMEOUT_MS);
  } catch {
    // Register while still inside the request. Next keeps the serverless
    // invocation alive and awaits cache writes scheduled by the late read.
    after(async () => {
      try {
        await withDeadline(pending, SITE_COPY_READ_TIMEOUT_MS + 500);
      } catch {
        // The visible response already uses defaults; do not log credentials.
      }
    });
    return {};
  }
});

export interface CopyOverrideRecord {
  key: string;
  value: string;
  updatedAt: Date;
  updatedBy: string | null;
}

/**
 * The same rows with their audit fields, for the admin editor's "edited by"
 * line. Separate from getCopyOverrides so the public render path keeps
 * selecting only the two columns it actually uses.
 *
 * This one is allowed to throw: the editor is a logged-in admin tool, and
 * failing loudly there is better than silently presenting the defaults as if
 * nothing had ever been edited.
 */
export async function getCopyRecords(locale: string): Promise<CopyOverrideRecord[]> {
  return prisma.siteCopy.findMany({
    where: { locale },
    select: { key: true, value: true, updatedAt: true, updatedBy: true },
    orderBy: { key: "asc" },
  });
}
