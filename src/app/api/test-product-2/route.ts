import { prisma } from "@/lib/db";

export async function GET() {
  try {
    // Try with string literal to bypass type checking
    const product = await prisma.product.create({
      data: {
        slug: "test-tsenatsl-2",
        name: "Test Tsenatsl 2",
        category: "TSENATSL" as any,  // Force bypass type checking
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
    console.error("[TEST2] Error:", error?.message, error?.code);
    return Response.json(
      {
        success: false,
        error: error?.message || String(error),
        code: error?.code,
        details: error?.meta,
      },
      { status: 500 }
    );
  }
}
