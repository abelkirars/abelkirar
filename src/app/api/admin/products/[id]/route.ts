import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { productSchema } from "@/lib/validations/product";
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
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const formData = await request.formData();

  // Toggle-publish calls only send `published`, so other fields fall back to
  // the existing row instead of failing validation on missing name/price.
  const parsed = productSchema.safeParse({
    name: formData.get("name") ?? existing.name,
    variantName: formData.get("variantName") ?? existing.variantName ?? undefined,
    description: formData.get("description") ?? existing.description,
    category: formData.get("category") ?? existing.category,
    price: formData.get("price") ?? existing.basePrice / 100,
    published: formData.has("published") ? formData.get("published") : existing.isActive,
    isCustomMade: formData.has("isCustomMade") ? formData.get("isCustomMade") : existing.isCustomMade,
    customMadeDetails: formData.get("customMadeDetails") ?? existing.customMadeDetails ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const existingImages = existing.images as string[];
  const newFiles = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0);

  let images = existingImages;
  if (newFiles.length > 0) {
    const uploaded: string[] = [];
    try {
      for (const file of newFiles) {
        uploaded.push(await uploadPublicImage(file, "products"));
      }
    } catch (err) {
      if (err instanceof InvalidImageError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
    await Promise.all(existingImages.map(deletePublicImage));
    images = uploaded;
  }

  const customMadeImage = formData.get("customMadeImage");
  let customMadeImageUrl = existing.customMadeImageUrl;
  if (customMadeImage instanceof File && customMadeImage.size > 0) {
    try {
      customMadeImageUrl = await uploadPublicImage(customMadeImage, "custom-made");
    } catch (err) {
      if (err instanceof InvalidImageError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
    if (existing.customMadeImageUrl) await deletePublicImage(existing.customMadeImageUrl);
  }

  const {
    name,
    variantName,
    description,
    category,
    price,
    published,
    isCustomMade,
    customMadeDetails,
  } = parsed.data;
  const product = await prisma.product.update({
    where: { id },
    data: {
      name,
      variantName: variantName || null,
      description,
      category,
      basePrice: Math.round(price * 100),
      images,
      isActive: published,
      isCustomMade,
      customMadeDetails: customMadeDetails || null,
      customMadeImageUrl,
    },
  });

  return NextResponse.json({ ok: true, product });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  try {
    await prisma.product.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json(
        { error: "Can't delete a product that has existing orders. Unpublish it instead." },
        { status: 409 }
      );
    }
    throw err;
  }
  await Promise.all((existing.images as string[]).map(deletePublicImage));
  if (existing.customMadeImageUrl) await deletePublicImage(existing.customMadeImageUrl);

  return NextResponse.json({ ok: true });
}
