import { pool } from "../db/pool";
import { logger } from "../utils/logger";

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;
const NOTIFICATION_RETENTION_DAYS = 7;
// Dead refresh tokens are kept a little past expiry/revocation so a replay of
// a recently rotated token still trips reuse detection in auth.service.ts
// (which needs the revoked row to find and revoke the whole session family).
const DEAD_TOKEN_RETENTION_DAYS = 7;
// Deletes in small batches so a large first cleanup never holds long locks
// on tables that logins and the notification bell use constantly.
const BATCH_SIZE = 5000;

const INSUFFICIENT_PRIVILEGE = "42501";

async function deleteInBatches(table: string, where: string): Promise<number> {
  let total = 0;
  for (;;) {
    const { rowCount } = await pool.query(
      `DELETE FROM ${table} WHERE ctid = ANY(ARRAY(SELECT ctid FROM ${table} WHERE ${where} LIMIT ${BATCH_SIZE}))`
    );
    total += rowCount ?? 0;
    if (!rowCount || rowCount < BATCH_SIZE) return total;
  }
}

/**
 * Notifications nobody read or cleared within the retention window, and
 * refresh tokens that can no longer be used (expired or revoked), are
 * deleted so neither table grows forever or keeps stale personal data.
 */
async function cleanupOnce(): Promise<void> {
  const steps: { table: string; where: string }[] = [
    { table: "notifications", where: `created_at < now() - interval '${NOTIFICATION_RETENTION_DAYS} days'` },
    {
      table: "refresh_tokens",
      where: `expires_at < now() - interval '${DEAD_TOKEN_RETENTION_DAYS} days'
              OR revoked_at < now() - interval '${DEAD_TOKEN_RETENTION_DAYS} days'`
    }
  ];

  for (const { table, where } of steps) {
    try {
      const deleted = await deleteInBatches(table, where);
      logger.info({ table, deleted }, "Data retention cleanup finished");
    } catch (err) {
      if ((err as { code?: string }).code === INSUFFICIENT_PRIVILEGE) {
        logger.warn({ table }, "Data retention cleanup skipped: the app database role has no DELETE permission (see migration 023)");
      } else {
        logger.error({ err, table }, "Data retention cleanup failed");
      }
    }
  }
}

export function startDataRetentionJob(): void {
  setTimeout(() => {
    cleanupOnce().catch(err => logger.error({ err }, "Initial data retention cleanup failed"));
  }, FIRST_RUN_DELAY_MS).unref();

  setInterval(() => {
    cleanupOnce().catch(err => logger.error({ err }, "Data retention cleanup cycle failed"));
  }, RUN_INTERVAL_MS).unref();

  logger.info(
    `Data retention cleanup scheduled (daily; notifications > ${NOTIFICATION_RETENTION_DAYS}d, dead refresh tokens > ${DEAD_TOKEN_RETENTION_DAYS}d)`
  );
}
