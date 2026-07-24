import { prisma } from "@/lib/db";
import { Container } from "@/components/marketing/container";
import { ProductForm } from "@/components/admin/product-form";
import { ProductRow } from "@/components/admin/product-row";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <section className="py-10">
      <Container className="max-w-3xl">
        <h1 className="font-heading text-2xl font-semibold">Products</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Published products appear live in the store immediately.
        </p>

        <div className="mt-6 rounded-lg border border-border p-4">
          <h2 className="mb-4 font-medium">Add product</h2>
          <ProductForm />
        </div>

        <div className="mt-8 space-y-3">
          {products.map((product) => (
            <ProductRow key={product.id} product={product} />
          ))}
          {products.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">No products yet.</p>
          )}
        </div>
      </Container>
    </section>
  );
}
