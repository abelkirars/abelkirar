import Image from "next/image";
import { getSiteMedia } from "@/lib/site-media";
import type { MediaSlot } from "@/lib/site-media-config";
import { Container } from "@/components/marketing/container";

export async function PublishedMedia({ slot }: { slot: MediaSlot }) {
  const media = await getSiteMedia(slot);
  if (!media) return null;
  return <section className="py-14 sm:py-20">
    <Container className="max-w-4xl">
      <h2 className="mb-6 font-heading text-2xl sm:text-3xl">{media.title}</h2>
      {media.mimeType.startsWith("image/") ? <Image src={media.url} alt={media.title} width={1000} height={750} sizes="(min-width: 1024px) 850px, 100vw" className="max-h-[540px] w-full rounded-2xl object-contain" /> : media.mimeType.startsWith("audio/") ?
        <audio controls preload="none" src={media.url} aria-label={media.title} className="w-full" /> :
        <video controls playsInline preload="none" src={media.url} aria-label={media.title} className="aspect-video w-full rounded-2xl bg-black" />}
      {media.transcript && <p className="mt-5 whitespace-pre-line text-muted-foreground">{media.transcript}</p>}
    </Container>
  </section>;
}
