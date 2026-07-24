import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { announcementSchema } from "@/lib/validations/announcement";
import { uploadPublicImage, InvalidImageError } from "@/lib/public-image-upload";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const formData = await request.formData();
  const parsed = announcementSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    eventDate: formData.get("eventDate") || undefined,
    published: formData.get("published"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const image = formData.get("image");
  let imageUrl: string | undefined;
  if (image instanceof File && image.size > 0) {
    try {
      imageUrl = await uploadPublicImage(image, "announcements");
    } catch (err) {
      if (err instanceof InvalidImageError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  }

  const { title, description, eventDate, published } = parsed.data;
  const announcement = await prisma.announcement.create({
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
