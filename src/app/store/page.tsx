import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { CrossPattern } from "@/components/marketing/cross-pattern";
import { ProductCard } from "@/components/store/product-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
function groupIntoCards(
  products: Product[],
  t: Awaited<ReturnType<typeof getTranslations<"store">>>
): ProductCardData[] {
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
      description: t("chooseOptions", { count: group.length, label }),
      basePrice,
      images: (withImage?.images as string[]) ?? [],
    };
  });
}

export default async function StorePage({
  searchParams,
}: PageProps<"/store">) {
  const { category, q } = await searchParams;
  const categoryFilter = typeof category === "string" ? category : undefined;
  const searchQuery = typeof q === "string" && q.trim() ? q.trim() : undefined;
  const t = await getTranslations("store");

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(categoryFilter ? { category: categoryFilter as never } : {}),
      ...(searchQuery
        ? {
            OR: [
              { name: { contains: searchQuery, mode: "insensitive" as const } },
              { variantName: { contains: searchQuery, mode: "insensitive" as const } },
              { description: { contains: searchQuery, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  // Grouping only applies to the default, unfiltered browse view — any
  // active filter (category or search) shows individual products. Decided:
  // a search must surface the specific matching product, never a grouped
  // "N options" card that hides the thing someone searched for.
  const cards: ProductCardData[] = categoryFilter || searchQuery
    ? products.map((product) => ({
        key: product.id,
        href: `/store/${product.slug}`,
        name: product.name,
        category: product.category,
        description: product.description,
        basePrice: product.basePrice,
        images: product.images as string[],
      }))
    : groupIntoCards(products, t);

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-[#241b12] to-[#1b140d] py-24 text-[#f3e9d2] sm:py-32">
        <CrossPattern className="text-[#d4a84b] opacity-[0.08]" />
        <Container className="relative">
          <p className="text-sm font-medium tracking-[0.25em] text-[#d4a84b] uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 max-w-2xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-[#f3e9d2]/80 text-pretty">
            {t("description")}
          </p>
        </Container>
      </section>

      <section className="py-20 sm:py-28">
        <Container>
          <div className="mx-auto mb-12 max-w-md">
            <form action="/store" className="flex items-center gap-2">
              {categoryFilter && (
                <input type="hidden" name="category" value={categoryFilter} />
              )}
              <Input
                type="search"
                name="q"
                defaultValue={searchQuery ?? ""}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchLabel")}
              />
              <Button type="submit" size="icon" aria-label={t("searchLabel")}>
                <Search className="size-4" />
              </Button>
            </form>
            {searchQuery && (
              <Link
                href={categoryFilter ? `/store?category=${categoryFilter}` : "/store"}
                className="mt-2 inline-block text-sm text-muted-foreground hover:underline"
              >
                {t("clearSearch")}
              </Link>
            )}
          </div>

          {cards.length === 0 ? (
            <p className="text-center text-muted-foreground">
              {searchQuery ? t("noResults", { query: searchQuery }) : t("empty")}
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
