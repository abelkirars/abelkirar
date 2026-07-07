import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

dotenv.config({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // Used by the CLI (migrate/introspect); needs the direct (non-pooled)
  // connection. The running app connects via the pooled URL through the
  // driver adapter in src/lib/db.ts instead.
  datasource: {
    url: env("DIRECT_URL"),
  },
});
