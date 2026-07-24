import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { AnnouncementForm } from "@/components/admin/announcement-form";
import { AnnouncementRow } from "@/components/admin/announcement-row";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <section className="py-10">
      <Container className="max-w-3xl">
        <h1 className="font-heading text-2xl font-semibold">Announcements</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shown on the public Community page when published, sorted by event date.
        </p>

        <div className="mt-6 rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium">Add announcement</h2>
          <AnnouncementForm />
        </div>

        <div className="mt-8 space-y-3">
          {announcements.map((announcement) => (
            <AnnouncementRow key={announcement.id} announcement={announcement} />
          ))}
          {announcements.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">No announcements yet.</p>
          )}
        </div>
      </Container>
    </section>
  );
}
