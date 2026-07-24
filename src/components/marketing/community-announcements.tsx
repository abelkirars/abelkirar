import Image from "next/image";
import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Announcement } from "@prisma/client";

function sortKey(announcement: Announcement): number {
  return (announcement.eventDate ?? announcement.createdAt).getTime();
}

export async function CommunityAnnouncements() {
  const announcements = await prisma.announcement.findMany({
    where: { published: true },
  });

  if (announcements.length === 0) return null;

  const sorted = [...announcements].sort((a, b) => sortKey(b) - sortKey(a));

  return (
    <section className="py-20 sm:py-28">
      <Container>
        <SectionHeading
          eyebrow="Announcements"
          title="What's happening in the community"
          align="center"
          className="mx-auto"
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((announcement) => (
            <Card key={announcement.id}>
              {announcement.imageUrl && (
                <div className="relative aspect-4/3 w-full">
                  <Image
                    src={announcement.imageUrl}
                    alt={announcement.title}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
              <CardHeader>
                <h3 className="font-heading text-xl font-semibold">
                  {announcement.title}
                </h3>
                {announcement.eventDate && (
                  <p className="text-sm text-muted-foreground">
                    {announcement.eventDate.toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{announcement.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
