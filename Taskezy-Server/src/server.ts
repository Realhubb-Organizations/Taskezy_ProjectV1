import { createApp } from "./app";
import { env } from "./config/env";
import { pool, checkDatabaseConnection } from "./db/pool";
import { logger } from "./utils/logger";
import { startFollowupScheduler } from "./jobs/followupScheduler";
import { startMissedLeadScheduler } from "./jobs/missedLeadScheduler";
import { startMetaAdSpendSync } from "./jobs/metaAdSpendSync";
import { startGoogleAdsSpendSync } from "./jobs/googleAdsSpendSync";

async function main(): Promise<void> {
  const dbOk = await checkDatabaseConnection();
  if (!dbOk) {
    logger.error("Could not connect to the database at boot — exiting so the process supervisor restarts us.");
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`TASKEZY API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  startFollowupScheduler();
  startMissedLeadScheduler();
  startMetaAdSpendSync();
  startGoogleAdsSpendSync();

  // Stateless by design (JWT auth, no in-memory session/state) — any number
  // of these processes can run behind a load balancer with zero coordination
  // between them. See README.md "Scaling" for how to actually add replicas.
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(async () => {
      await pool.end();
      logger.info("Shutdown complete.");
      process.exit(0);
    });
    // Don't hang forever if a connection refuses to close.
    setTimeout(() => {
      logger.error("Forced shutdown after timeout.");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
