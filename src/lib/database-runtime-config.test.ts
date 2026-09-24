import { afterEach, describe, expect, it, vi } from "vitest";
import { X509Certificate } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";

vi.mock("server-only", () => ({}));

const captured = vi.hoisted(() => ({ pools: [] as Record<string, unknown>[], adapters: [] as Record<string, unknown>[] }));
vi.mock("pg", () => ({
  Pool: class {
    constructor(config: Record<string, unknown>) {
      captured.pools.push(config);
    }
    on() {
      return this;
    }
  },
}));
vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {
    constructor(config: Record<string, unknown>) {
      captured.adapters.push(config);
    }
  },
}));
vi.mock("@prisma/client", () => ({ PrismaClient: class {} }));

const now = new Date();
const CA = tls.rootCertificates.find((pem) => {
  const certificate = new X509Certificate(pem);
  return certificate.ca && new Date(certificate.validFrom) < now && new Date(certificate.validTo) > now;
})!;
const REMOTE_WITH_HOSTILE_SSL = "postgresql://postgres.ref:pw@pooler.example.com:6543/postgres?pgbouncer=true&sslmode=no-verify&sslrootcert=certs%2Fprod-ca-2021.crt";
const trusted = { ca: `${CA.trim()}\n`, rejectUnauthorized: true };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  captured.pools.length = 0;
  captured.adapters.length = 0;
  delete (globalThis as { prisma?: unknown }).prisma;
});

describe("application pools", () => {
  it("both runtime pools use the same server-only CA trust with verification enabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", REMOTE_WITH_HOSTILE_SSL);
    vi.stubEnv("DATABASE_CA_CERT", CA);

    await import("./db");
    await import("./site-copy-reader");

    expect(captured.adapters).toHaveLength(1);
    expect(captured.pools).toHaveLength(1);
    for (const config of [captured.adapters[0], captured.pools[0]]) {
      expect(config.ssl).toEqual(trusted);
      expect(config.connectionString).not.toMatch(/sslmode|sslrootcert/);
      expect(config.connectionString).toContain("pgbouncer=true");
    }
    // Pool tuning is preserved alongside the trust settings.
    expect(captured.adapters[0]).toMatchObject({ max: 3, statement_timeout: 8000 });
    expect(captured.pools[0]).toMatchObject({ max: 1, statement_timeout: 200 });
  });

  it.each([
    ["db", () => import("./db")],
    ["site-copy-reader", () => import("./site-copy-reader")],
  ])("%s refuses to start in production without a CA", async (_name, load) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", REMOTE_WITH_HOSTILE_SSL);
    vi.stubEnv("DATABASE_CA_CERT", "");
    await expect(load()).rejects.toThrow(/DATABASE_CA_CERT is required in production/);
    expect([...captured.adapters, ...captured.pools]).toHaveLength(0);
  });

  it("a caller cannot override the trust settings", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", REMOTE_WITH_HOSTILE_SSL);
    vi.stubEnv("DATABASE_CA_CERT", CA);
    const { databasePoolConfig } = await import("./database-runtime-config");
    const hostile = { max: 1, ssl: { rejectUnauthorized: false }, connectionString: "postgresql://elsewhere" } as Parameters<typeof databasePoolConfig>[0];
    const config = databasePoolConfig(hostile);
    expect(config.ssl).toEqual(trusted);
    expect(config.connectionString).toContain("pooler.example.com");
  });
});

// ---------------------------------------------------------------------------
// Static guards: no forgotten pool, no bypass, no browser exposure.
// ---------------------------------------------------------------------------
const root = path.resolve(__dirname, "../..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "remotion", "migrations", "tests", "generated", ".claude", ".agents", ".codex", "certs"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) sourceFiles(path.join(dir, entry.name), out);
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const rootFiles = fs.readdirSync(root).filter((name) => /\.(ts|mjs|js)$/.test(name)).map((name) => path.join(root, name));
const files = [...rootFiles, ...["src", "scripts", "prisma"].flatMap((dir) => sourceFiles(path.join(root, dir)))];
const relative = (file: string) => path.relative(root, file).split(path.sep).join("/");
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("static trust guards", () => {
  it("every pg / adapter pool outside loopback-only tests is built through the trust helper", () => {
    const constructing = files.filter((file) => /new (Pool|Client|PrismaPg)\(/.test(fs.readFileSync(file, "utf8")));
    expect(constructing.map(relative)).toEqual(expect.arrayContaining([
      "src/lib/db.ts",
      "src/lib/site-copy-reader.ts",
      "prisma/seed.ts",
      "scripts/create-admin.ts",
      "scripts/change-admin-password.ts",
      "check-products.ts",
    ]));
    for (const file of constructing) {
      const text = fs.readFileSync(file, "utf8");
      const all = text.match(/new (Pool|Client|PrismaPg)\(/g) ?? [];
      const wrapped = text.match(/new (Pool|Client|PrismaPg)\((databasePoolConfig|runtimePoolConfig)\(/g) ?? [];
      expect({ file: relative(file), unwrapped: all.length - wrapped.length }).toEqual({ file: relative(file), unwrapped: 0 });
    }
  });

  it("the Prisma CLI datasource is built through the trust helper", () => {
    expect(fs.readFileSync(path.join(root, "prisma.config.ts"), "utf8")).toMatch(/url:\s*prismaCliDatasourceUrl\(env\("DIRECT_URL"\)\)/);
  });

  it("no source disables certificate verification", () => {
    for (const file of files) {
      const code = withoutComments(fs.readFileSync(file, "utf8"));
      expect({ file: relative(file), bypass: /rejectUnauthorized:\s*false|NODE_TLS_REJECT_UNAUTHORIZED|no-verify|accept_invalid_certs/.test(code) })
        .toEqual({ file: relative(file), bypass: false });
    }
  });

  it("the runtime entry point is server-only", () => {
    expect(fs.readFileSync(path.join(__dirname, "database-runtime-config.ts"), "utf8")).toMatch(/^import "server-only";/);
  });

  it("no CA configuration can reach a browser bundle", () => {
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      expect(text).not.toMatch(/NEXT_PUBLIC_[A-Z_]*CA_CERT/);
      if (/^\s*["']use client["']/.test(text)) {
        expect({ file: relative(file), imports: /database-tls|database-runtime-config|@\/lib\/db["']/.test(text) })
          .toEqual({ file: relative(file), imports: false });
      }
    }
    expect(fs.readFileSync(path.join(root, "next.config.ts"), "utf8")).not.toMatch(/DATABASE_CA_CERT/);
  });
});
