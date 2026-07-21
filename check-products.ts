import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "asc" },
  });

  console.log(`\nTotal products in database: ${products.length}\n`);
  products.forEach((p) => {
    console.log(`✓ ${p.slug}`);
    console.log(`  Name: ${p.name}`);
    console.log(`  Category: ${p.category}`);
    console.log(`  Price: $${(p.basePrice / 100).toFixed(2)}`);
    console.log(`  Images: ${(p.images as string[]).length > 0 ? "Yes" : "No"}`);
    console.log();
  });

  await prisma.$disconnect();
}

main().catch(console.error);
