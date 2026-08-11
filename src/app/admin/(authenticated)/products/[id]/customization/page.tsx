import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { CustomizationOptionsEditor } from "@/components/admin/customization-options-editor";
import type { ProductCustomizationOptions } from "@/types/customization";

export const dynamic = "force-dynamic";

export default async function AdminProductCustomizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) notFound();

  return (
    <section className="py-10">
      <Container className="max-w-3xl">
        <Link href="/admin/products" className="text-sm text-muted-foreground hover:underline">
          ← Back to products
        </Link>

        <div className="mt-2">
          <h1 className="font-heading text-2xl font-semibold">
            Customization options
            {product.variantName
              ? ` — ${product.name} (${product.variantName})`
              : ` — ${product.name}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fields and choices customers pick from on this product&apos;s page. Saving replaces
            the whole set.
          </p>
        </div>

        <div className="mt-6">
          <CustomizationOptionsEditor
            productId={product.id}
            initialOptions={(product.customizationOptions as unknown as ProductCustomizationOptions) ?? []}
          />
        </div>
      </Container>
    </section>
  );
}
