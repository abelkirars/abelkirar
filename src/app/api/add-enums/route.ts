import { prisma } from "@/lib/db";

export async function GET() {
  try {
    // Add new enum values to ProductCategory
    await prisma.$executeRawUnsafe(`
      ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'TSENATSL';
      ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'MEKWAMIYA';
      ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'PICK_UPS';
      ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'KABA';
    `);

    return Response.json({
      success: true,
      message: "Updated ProductCategory enum in database",
    });
  } catch (error: any) {
    console.error("[ADD-ENUMS] Error:", error?.message);
    return Response.json(
      {
        success: false,
        error: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
