/**
 * The single source of database TLS trust for every non-test connection path:
 * the Next.js runtime pools (via database-runtime-config.ts), the manual
 * scripts, and the Prisma CLI (via prisma.config.ts).
 *
 * Deliberately NOT marked `server-only`: prisma.config.ts and the tsx scripts
 * run in plain Node, where that package throws on import. It still can never
 * reach a browser bundle — it imports node:fs/node:crypto, reads only a
 * non-NEXT_PUBLIC_ variable, and the runtime entry point is server-only.
 *
 * Nothing in this module may log, return in an error, or otherwise print CA
 * material or connection strings.
 */
import { createHash, X509Certificate } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Server-only. Never give this a NEXT_PUBLIC_ prefix. */
export const DATABASE_CA_ENV = "DATABASE_CA_CERT";

/** The approved, git-ignored local CA location. Never used in production. */
export const LOCAL_CA_RELATIVE_PATH = path.join("certs", "prod-ca-2021.crt");

const MAX_CA_BYTES = 64 * 1024;

/**
 * Connection-string parameters that decide TLS trust. They are removed before
 * explicit trust is applied, because:
 *  - node-postgres merges parse(connectionString) OVER an explicit `ssl`
 *    object, so any of these would silently replace the verified CA;
 *  - `sslrootcert=<path>` makes node-postgres read a file that does not exist
 *    on Vercel;
 *  - `sslmode=no-verify` / `uselibpqcompat=true&sslmode=require` and Prisma's
 *    `sslaccept=accept_invalid_certs` (Prisma's default when absent) disable
 *    certificate verification.
 * Every other parameter (pgbouncer, options, application_name, ...) is kept.
 */
const TRUST_PARAMETERS = [
  "ssl",
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslpassword",
  "sslcrl",
  "sslcrldir",
  "sslsni",
  "uselibpqcompat",
  "sslaccept",
  "sslidentity",
] as const;

type Env = Readonly<Record<string, string | undefined>>;
type ResolveOptions = { cwd?: string; now?: Date };

export type DatabaseCa =
  | { kind: "env"; pem: string }
  | { kind: "local-file"; pem: string; path: string }
  | { kind: "system" };

export class DatabaseTlsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseTlsConfigError";
  }
}

/** Vercel Preview runs with NODE_ENV=production, so it is production here too. */
export function isProductionEnvironment(env: Env = process.env): boolean {
  return env.VERCEL_ENV === "production" || env.NODE_ENV === "production";
}

/**
 * Validates and normalizes CA material. Accepts a PEM bundle (real newlines,
 * CRLF, or literal "\n" escapes from single-line env tooling) or the same PEM
 * base64-encoded. Only CERTIFICATE blocks that are currently valid CA
 * certificates are accepted. Error messages name the source, never content.
 */
export function parseCaMaterial(raw: string, source: string, now: Date = new Date()): string {
  const invalid = (reason: string) => new DatabaseTlsConfigError(`${source} is invalid: ${reason}`);
  let text = raw.trim();
  if (!text) throw invalid("empty");
  if (Buffer.byteLength(text, "utf8") > MAX_CA_BYTES) throw invalid("too large");

  if (!text.startsWith("-----BEGIN")) {
    if (!/^[A-Za-z0-9+/=\s]+$/.test(text)) throw invalid("not a PEM certificate or base64-encoded PEM");
    text = Buffer.from(text.replace(/\s+/g, ""), "base64").toString("utf8").trim();
    if (!text.startsWith("-----BEGIN")) throw invalid("base64 content is not a PEM certificate");
  }
  if (!text.includes("\n") && text.includes("\\n")) text = text.replace(/\\n/g, "\n");
  text = text.replace(/\r\n/g, "\n");

  if (/PRIVATE KEY/.test(text)) throw invalid("contains private key material");
  const blockPattern = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;
  const blocks = text.match(blockPattern) ?? [];
  if (blocks.length === 0 || text.replace(blockPattern, "").trim() !== "") {
    throw invalid("must contain only PEM CERTIFICATE blocks");
  }

  for (const block of blocks) {
    let certificate: X509Certificate;
    try {
      certificate = new X509Certificate(block);
    } catch {
      throw invalid("certificate could not be parsed");
    }
    if (!certificate.ca) throw invalid("certificate is not a certificate authority");
    if (new Date(certificate.validFrom) > now || new Date(certificate.validTo) <= now) {
      throw invalid("certificate is outside its validity period");
    }
  }
  return `${blocks.join("\n")}\n`;
}

/**
 * Deterministic precedence, never downgrading verification:
 *   1. DATABASE_CA_CERT (server environment). If set but invalid: throw —
 *      never fall through to a weaker source.
 *   2. Production without it: throw.
 *   3. Non-production: the approved git-ignored local file, if present.
 *   4. Non-production: the platform trust store, with verification still on.
 *      The Supabase CA is not publicly trusted, so this fails closed there.
 */
export function resolveDatabaseCa(env: Env = process.env, options: ResolveOptions = {}): DatabaseCa {
  const now = options.now ?? new Date();
  const raw = env[DATABASE_CA_ENV];
  if (raw !== undefined && raw.trim() !== "") {
    return { kind: "env", pem: parseCaMaterial(raw, DATABASE_CA_ENV, now) };
  }
  if (isProductionEnvironment(env)) {
    throw new DatabaseTlsConfigError(
      `${DATABASE_CA_ENV} is required in production to verify the database TLS certificate`,
    );
  }
  const localPath = path.resolve(options.cwd ?? process.cwd(), LOCAL_CA_RELATIVE_PATH);
  if (fs.existsSync(localPath)) {
    return {
      kind: "local-file",
      path: localPath,
      pem: parseCaMaterial(fs.readFileSync(localPath, "utf8"), "The local database CA file", now),
    };
  }
  return { kind: "system" };
}

function parseDatabaseUrl(connectionString: string, name: string): URL {
  try {
    return new URL(connectionString);
  } catch {
    throw new DatabaseTlsConfigError(`${name} is not a valid connection URL`);
  }
}

/**
 * A disposable database on this machine never crosses a network, so TLS
 * policy does not apply. A `host`/`hostaddr` query override is never trusted
 * as loopback, because it replaces the URL host inside node-postgres.
 */
export function isLoopbackDatabaseUrl(url: URL): boolean {
  if (url.searchParams.has("host") || url.searchParams.has("hostaddr")) return false;
  const host = url.hostname.toLowerCase();
  return host === "localhost" || host === "[::1]" || /^127(\.\d{1,3}){3}$/.test(host);
}

function parameterName(pair: string): string {
  const raw = pair.split("=", 1)[0].replace(/\+/g, " ");
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/**
 * Removes trust parameters and appends `extra`, working on the raw query so
 * every other parameter keeps its exact original encoding. (URLSearchParams
 * would re-serialize spaces as `+`, which the Prisma schema engine does not
 * decode as a space.) Added values are percent-encoded (`%20`).
 */
export function stripTrustParameters(url: URL, extra: ReadonlyArray<readonly [string, string]> = []): URL {
  const result = new URL(url.toString());
  const kept = result.search
    .slice(1)
    .split("&")
    .filter((pair) => pair !== "" && !(TRUST_PARAMETERS as readonly string[]).includes(parameterName(pair)));
  const added = extra.map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
  result.search = [...kept, ...added].join("&");
  return result;
}

export type RuntimeTlsConfig = {
  connectionString?: string;
  ssl?: { ca?: string; rejectUnauthorized: true };
};

/**
 * node-postgres (and @prisma/adapter-pg) connection settings. For any
 * non-loopback host, trust comes only from the explicit `ssl` object, and the
 * URL is stripped of every parameter that could replace or weaken it.
 */
export function runtimePoolConfig(
  connectionString: string | undefined,
  env: Env = process.env,
  options: ResolveOptions = {},
): RuntimeTlsConfig {
  if (!connectionString) return {};
  const url = parseDatabaseUrl(connectionString, "DATABASE_URL");
  if (isLoopbackDatabaseUrl(url)) return { connectionString };

  const ca = resolveDatabaseCa(env, options);
  return {
    connectionString: stripTrustParameters(url).toString(),
    ssl: ca.kind === "system" ? { rejectUnauthorized: true } : { ca: ca.pem, rejectUnauthorized: true },
  };
}

const materialized = new Map<string, string>();

/**
 * The Prisma schema engine reads its CA only from a file path (`sslcert`).
 * Environment-provided CA material is written to a fresh private directory in
 * the OS temp dir (mkdtemp: unpredictable name; 0700 dir / 0600 file where the
 * platform honours modes; `wx` refuses a pre-existing path), reused within
 * this process, and removed when the process exits. Nothing lands in the repo.
 */
export function materializeCaFile(pem: string, tempRoot: string = os.tmpdir()): string {
  const key = createHash("sha256").update(pem).digest("hex");
  const existing = materialized.get(key);
  if (existing && fs.existsSync(existing)) return existing;

  const directory = fs.mkdtempSync(path.join(tempRoot, "abelkirar-db-ca-"));
  fs.chmodSync(directory, 0o700);
  const file = path.join(directory, "ca.pem");
  fs.writeFileSync(file, pem, { mode: 0o600, flag: "wx" });
  materialized.set(key, file);
  process.once("exit", () => fs.rmSync(directory, { recursive: true, force: true }));
  return file;
}

/** Removes every CA file this process materialized. Exit cleanup does the same. */
export function removeMaterializedCaFiles(): void {
  for (const file of materialized.values()) {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
  materialized.clear();
}

/**
 * The Prisma CLI URL. Prisma 7 accepts only a URL string here, so trust is
 * expressed as `sslmode=require&sslaccept=strict&sslcert=<absolute CA path>`
 * after stripping whatever trust parameters the environment URL carried.
 * `sslaccept=strict` is always explicit: Prisma's PostgreSQL default when it
 * is absent is `accept_invalid_certs`.
 */
export function prismaCliDatasourceUrl(
  directUrl: string,
  env: Env = process.env,
  options: ResolveOptions & { tempRoot?: string } = {},
): string {
  const url = parseDatabaseUrl(directUrl, "DIRECT_URL");
  if (isLoopbackDatabaseUrl(url)) return directUrl;

  const ca = resolveDatabaseCa(env, options);
  const trust: Array<[string, string]> = [["sslmode", "require"], ["sslaccept", "strict"]];
  if (ca.kind === "local-file") trust.push(["sslcert", ca.path]);
  if (ca.kind === "env") trust.push(["sslcert", materializeCaFile(ca.pem, options.tempRoot)]);
  return stripTrustParameters(url, trust).toString();
}
