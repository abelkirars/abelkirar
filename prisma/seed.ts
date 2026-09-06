import { config } from "dotenv";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ProductCustomizationOptions } from "../src/types/customization";

// Load environment variables
config({ path: ".env.local" });

function asJson(value: ProductCustomizationOptions): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

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

async function main() {
  try {
    console.log("[SEED] Starting seed process...");
    
    // Clear existing products
    console.log("[SEED] Deleting existing products...");
    const deletedCount = await prisma.product.deleteMany();
    console.log(`[SEED] Deleted ${deletedCount.count} existing products`);

    console.log("[SEED] Creating new products...");
    const created = await prisma.product.createMany({
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
          category: "TSENATSL",
          description: "Tsenatsl — a shaken metal sistrum (idiophone) used in Ethiopian Orthodox church worship.",
          basePrice: 20000,
          images: [
            "https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/tsenatsl.png",
          ],
          customizationOptions: asJson(woodFinishOptions),
        },
        {
          slug: "mekwamiya",
          name: "Mekwamiya",
          category: "MEKWAMIYA",
          description: "Mekwamiya — a liturgical prayer and chanting staff used in Ethiopian Orthodox worship.",
          basePrice: 20000,
          images: [
            "https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/mekwamiya.png",
          ],
          customizationOptions: asJson(woodFinishOptions),
        },
        {
          slug: "pick-ups",
          name: "Pickups",
          category: "PICK_UPS",
          description: "Pickups - essential accessory for string instruments.",
          basePrice: 10000,
          images: [
            "https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/pick-ups.png",
          ],
          customizationOptions: asJson(woodFinishOptions),
        },
        {
          slug: "kaba",
          name: "Kaba",
          category: "KABA",
          description: "Kaba — traditional Ethiopian ceremonial clothing worn for special and religious occasions.",
          basePrice: 20000,
          images: [
            "https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/kaba.png",
          ],
          customizationOptions: asJson(woodFinishOptions),
        },
      ],
    });

    console.log(`[SEED] Created ${created} new products`);

    const count = await prisma.product.count();
    console.log(`[SEED] ✓ Successfully seeded database. Total products: ${count}`);
    console.log("[SEED] Listing all products:");
    
    const products = await prisma.product.findMany({
      orderBy: { createdAt: "asc" },
    });
    products.forEach((p) => {
      console.log(`  - ${p.slug}: ${p.name} ($${(p.basePrice / 100).toFixed(2)})`);
    });
  } catch (err) {
    console.error("[SEED] Error:", err);
    throw err;
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
