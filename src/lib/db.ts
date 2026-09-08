import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  // Bound pool growth and failures in serverless instances. A database outage
  // must not hold page requests open for the platform's full timeout.
  max: 3,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
  statement_timeout: 8000,
});

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
