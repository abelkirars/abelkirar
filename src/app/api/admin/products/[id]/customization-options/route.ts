import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/admin/dal";
import { customizationOptionsSchema } from "@/lib/validations/customization-options";
import { deletePublicImage } from "@/lib/public-image-upload";
import type { ProductCustomizationOptions } from "@/types/customization";

function collectImageUrls(fields: ProductCustomizationOptions): Set<string> {
  const urls = new Set<string>();
  for (const field of fields) {
    for (const choice of field.choices ?? []) {
      if (choice.imageUrl) urls.add(choice.imageUrl);
    }
  }
  return urls;
}

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

  const parsed = customizationOptionsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const product = await prisma.product.update({
    where: { id },
    data: { customizationOptions: parsed.data },
  });

  // Whole-array replace: any choice image referenced by the OLD options but
  // not the NEW ones is now orphaned in Storage. Clean up AFTER the DB
  // write succeeds — the write is what matters; a failed cleanup just
  // leaves a harmless orphaned file, logged, never surfaced to the admin.
  const oldUrls = collectImageUrls(
    (existing.customizationOptions ?? []) as unknown as ProductCustomizationOptions
  );
  const newUrls = collectImageUrls(parsed.data as ProductCustomizationOptions);
  const orphaned = [...oldUrls].filter((url) => !newUrls.has(url));
  if (orphaned.length > 0) {
    await Promise.all(
      orphaned.map((url) =>
        deletePublicImage(url).catch((err) =>
          console.error(
            `[admin/products] Failed to delete orphaned choice image for product ${id}:`,
            err
          )
        )
      )
    );
  }

  return NextResponse.json({ ok: true, product });
}
