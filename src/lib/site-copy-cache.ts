export const SITE_COPY_CACHE_SECONDS = 60;
// A cold connection gets room to finish without making rendering wait for it.
export const SITE_COPY_READ_TIMEOUT_MS = 2000;
export const SITE_COPY_RENDER_TIMEOUT_MS = 300;

export function siteCopyCacheTag(locale: string) {
  return `site-copy:${locale}`;
}
