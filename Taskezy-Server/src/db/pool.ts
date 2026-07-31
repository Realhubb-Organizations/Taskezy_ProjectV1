import { Pool, PoolClient } from "pg";
import { env } from "../config/env";
import { logger } from "../utils/logger";

// One pool per process, reused across every request — never open a new
// connection per request. This is what actually lets the API handle a high
// volume of concurrent calls: requests borrow/return connections from this
// fixed-size pool instead of paying TCP+auth handshake cost each time.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS
});

// A connection that throws while idle in the pool would otherwise crash the
// process with an unhandled error — log it and let the pool recycle it.
pool.on("error", (err) => {
  logger.error({ err }, "Unexpected error on idle Postgres client");
});

const SLOW_QUERY_THRESHOLD_MS = 200;

/**
 * Run a single parameterized query. Always use $1/$2/... placeholders —
 * never string-concatenate user input into SQL, no exceptions.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<{ rows: T[]; rowCount: number }> {
  const start = Date.now();
  const result = await pool.query(text, params);
  const durationMs = Date.now() - start;
  if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
    logger.warn({ durationMs, text }, "Slow query");
  }
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
}

/**
 * Run a set of queries atomically. Pass a callback that receives a dedicated
 * client — use it for every query inside the transaction, not the pool
 * directly, or they won't share the same transaction/connection.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (err) {
    logger.error({ err }, "Database connection check failed");
    return false;
  }
}
