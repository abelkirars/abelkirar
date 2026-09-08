import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { cache } from "react";
import { correctProductCopy } from "@/lib/product-copy";
import { productImages } from "@/lib/catalog";
import { CatalogUnavailable } from "@/components/store/catalog-unavailable";
import { Container } from "@/components/marketing/container";
import { ProductDisplay } from "@/components/store/product-display";
import type { ProductCustomizationOptions } from "@/types/customization";

export const dynamic = "force-dynamic";

const getProduct = cache(async (slug: string) => {
  try {
    const product = await prisma.product.findUnique({ where: { slug, isActive: true } });
    return { available: true, product: product ? correctProductCopy(product) : null };
  } catch {
    console.error("[catalog] Product detail query failed");
    return { available: false, product: null };
  }
});

export async function generateMetadata({
  params,
}: PageProps<"/store/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { product } = await getProduct(slug);
  if (!product) return {};
  return { title: product.name, description: product.description };
}

export default async function ProductDetailPage({
  params,
}: PageProps<"/store/[slug]">) {
  const { slug } = await params;
  const { product, available } = await getProduct(slug);
  if (!available) return <section className="px-4 py-16"><CatalogUnavailable /></section>;
  if (!product) notFound();

  return (
    <section className="py-16 sm:py-20">
      <Container className="grid gap-12 lg:grid-cols-2">
        <ProductDisplay
          product={{
            id: product.id,
            slug: product.slug,
            name: product.name,
            basePrice: product.basePrice,
            category: product.category,
            images: productImages(product.images),
            customizationOptions:
              product.customizationOptions as unknown as ProductCustomizationOptions,
            isCustomMade: product.isCustomMade,
          }}
          galleryClassName="aspect-4/5"
        >
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            {product.name}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            {product.description}
          </p>
        </ProductDisplay>
      </Container>
    </section>
  );
}
