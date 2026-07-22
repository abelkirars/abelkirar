import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/admin/password";

config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found?.slice(prefix.length);
}

async function main() {
  const username = arg("username");
  const password = arg("password");
  const displayName = arg("name");

  if (!username || !password || !displayName) {
    console.error(
      "Usage: npx tsx scripts/create-admin.ts --username=<username> --password=<password> --name=\"Display Name\""
    );
    process.exit(1);
  }

  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const admin = await prisma.admin.upsert({
    where: { username },
    update: { passwordHash, displayName, isActive: true },
    create: { username, passwordHash, displayName, isActive: true },
  });

  console.log(`Admin account ready: ${admin.username} (${admin.displayName})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
