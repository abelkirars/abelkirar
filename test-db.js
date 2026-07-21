require("dotenv").config({ path: ".env.local" });

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

async function test() {
  try {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter });
    
    const count = await prisma.product.count();
    console.log(`Total products in database: ${count}`);
    
    const products = await prisma.product.findMany({
      select: { id: true, slug: true, name: true },
    });
    
    console.log("\nProducts:");
    products.forEach(p => console.log(`- ${p.slug}: ${p.name}`));
    
    await prisma.$disconnect();
    process.exit(0);
  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  }
}

test();
