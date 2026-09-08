import { prisma } from "@/lib/db";
import { correctProductCopy } from "@/lib/product-copy";
import type { Prisma } from "@prisma/client";

export const PRODUCT_CATEGORIES = ["KIRAR", "BEGENA", "MESENKO", "TSENATSL", "MEKWAMIYA", "PICK_UPS", "KABA", "OTHER"] as const;

export function productImages(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string =>
    typeof item === "string" && (item.startsWith("/products-to-upload/") || /^https:\/\//.test(item))) : [];
}

export async function readCatalog(where: Prisma.ProductWhereInput = {}, take?: number) {
  try {
    const products = await prisma.product.findMany({
      where: { ...where, isActive: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...(take ? { take } : {}),
    });
    return { available: true as const, products: products.map(correctProductCopy) };
  } catch (error) {
    console.error("[catalog] Product query failed", { code: (error as { code?: string })?.code ?? "unknown" });
    return { available: false as const, products: [] };
  }
}
