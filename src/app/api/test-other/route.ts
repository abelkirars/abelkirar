import { prisma } from "@/lib/db";

export async function GET() {
  try {
    // Test with OTHER category which should exist
    const product = await prisma.product.create({
      data: {
        slug: "test-other",
        name: "Test Other",
        category: "OTHER",  // Use existing category
        description: "Test product",
        basePrice: 20000,
        images: ["https://via.placeholder.com/400"],
        customizationOptions: [],
      },
    });

    return Response.json({
      success: true,
      message: "Created test product with OTHER",
      product,
    });
  } catch (error: any) {
    console.error("[TEST-OTHER] Error:", error?.message);
    return Response.json(
      {
        success: false,
        error: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
