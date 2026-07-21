import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { CrossPattern } from "@/components/marketing/cross-pattern";
import { ProductCard } from "@/components/store/product-card";
import { categoryLabel } from "@/lib/category-gradients";
import type { Product } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Store",
  description:
    "Handmade Kirar, Begena, and Masenqo, customizable in shape, finish, and size — shipped to the US, UK, and Europe.",
};

type ProductCardData = {
  key: string;
  href: string;
  name: string;
  category: string;
  description: string;
  basePrice: number;
  images: string[];
};

// When browsing the full store (no category filter), categories with more
// than one product collapse into a single card that links to the filtered
// view — that filtered view is what lets a customer choose between options
// like the three Kirar builds instead of landing straight on a checkout page.
function groupIntoCards(products: Product[]): ProductCardData[] {
  const byCategory = new Map<string, Product[]>();
  for (const product of products) {
    const group = byCategory.get(product.category) ?? [];
    group.push(product);
    byCategory.set(product.category, group);
  }

  return Array.from(byCategory.entries()).map(([category, group]) => {
    if (group.length === 1) {
      const product = group[0];
      return {
        key: product.id,
        href: `/store/${product.slug}`,
        name: product.name,
        category: product.category,
        description: product.description,
        basePrice: product.basePrice,
        images: product.images as string[],
      };
    }

    const basePrice = Math.min(...group.map((p) => p.basePrice));
    const withImage = group.find((p) => (p.images as string[]).length > 0);
    const label = categoryLabel(category);

    return {
      key: category,
      href: `/store?category=${category}`,
      name: label,
      category,
      description: `Choose from ${group.length} ${label} options, each handcrafted and customizable.`,
      basePrice,
      images: (withImage?.images as string[]) ?? [],
    };
  });
}

export default async function StorePage({
  searchParams,
}: PageProps<"/store">) {
  const { category } = await searchParams;
  const categoryFilter = typeof category === "string" ? category : undefined;

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(categoryFilter ? { category: categoryFilter as never } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const cards: ProductCardData[] = categoryFilter
    ? products.map((product) => ({
        key: product.id,
        href: `/store/${product.slug}`,
        name: product.name,
        category: product.category,
        description: product.description,
        basePrice: product.basePrice,
        images: product.images as string[],
      }))
    : groupIntoCards(products);

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-[#241b12] to-[#1b140d] py-24 text-[#f3e9d2] sm:py-32">
        <CrossPattern className="text-[#d4a84b] opacity-[0.08]" />
        <Container className="relative">
          <p className="text-sm font-medium tracking-[0.25em] text-[#d4a84b] uppercase">
            The Store
          </p>
          <h1 className="mt-4 max-w-2xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Handmade instruments, built for worship
          </h1>
          <p className="mt-6 max-w-xl text-lg text-[#f3e9d2]/80 text-pretty">
            Every instrument is made to order and customizable in shape,
            finish, and size. We ship to the United States, United Kingdom,
            and Europe.
          </p>
        </Container>
      </section>

      <section className="py-20 sm:py-28">
        <Container>
          {cards.length === 0 ? (
            <p className="text-center text-muted-foreground">
              New instruments are being added soon — check back shortly.
            </p>
          ) : (
            <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((card) => (
                <ProductCard
                  key={card.key}
                  href={card.href}
                  name={card.name}
                  category={card.category}
                  description={card.description}
                  basePrice={card.basePrice}
                  images={card.images}
                />
              ))}
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
