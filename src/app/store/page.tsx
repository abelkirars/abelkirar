import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { readCatalog, productImages, PRODUCT_CATEGORIES } from "@/lib/catalog";
import { CatalogUnavailable } from "@/components/store/catalog-unavailable";
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
  isCustomMade: boolean;
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
        images: productImages(product.images),
        isCustomMade: product.isCustomMade,
      };
    }

    const basePrice = Math.min(...group.map((p) => p.basePrice));
    const withImage = group.find((p) => productImages(p.images).length > 0);
    const label = categoryLabel(category);

    return {
      key: category,
      href: `/store?category=${category}`,
      name: label,
      category,
      description: t("chooseOptions", { count: group.length, label }),
      basePrice,
      images: productImages(withImage?.images),
      isCustomMade: group.some((product) => product.isCustomMade),
    };
  });
}

export default async function StorePage({
  searchParams,
}: PageProps<"/store">) {
  const { category, q } = await searchParams;
  const searchQuery = typeof q === "string" && q.trim() ? q.trim() : undefined;
  // A search always searches the whole catalogue — category and search
  // never combine. If a URL somehow carries both (e.g. stale/manually
  // edited), search wins and category is dropped, not ANDed in, since an
  // AND made "browsing a category, then searching" silently return nothing
  // whenever the match lived outside that category.
  const categoryFilter =
    !searchQuery && typeof category === "string" && PRODUCT_CATEGORIES.some((value) => value === category) ? category : undefined;
  const t = await getTranslations("store");

  const { products, available } = await readCatalog({
      ...(searchQuery
        ? {
            OR: [
              { name: { contains: searchQuery, mode: "insensitive" as const } },
              { variantName: { contains: searchQuery, mode: "insensitive" as const } },
              { description: { contains: searchQuery, mode: "insensitive" as const } },
            ],
          }
        : categoryFilter
          ? { category: categoryFilter as never }
          : {}),
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
        images: productImages(product.images),
        isCustomMade: product.isCustomMade,
      }))
    : groupIntoCards(products, t);

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-[#241b12] to-[#1b140d] py-6 text-[#f3e9d2] sm:py-10">
        <CrossPattern className="text-[#d4a84b] opacity-[0.08]" />
        <Container className="relative">
          <p className="text-xs font-medium tracking-[0.2em] text-[#d4a84b] uppercase sm:text-sm">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 max-w-2xl font-heading text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#f3e9d2]/80 text-pretty sm:text-base">
            {t("description")}
          </p>
        </Container>
      </section>

      <section className="pt-6 pb-12 sm:pt-8 sm:pb-20">
        <Container>
          <div className="mx-auto mb-6 max-w-xl sm:mb-8">
            <form action="/store" role="search" className="flex items-center gap-2">
              <Input
                type="search"
                name="q"
                defaultValue={searchQuery ?? ""}
                placeholder={t("searchPlaceholder")}
                aria-label={t("searchLabel")}
                className="h-12 bg-card shadow-sm"
              />
              <Button
                type="submit"
                size="icon"
                className="size-11 shrink-0"
                aria-label={t("searchLabel")}
              >
                <Search aria-hidden="true" className="size-4" />
              </Button>
            </form>
            {searchQuery && (
              <Link href="/store" className="mt-2 inline-block text-sm text-muted-foreground hover:underline">
                {t("clearSearch")}
              </Link>
            )}
          </div>

          {!available ? <CatalogUnavailable /> : cards.length === 0 ? (
            <p className="text-center text-muted-foreground">
              {searchQuery ? t("noResults", { query: searchQuery }) : t("empty")}
            </p>
          ) : (
            <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((card) => (
                <ProductCard
                  key={card.key}
                  href={card.href}
                  name={card.name}
                  category={card.category}
                  description={card.description}
                  basePrice={card.basePrice}
                  images={card.images}
                  isCustomMade={card.isCustomMade}
                />
              ))}
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
