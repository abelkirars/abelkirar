import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { ProductGallery } from "@/components/store/product-gallery";
import { CustomizationForm } from "@/components/store/customization-form";
import { CustomOrderNotice } from "@/components/store/custom-order-notice";
import type { ProductCustomizationOptions } from "@/types/customization";

export const dynamic = "force-dynamic";

async function getProduct(slug: string) {
  return prisma.product.findUnique({ where: { slug, isActive: true } });
}

export async function generateMetadata({
  params,
}: PageProps<"/store/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return {};
  return { title: product.name, description: product.description };
}

export default async function ProductDetailPage({
  params,
}: PageProps<"/store/[slug]">) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  return (
    <section className="py-16 sm:py-20">
      <Container className="grid gap-12 lg:grid-cols-2">
        <ProductGallery
          images={product.images as string[]}
          category={product.category}
          name={product.name}
          className="aspect-4/5"
        />

        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            {product.name}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            {product.description}
          </p>

          <div className="mt-8">
            <CustomizationForm
              product={{
                id: product.id,
                slug: product.slug,
                name: product.name,
                basePrice: product.basePrice,
                images: product.images as string[],
                customizationOptions:
                  product.customizationOptions as unknown as ProductCustomizationOptions,
              }}
            />
          </div>

          {product.isCustomMade && <CustomOrderNotice productId={product.id} />}
        </div>
      </Container>
    </section>
  );
}
