import "server-only";
import { Pool } from "pg";
import { databasePoolConfig } from "./database-runtime-config";

// Optional marketing text must not consume the order/auth pool's connections
// or inherit its multi-second timeouts. One connection per warm instance.
// Same TLS trust as the main pool: separate pool, not separate security.
const pool = new Pool(databasePoolConfig({
  max: 1,
  connectionTimeoutMillis: 1500,
  query_timeout: 200,
  statement_timeout: 200,
  // Longer than the 60-second cache lifetime, so regular refreshes reuse TLS.
  idleTimeoutMillis: 90_000,
  allowExitOnIdle: true,
}));
// Idle socket failures must not become uncaught process errors.
pool.on("error", () => console.warn("[site-copy] idle connection unavailable"));

export async function readCopyRows(locale: string) {
  const result = await pool.query<{ key: string; value: string }>(
    'SELECT "key", "value" FROM "SiteCopy" WHERE "locale" = $1',
    [locale],
  );
  return result.rows;
}
