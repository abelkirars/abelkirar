import { prisma } from "@/lib/db";

export async function GET() {
  try {
    // Try to create just one new product
    const product = await prisma.product.create({
      data: {
        slug: "test-tsenatsl",
        name: "Test Tsenatsl",
        category: "TSENATSL",
        description: "Test product",
        basePrice: 20000,
        images: ["https://via.placeholder.com/400"],
        customizationOptions: [],
      },
    });

    return Response.json({
      success: true,
      message: "Created test product",
      product,
    });
  } catch (error: any) {
    console.error("[TEST] Error:", error?.message);
    return Response.json(
      {
        success: false,
        error: error?.message || String(error),
        code: error?.code,
      },
      { status: 500 }
    );
  }
}
