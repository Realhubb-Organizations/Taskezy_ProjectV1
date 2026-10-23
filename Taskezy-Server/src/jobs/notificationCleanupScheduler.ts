import { pool } from "../db/pool";
import { logger } from "../utils/logger";

const POLL_INTERVAL_MS = 60 * 60_000; // hourly — this is storage cleanup, not a live-facing alert
const RETENTION_HOURS = 48;

/**
 * A read notification stays visible for 48h (notifications.routes.ts's
 * VISIBLE_SQL hides it from GET "/"/"/counts" once that window passes) —
 * this is what actually reclaims the row afterward. Before read_at existed,
 * an informational notification was deleted the instant it was read, so
 * this table was self-cleaning; this scheduler is what keeps it that way
 * now that reads no longer delete immediately.
 */
async function cleanupReadNotifications(): Promise<void> {
  const { rowCount } = await pool.query(
    `DELETE FROM notifications WHERE read = true AND read_at IS NOT NULL AND read_at < now() - interval '${RETENTION_HOURS} hours'`
  );
  if (rowCount) logger.info({ deleted: rowCount }, "Cleaned up expired read notifications");
}

export function startNotificationCleanupScheduler(): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await cleanupReadNotifications().catch((err) => logger.error({ err }, "Notification cleanup poll failed"));
    } finally {
      running = false;
    }
  };
  setInterval(tick, POLL_INTERVAL_MS).unref();
  logger.info(`Notification cleanup scheduler started (poll every ${POLL_INTERVAL_MS / 1000}s, ${RETENTION_HOURS}h retention after read)`);
}
