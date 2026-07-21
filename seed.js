require("dotenv").config({ path: ".env.local" });

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const woodFinishOptions = [
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
    console.log("🌱 Starting seed...\n");

    console.log("🗑️  Clearing existing products...");
    const deletedCount = await prisma.product.deleteMany();
    console.log(`✓ Deleted ${deletedCount.count} products\n`);

    console.log("➕ Creating 7 new products...");
    await prisma.product.createMany({
      data: [
        {
          slug: "heritage-kirar",
          name: "Heritage Kirar",
          category: "KIRAR",
          description: "A handcrafted six-string Kirar built for church and home worship, tuned to the traditional Ethiopian scale system and finished by hand.",
          basePrice: 42000,
          images: [],
          customizationOptions: woodFinishOptions,
        },
        {
          slug: "processional-begena",
          name: "Processional Begena",
          category: "BEGENA",
          description: "A ten-string Begena in the classic large-lyre form, carrying the deep, meditative tone used in Orthodox devotional music.",
          basePrice: 68000,
          images: [],
          customizationOptions: woodFinishOptions,
        },
        {
          slug: "travelers-masenqo",
          name: "Traveler's Masenqo",
          category: "MESENKO",
          description: "A single-string bowed Masenqo, compact and durable, built for musicians who travel between congregations and communities.",
          basePrice: 26000,
          images: [],
          customizationOptions: woodFinishOptions,
        },
        {
          slug: "tsenatsl",
          name: "Tsenatsl",
          category: "TSENATSL",
          description: "Tsenatsl - traditional Ethiopian percussion instrument.",
          basePrice: 20000,
          images: ["https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/tsenatsl.png"],
          customizationOptions: woodFinishOptions,
        },
        {
          slug: "mekwamiya",
          name: "Mekwamiya",
          category: "MEKWAMIYA",
          description: "Mekwamiya - spiritual Ethiopian wind instrument.",
          basePrice: 20000,
          images: ["https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/mekwamiya.png"],
          customizationOptions: woodFinishOptions,
        },
        {
          slug: "pick-ups",
          name: "Pick Ups",
          category: "PICK_UPS",
          description: "Pick Ups - essential accessory for string instruments.",
          basePrice: 10000,
          images: ["https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/pick-ups.png"],
          customizationOptions: woodFinishOptions,
        },
        {
          slug: "kaba",
          name: "Kaba",
          category: "KABA",
          description: "Kaba - traditional Ethiopian drum instrument.",
          basePrice: 20000,
          images: ["https://ghscuszbdddxsxtxywdm.supabase.co/storage/v1/object/public/product-images/kaba.png"],
          customizationOptions: woodFinishOptions,
        },
      ],
    });

    const count = await prisma.product.count();
    console.log(`✓ Created ${count} products\n`);

    console.log("📦 Products in database:");
    const products = await prisma.product.findMany({
      orderBy: { createdAt: "asc" },
      select: { slug: true, name: true, category: true, basePrice: true },
    });

    products.forEach((p, i) => {
      const price = (p.basePrice / 100).toFixed(2);
      console.log(`   ${i + 1}. ${p.name} (${p.category}) - $${price}`);
    });

    console.log("\n✅ Seed completed successfully!");
  } catch (error) {
    console.error("\n❌ Seed failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
