import { requireAdminPage } from "@/lib/admin/dal";
import { getSiteMedia } from "@/lib/site-media";
import { MEDIA_SLOTS, type MediaSlot } from "@/lib/site-media-config";
import { MediaManager } from "@/components/admin/media-manager";

export default async function MediaPage() {
  await requireAdminPage();
  const entries = await Promise.all((Object.keys(MEDIA_SLOTS) as MediaSlot[]).map(async (slot) => [slot, await getSiteMedia(slot)]));
  return <MediaManager initialMedia={Object.fromEntries(entries)} />;
}
