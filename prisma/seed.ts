import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ProductCustomizationOptions } from "../src/types/customization";

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
  await prisma.product.createMany({
    data: [
      {
        slug: "heritage-kirar",
        name: "Heritage Kirar",
        category: "KIRAR",
        description:
          "A handcrafted six-string Kirar built for church and home worship, tuned to the traditional Ethiopian scale system and finished by hand.",
        basePrice: 42000,
        images: [], // TODO: add real product photography
        customizationOptions: asJson(woodFinishOptions),
      },
      {
        slug: "processional-begena",
        name: "Processional Begena",
        category: "BEGENA",
        description:
          "A ten-string Begena in the classic large-lyre form, carrying the deep, meditative tone used in Orthodox devotional music.",
        basePrice: 68000,
        images: [], // TODO: add real product photography
        customizationOptions: asJson(woodFinishOptions),
      },
      {
        slug: "travelers-masenqo",
        name: "Traveler's Masenqo",
        category: "MESENKO",
        description:
          "A single-string bowed Masenqo, compact and durable, built for musicians who travel between congregations and communities.",
        basePrice: 26000,
        images: [], // TODO: add real product photography
        customizationOptions: asJson(woodFinishOptions),
      },
    ],
    skipDuplicates: true,
  });

  console.log("Seeded products.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
