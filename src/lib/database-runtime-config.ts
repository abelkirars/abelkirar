import "server-only";
import type { PoolConfig } from "pg";
import { runtimePoolConfig } from "./database-tls";

/**
 * The only way application code builds a PostgreSQL pool configuration.
 * Pool tuning comes from the caller; the connection string and TLS trust are
 * applied last so a caller can never override or omit them.
 */
export function databasePoolConfig(tuning: Omit<PoolConfig, "connectionString" | "ssl">): PoolConfig {
  return { ...tuning, ...runtimePoolConfig(process.env.DATABASE_URL) };
}
