import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { uploadPublicImage, InvalidImageError } from "@/lib/public-image-upload";

// Uploads a single choice image and returns its URL for the admin UI to
// hold in local state and attach to a choice before saving the whole
// customization-options array via PATCH .../customization-options. Kept as
// its own request (not folded into that PATCH) because choices are added
// one at a time in the nested field/choice editor (piece 4), same reason
// product-image deletes are their own endpoint rather than a side effect
// of the product PATCH.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing image file" }, { status: 400 });
  }

  try {
    const url = await uploadPublicImage(file, "customization-choices");
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    if (err instanceof InvalidImageError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(`[admin/products] Choice image upload failed for product ${id}:`, err);
    return NextResponse.json(
      { error: "Upload failed, please try again" },
      { status: 500 }
    );
  }
}
