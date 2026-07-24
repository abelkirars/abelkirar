import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { productSchema } from "@/lib/validations/product";
import { uploadPublicImage, InvalidImageError } from "@/lib/public-image-upload";
import { uniqueProductSlug } from "@/lib/slug";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("response" in auth) return auth.response;

  const formData = await request.formData();
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    variantName: formData.get("variantName") || undefined,
    description: formData.get("description"),
    category: formData.get("category"),
    price: formData.get("price"),
    published: formData.get("published"),
    isCustomMade: formData.get("isCustomMade"),
    customMadeDetails: formData.get("customMadeDetails") || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  const images: string[] = [];
  const customMadeImage = formData.get("customMadeImage");
  let customMadeImageUrl: string | undefined;
  try {
    for (const file of files) {
      images.push(await uploadPublicImage(file, "products"));
    }
    if (customMadeImage instanceof File && customMadeImage.size > 0) {
      customMadeImageUrl = await uploadPublicImage(customMadeImage, "custom-made");
    }
  } catch (err) {
    if (err instanceof InvalidImageError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
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
  const slug = await uniqueProductSlug(variantName ? `${name}-${variantName}` : name);

  const product = await prisma.product.create({
    data: {
      slug,
      name,
      variantName: variantName || null,
      description,
      category,
      basePrice: Math.round(price * 100),
      images,
      customizationOptions: [],
      isActive: published,
      isCustomMade,
      customMadeDetails: customMadeDetails || null,
      customMadeImageUrl: customMadeImageUrl ?? null,
    },
  });

  return NextResponse.json({ ok: true, product });
}
