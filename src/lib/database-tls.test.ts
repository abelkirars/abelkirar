import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { X509Certificate } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import {
  DATABASE_CA_ENV,
  DatabaseTlsConfigError,
  LOCAL_CA_RELATIVE_PATH,
  isLoopbackDatabaseUrl,
  parseCaMaterial,
  prismaCliDatasourceUrl,
  removeMaterializedCaFiles,
  resolveDatabaseCa,
  runtimePoolConfig,
} from "./database-tls";

// node-postgres' own merge of connectionString over explicit config — the
// behaviour that must not be able to defeat explicit trust.
type PgParams = { ssl: unknown; user: string; password: string; host: string; port: number; database: string; application_name?: string; options?: string };
const ConnectionParameters = createRequire(import.meta.url)("pg/lib/connection-parameters") as new (config: object) => PgParams;

// Fixture CAs come from Node's bundled public roots at test time, so no
// certificate material is committed. They are real, currently valid CAs.
const now = new Date();
const validRoots = tls.rootCertificates.filter((pem) => {
  const certificate = new X509Certificate(pem);
  return certificate.ca && new Date(certificate.validFrom) < now && new Date(certificate.validTo) > now;
});
const CA = validRoots[0];
const OTHER_CA = validRoots[1];
const normalized = (...pems: string[]) => `${pems.map((pem) => pem.trim()).join("\n")}\n`;
const caFragment = () => CA.split("\n")[3]; // a line of base64 body, never allowed in errors

const REMOTE = "postgresql://postgres.ref:p%40ss@pooler.example.com:6543/postgres?pgbouncer=true&application_name=site&options=-c%20search_path%3Dpublic";
const prod = { NODE_ENV: "production", [DATABASE_CA_ENV]: CA };

const temps: string[] = [];
function tempDir(withLocalCa = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "db-tls-test-"));
  temps.push(dir);
  if (withLocalCa) {
    fs.mkdirSync(path.join(dir, "certs"));
    fs.writeFileSync(path.join(dir, LOCAL_CA_RELATIVE_PATH), OTHER_CA);
  }
  return dir;
}

function captureError(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected an error");
}

beforeAll(() => {
  expect(validRoots.length).toBeGreaterThan(1);
});

afterEach(() => {
  removeMaterializedCaFiles();
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("parseCaMaterial", () => {
  it("accepts PEM with real newlines, CRLF, literal \\n escapes, or base64 encoding", () => {
    expect(parseCaMaterial(CA, "T")).toBe(normalized(CA));
    expect(parseCaMaterial(CA.replace(/\n/g, "\r\n"), "T")).toBe(normalized(CA));
    expect(parseCaMaterial(CA.replace(/\n/g, "\\n"), "T")).toBe(normalized(CA));
    expect(parseCaMaterial(Buffer.from(CA).toString("base64"), "T")).toBe(normalized(CA));
  });

  it("accepts a bundle of CA certificates", () => {
    expect(parseCaMaterial(`${CA}\n${OTHER_CA}`, "T")).toBe(normalized(CA, OTHER_CA));
  });

  it.each([
    ["empty", "   ", /empty/],
    ["not a certificate", "definitely not a certificate!", /not a PEM certificate/],
    ["base64 of non-PEM", Buffer.from("hello").toString("base64"), /base64 content is not a PEM/],
    ["private key material", `${CA}\n-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----`, /private key/],
    ["trailing non-certificate content", `${CA}\nextra`, /only PEM CERTIFICATE blocks/],
    ["an unparseable certificate", "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----", /could not be parsed/],
  ])("rejects %s", (_label, raw, message) => {
    const error = captureError(() => parseCaMaterial(raw, "DATABASE_CA_CERT"));
    expect(error).toBeInstanceOf(DatabaseTlsConfigError);
    expect(error.message).toMatch(message);
  });

  it("rejects certificates outside their validity period", () => {
    expect(() => parseCaMaterial(CA, "T", new Date("2300-01-01"))).toThrow(/validity period/);
    expect(() => parseCaMaterial(CA, "T", new Date("1971-01-01"))).toThrow(/validity period/);
  });

  it("rejects a certificate that is not a certificate authority", async () => {
    vi.resetModules();
    vi.doMock("node:crypto", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:crypto")>();
      class LeafCertificate extends actual.X509Certificate {
        constructor(pem: string) {
          super(pem);
          Object.defineProperty(this, "ca", { value: false });
        }
      }
      return { ...actual, X509Certificate: LeafCertificate };
    });
    try {
      const fresh = await import("./database-tls");
      expect(() => fresh.parseCaMaterial(CA, "T")).toThrow(/not a certificate authority/);
    } finally {
      vi.doUnmock("node:crypto");
      vi.resetModules();
    }
  });

  it("never includes certificate content in an error", () => {
    const error = captureError(() => parseCaMaterial(`${CA}\nextra`, "DATABASE_CA_CERT"));
    expect(error.message).not.toContain(caFragment());
    expect(error.message).not.toContain("extra");
  });
});

describe("resolveDatabaseCa precedence", () => {
  it("uses the server environment CA before the local file", () => {
    expect(resolveDatabaseCa({ [DATABASE_CA_ENV]: CA }, { cwd: tempDir(true) })).toEqual({ kind: "env", pem: normalized(CA) });
  });

  it("never falls through to the local file when the environment CA is invalid", () => {
    expect(() => resolveDatabaseCa({ [DATABASE_CA_ENV]: "garbage!" }, { cwd: tempDir(true) })).toThrow(DatabaseTlsConfigError);
  });

  it.each([{ NODE_ENV: "production" }, { VERCEL_ENV: "production" }])("requires the environment CA in production (%o), ignoring the local file", (env) => {
    const error = captureError(() => resolveDatabaseCa({ ...env, [DATABASE_CA_ENV]: " " }, { cwd: tempDir(true) }));
    expect(error).toBeInstanceOf(DatabaseTlsConfigError);
    expect(error.message).toMatch(/DATABASE_CA_CERT is required in production/);
  });

  it("uses the approved local file outside production", () => {
    const cwd = tempDir(true);
    expect(resolveDatabaseCa({}, { cwd })).toEqual({
      kind: "local-file",
      pem: normalized(OTHER_CA),
      path: path.resolve(cwd, LOCAL_CA_RELATIVE_PATH),
    });
  });

  it("validates the local file like any other source", () => {
    const cwd = tempDir(true);
    fs.writeFileSync(path.join(cwd, LOCAL_CA_RELATIVE_PATH), "garbage!");
    expect(() => resolveDatabaseCa({}, { cwd })).toThrow(/local database CA file is invalid/);
  });

  it("falls back to the platform trust store only outside production", () => {
    expect(resolveDatabaseCa({}, { cwd: tempDir() })).toEqual({ kind: "system" });
  });
});

describe("loopback detection", () => {
  it.each(["postgresql://u@localhost/db", "postgresql://u@127.0.0.1:5433/db", "postgresql://u@[::1]/db"])("treats %s as loopback", (url) => {
    expect(isLoopbackDatabaseUrl(new URL(url))).toBe(true);
  });

  it.each(["postgresql://u@127.0.0.1/db?host=db.example.com", "postgresql://u@localhost/db?hostaddr=10.0.0.1", "postgresql://u@db.example.com/db"])(
    "does not treat %s as loopback",
    (url) => expect(isLoopbackDatabaseUrl(new URL(url))).toBe(false),
  );
});

describe("runtimePoolConfig (node-postgres)", () => {
  it("consumes the server-only CA with certificate verification enabled", () => {
    const config = runtimePoolConfig(REMOTE, prod);
    expect(config.ssl).toEqual({ ca: normalized(CA), rejectUnauthorized: true });
    expect(new ConnectionParameters(config).ssl).toEqual({ ca: normalized(CA), rejectUnauthorized: true });
  });

  it.each([
    "sslmode=no-verify",
    "sslmode=disable",
    "ssl=0",
    "ssl=true",
    "uselibpqcompat=true&sslmode=require",
    "sslmode=verify-full&sslrootcert=%2Fdefinitely%2Fmissing%2Fca.crt",
    "sslcert=relative.crt&sslkey=relative.key&sslaccept=accept_invalid_certs",
  ])("connection-string %s cannot replace or weaken explicit trust", (hostile) => {
    const config = runtimePoolConfig(`${REMOTE}&${hostile}`, prod);
    // Without stripping, node-postgres would apply these over `ssl` (or read a missing file).
    const effective = new ConnectionParameters(config);
    expect(effective.ssl).toEqual({ ca: normalized(CA), rejectUnauthorized: true });
    for (const name of ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat", "sslaccept", "ssl="]) {
      expect(config.connectionString).not.toContain(name);
    }
  });

  it("keeps every unrelated connection parameter exactly as node-postgres reads it", () => {
    const original = new ConnectionParameters({ connectionString: REMOTE });
    const sanitized = new ConnectionParameters(runtimePoolConfig(`${REMOTE}&sslmode=require`, prod));
    for (const key of ["user", "password", "host", "port", "database", "application_name", "options"] as const) {
      expect(sanitized[key]).toEqual(original[key]);
    }
    expect(runtimePoolConfig(REMOTE, prod).connectionString).toContain("pgbouncer=true");
  });

  it("preserves the exact raw encoding of unrelated parameters", () => {
    expect(runtimePoolConfig(`${REMOTE}&sslmode=disable`, prod).connectionString).toContain("options=-c%20search_path%3Dpublic");
  });

  it("strips trust parameters hidden behind percent-encoding or case", () => {
    // node-postgres decodes `ssl%6Dode` to `sslmode`, so it must be removed too.
    const config = runtimePoolConfig(`${REMOTE}&ssl%6Dode=no-verify&SSLMODE=disable`, prod);
    expect(new ConnectionParameters(config).ssl).toEqual({ ca: normalized(CA), rejectUnauthorized: true });
    expect(config.connectionString).not.toMatch(/ssl%6Dode|SSLMODE/i);
  });

  it("fails safely in production when the CA is missing", () => {
    expect(() => runtimePoolConfig(REMOTE, { NODE_ENV: "production" })).toThrow(DatabaseTlsConfigError);
  });

  it("fails safely in production when the CA is invalid", () => {
    expect(() => runtimePoolConfig(REMOTE, { NODE_ENV: "production", [DATABASE_CA_ENV]: "garbage!" })).toThrow(DatabaseTlsConfigError);
  });

  it("uses the local file outside production", () => {
    expect(runtimePoolConfig(REMOTE, {}, { cwd: tempDir(true) }).ssl).toEqual({ ca: normalized(OTHER_CA), rejectUnauthorized: true });
  });

  it("keeps verification on even with no CA available outside production", () => {
    expect(runtimePoolConfig(REMOTE, {}, { cwd: tempDir() }).ssl).toEqual({ rejectUnauthorized: true });
  });

  it("leaves a loopback disposable database untouched", () => {
    const local = "postgresql://postgres@127.0.0.1:5433/test?sslmode=disable";
    expect(runtimePoolConfig(local, { NODE_ENV: "production" })).toEqual({ connectionString: local });
  });

  it("applies trust when a host override points a loopback URL elsewhere", () => {
    const config = runtimePoolConfig("postgresql://u@127.0.0.1/db?host=db.example.com&sslmode=no-verify", prod);
    expect(new ConnectionParameters(config).ssl).toEqual({ ca: normalized(CA), rejectUnauthorized: true });
  });

  it("returns nothing to apply when no URL is configured", () => {
    expect(runtimePoolConfig(undefined, prod)).toEqual({});
  });

  it("never echoes the connection string in a URL error", () => {
    const error = captureError(() => runtimePoolConfig("not a url with secret-password", prod));
    expect(error).toBeInstanceOf(DatabaseTlsConfigError);
    expect(error.message).not.toContain("secret-password");
  });
});

describe("prismaCliDatasourceUrl (Prisma schema engine)", () => {
  it("materializes the environment CA to a private temp file with strict verification", () => {
    const tempRoot = tempDir();
    const url = new URL(prismaCliDatasourceUrl(`${REMOTE}&sslmode=disable&sslaccept=accept_invalid_certs&sslcert=certs%2Fold.crt`, prod, { tempRoot }));

    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.searchParams.get("sslaccept")).toBe("strict");
    expect(url.searchParams.getAll("sslaccept")).toHaveLength(1);
    expect(url.searchParams.get("pgbouncer")).toBe("true");
    const file = url.searchParams.get("sslcert")!;
    expect(path.isAbsolute(file)).toBe(true);
    expect(file.startsWith(tempRoot)).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe(normalized(CA));
    if (process.platform !== "win32") {
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    }
  });

  it("reuses one file per process and removes it deterministically", () => {
    const tempRoot = tempDir();
    const first = new URL(prismaCliDatasourceUrl(REMOTE, prod, { tempRoot })).searchParams.get("sslcert")!;
    const second = new URL(prismaCliDatasourceUrl(REMOTE, prod, { tempRoot })).searchParams.get("sslcert")!;
    expect(second).toBe(first);
    removeMaterializedCaFiles();
    expect(fs.existsSync(path.dirname(first))).toBe(false);
  });

  it("percent-encodes a CA path containing spaces (the engine does not decode `+`)", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "db tls spaced "));
    temps.push(tempRoot);
    const serialized = prismaCliDatasourceUrl(REMOTE, prod, { tempRoot });
    expect(serialized).toContain("%20");
    expect(serialized.split("sslcert=")[1]).not.toContain("+");
    expect(new URL(serialized).searchParams.get("sslcert")!.startsWith(tempRoot)).toBe(true);
    expect(serialized).toContain("options=-c%20search_path%3Dpublic");
  });

  it("points at the approved local file outside production without copying it", () => {
    const cwd = tempDir(true);
    const url = new URL(prismaCliDatasourceUrl(REMOTE, {}, { cwd }));
    expect(url.searchParams.get("sslcert")).toBe(path.resolve(cwd, LOCAL_CA_RELATIVE_PATH));
    expect(url.searchParams.get("sslaccept")).toBe("strict");
  });

  it("keeps strict verification against the platform store when no CA exists outside production", () => {
    const url = new URL(prismaCliDatasourceUrl(`${REMOTE}&sslaccept=accept_invalid_certs`, {}, { cwd: tempDir() }));
    expect(url.searchParams.get("sslaccept")).toBe("strict");
    expect(url.searchParams.has("sslcert")).toBe(false);
  });

  it("fails safely in production when the CA is missing", () => {
    expect(() => prismaCliDatasourceUrl(REMOTE, { VERCEL_ENV: "production" })).toThrow(DatabaseTlsConfigError);
  });

  it("leaves the loopback rehearsal database URL untouched", () => {
    const local = "postgresql://postgres@127.0.0.1:55432/learner_compat";
    expect(prismaCliDatasourceUrl(local, { NODE_ENV: "production" })).toBe(local);
  });
});
