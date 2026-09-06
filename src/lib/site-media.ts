import "server-only";
import { MEDIA_BUCKET, allowedMedia, type MediaSlot, type SiteMedia } from "@/lib/site-media-config";

// Public media stays independent of Postgres. Missing assets or storage outages
// never take the marketing pages offline, and no private key is needed here.
export async function getSiteMedia(slot: MediaSlot): Promise<SiteMedia | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  try {
    const response = await fetch(`${base}/storage/v1/object/public/${MEDIA_BUCKET}/published/${slot}.json`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    const media = await response.json();
    if (typeof media.url !== "string" || !media.url.startsWith(`${base}/storage/v1/object/public/${MEDIA_BUCKET}/uploads/`) ||
      typeof media.title !== "string" || typeof media.transcript !== "string" || !allowedMedia(slot, media.mimeType, 1)) return null;
    return media;
  } catch { return null; }
}
