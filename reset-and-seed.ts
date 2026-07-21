import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Clearing all products from database...");
  const deleted = await prisma.product.deleteMany();
  console.log(`✓ Deleted ${deleted.count} products`);
  
  console.log("\nRunning seed...");
  // Import and run the seed
  const seedModule = await import("./prisma/seed.ts");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
