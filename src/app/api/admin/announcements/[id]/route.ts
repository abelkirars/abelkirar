import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { announcementSchema } from "@/lib/validations/announcement";
import {
  uploadPublicImage,
  deletePublicImage,
  InvalidImageError,
} from "@/lib/public-image-upload";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  }

  const formData = await request.formData();

  // Toggle-publish calls only send `published`, so other fields fall back to
  // the existing row instead of failing validation on missing title/description.
  const parsed = announcementSchema.safeParse({
    title: formData.get("title") ?? existing.title,
    description: formData.get("description") ?? existing.description,
    eventDate: formData.get("eventDate") ?? existing.eventDate?.toISOString() ?? undefined,
    published: formData.has("published") ? formData.get("published") : existing.published,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const image = formData.get("image");
  let imageUrl = existing.imageUrl;
  if (image instanceof File && image.size > 0) {
    try {
      imageUrl = await uploadPublicImage(image, "announcements");
    } catch (err) {
      if (err instanceof InvalidImageError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
    if (existing.imageUrl) await deletePublicImage(existing.imageUrl);
  }

  const { title, description, eventDate, published } = parsed.data;
  const announcement = await prisma.announcement.update({
    where: { id },
    data: {
      title,
      description,
      published,
      eventDate: eventDate ? new Date(eventDate) : null,
      imageUrl,
    },
  });

  return NextResponse.json({ ok: true, announcement });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
  }

  await prisma.announcement.delete({ where: { id } });
  if (existing.imageUrl) await deletePublicImage(existing.imageUrl);

  return NextResponse.json({ ok: true });
}
