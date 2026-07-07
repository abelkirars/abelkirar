import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { CrossPattern } from "@/components/marketing/cross-pattern";
import { ProductCard } from "@/components/store/product-card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Store",
  description:
    "Handmade Kirar, Begena, and Masenqo, customizable in shape, finish, and size — shipped to the US, UK, and Europe.",
};

export default async function StorePage({
  searchParams,
}: PageProps<"/store">) {
  const { category } = await searchParams;

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(typeof category === "string" ? { category: category as never } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

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
          {products.length === 0 ? (
            <p className="text-center text-muted-foreground">
              New instruments are being added soon — check back shortly.
            </p>
          ) : (
            <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  slug={product.slug}
                  name={product.name}
                  category={product.category}
                  description={product.description}
                  basePrice={product.basePrice}
                  images={product.images as string[]}
                />
              ))}
            </div>
          )}
        </Container>
      </section>
    </>
  );
}
