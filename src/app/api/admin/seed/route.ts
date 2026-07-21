import { prisma } from "@/lib/db";
import type { ProductCustomizationOptions } from "@/types/customization";
import type { Prisma } from "@prisma/client";

function asJson(value: ProductCustomizationOptions): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

const woodFinishOptions: ProductCustomizationOptions = [
  {
    id: "shape",
    label: "Shape",
    type: "select",
    required: true,
    choices: [
      { id: "traditional-bowl", label: "Traditional Bowl", priceModifier: 0 },
      { id: "modern-flat", label: "Modern Flat-Back", priceModifier: 3000 },
    ],
  },
  {
    id: "finish",
    label: "Wood Finish",
    type: "swatch",
    required: true,
    choices: [
      { id: "natural", label: "Natural Sycamore", priceModifier: 0, hex: "#c9a06b" },
      { id: "walnut", label: "Dark Walnut", priceModifier: 2000, hex: "#5b3a29" },
      { id: "ebony", label: "Ebony Black", priceModifier: 4000, hex: "#1a1512" },
    ],
  },
  {
    id: "size",
    label: "Size",
    type: "select",
    required: true,
    choices: [
      { id: "standard", label: "Standard (adult)", priceModifier: 0 },
      { id: "compact", label: "Compact (youth/travel)", priceModifier: -1500 },
    ],
  },
  {
    id: "engraving",
    label: "Custom Engraving (optional)",
    type: "text",
    required: false,
    maxLength: 40,
    helpText: "e.g. your name or a short blessing, engraved on the soundboard",
  },
];

export async function POST() {
  try {
    // Delete existing products
    const deleted = await prisma.product.deleteMany();
    console.log(`Deleted ${deleted.count} products`);

    // Create all 7 products
    const products = await prisma.product.createMany({
      data: [
        {
          slug: "normal-kirar",
          name: "Normal Kirar",
          category: "KIRAR",
          description:
            "A handcrafted six-string Kirar built for church and home worship, tuned to the traditional Ethiopian scale system and finished by hand.",
          basePrice: 42000,
          images: [
            "https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/kirar.png.PNG",
          ],
          customizationOptions: asJson(woodFinishOptions),
        },
        {
          slug: "desalegn-kirar",
          name: "Desalegn Kirar",
          category: "KIRAR",
          description:
            "A Kirar handcrafted to Desalegn's signature specifications, tuned to the traditional Ethiopian scale system and finished by hand.",
          basePrice: 42000,
          images: [
            "https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/kirar-desaleg.png",
          ],
          customizationOptions: asJson(woodFinishOptions),
        },
        {
          slug: "gash-tesfay-kirar",
          name: "Gash Tesfay Kirar",
          category: "KIRAR",
          description:
            "A Kirar handcrafted to Gash Tesfay's signature specifications, tuned to the traditional Ethiopian scale system and finished by hand.",
          basePrice: 42000,
          images: [
            "https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/gash%20tesfay%20kirar.png.PNG",
          ],
          customizationOptions: asJson(woodFinishOptions),
        },
        {
          slug: "processional-begena",
          name: "Processional Begena",
          category: "BEGENA",
          description:
            "A ten-string Begena in the classic large-lyre form, carrying the deep, meditative tone used in Orthodox devotional music.",
          basePrice: 68000,
          images: [
            "https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/begena.png",
          ],
          customizationOptions: asJson(woodFinishOptions),
        },
        {
          slug: "travelers-masenqo",
          name: "Traveler's Masenqo",
          category: "MESENKO",
          description:
            "A single-string bowed Masenqo, compact and durable, built for musicians who travel between congregations and communities.",
          basePrice: 26000,
          images: [
            "https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/masenqo.png",
          ],
          customizationOptions: asJson(woodFinishOptions),
        },
        {
          slug: "tsenatsl",
          name: "Tsenatsl",
          category: "OTHER",  // Using OTHER temporarily
          description: "Tsenatsl - traditional Ethiopian percussion instrument.",
          basePrice: 20000,
          images: [
            "https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/tsenatsl.png",
          ],
          customizationOptions: asJson(woodFinishOptions),
        },
        {
          slug: "mekwamiya",
          name: "Mekwamiya",
          category: "OTHER",  // Using OTHER temporarily
          description: "Mekwamiya - spiritual Ethiopian wind instrument.",
          basePrice: 20000,
          images: [
            "https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/mekwamiya.png",
          ],
          customizationOptions: asJson(woodFinishOptions),
        },
        {
          slug: "pick-ups",
          name: "Pick Ups",
          category: "OTHER",  // Using OTHER temporarily
          description: "Pick Ups - essential accessory for string instruments.",
          basePrice: 10000,
          images: [
            "https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/pick-ups.png",
          ],
          customizationOptions: asJson(woodFinishOptions),
        },
        {
          slug: "kaba",
          name: "Kaba",
          category: "OTHER",  // Using OTHER temporarily
          description: "Kaba - traditional Ethiopian drum instrument.",
          basePrice: 20000,
          images: [
            "https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/kaba.png",
          ],
          customizationOptions: asJson(woodFinishOptions),
        },
      ],
    });

    const total = await prisma.product.count();

    return Response.json({
      success: true,
      message: `Created products. Total now: ${total}`,
      deleted: deleted.count,
      created: products.count,
      total,
    });
  } catch (error) {
    console.error("[SEED API] Error:", error);
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      select: { slug: true, name: true, category: true, basePrice: true },
      orderBy: { createdAt: "asc" },
    });

    return Response.json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
