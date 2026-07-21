import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { images } = await request.json();

    // Update the three original products with new image URLs
    const updates = [
      {
        slug: "heritage-kirar",
        imageUrl: images.kirar,
      },
      {
        slug: "processional-begena",
        imageUrl: images.begena,
      },
      {
        slug: "travelers-masenqo",
        imageUrl: images.masenqo,
      },
    ];

    const results = [];
    for (const update of updates) {
      const product = await prisma.product.update({
        where: { slug: update.slug },
        data: {
          images: [update.imageUrl],
        },
      });
      results.push(product);
    }

    return Response.json({
      success: true,
      message: "Updated 3 products with new images",
      products: results,
    });
  } catch (error) {
    console.error("Update error:", error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
