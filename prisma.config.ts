import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";
import { prismaCliDatasourceUrl } from "./src/lib/database-tls";

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
  // TLS trust is applied here, not taken from the URL: verified against
  // DATABASE_CA_CERT (materialized to a private temp file for the schema
  // engine), with sslaccept=strict always explicit. See database-tls.ts.
  datasource: {
    url: prismaCliDatasourceUrl(env("DIRECT_URL")),
  },
});
