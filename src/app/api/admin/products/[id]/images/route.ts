import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { deletePublicImage } from "@/lib/public-image-upload";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const url = new URL(request.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url query parameter" }, { status: 400 });
  }

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const existingImages = existing.images as string[];
  if (!existingImages.includes(url)) {
    return NextResponse.json({ error: "Image not found on this product" }, { status: 404 });
  }

  const images = existingImages.filter((image) => image !== url);
  const product = await prisma.product.update({
    where: { id },
    data: { images },
  });

  // Storage delete happens AFTER the DB write, deliberately: if this part
  // fails, the DB is already correct (the product no longer references
  // the image) — the only consequence is a harmless orphaned file in
  // Storage, logged, not a correctness problem the admin sees.
  try {
    await deletePublicImage(url);
  } catch (err) {
    console.error(
      `[admin/products] Failed to delete image from storage for product ${id}:`,
      err
    );
  }

  return NextResponse.json({ ok: true, product });
}
