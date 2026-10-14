import { createApp } from "./app";
import { env } from "./config/env";
import { pool, checkDatabaseConnection } from "./db/pool";
import { logger } from "./utils/logger";
import { startFollowupScheduler } from "./jobs/followupScheduler";
import { startMissedLeadScheduler } from "./jobs/missedLeadScheduler";
import { startMetaAdSpendSync } from "./jobs/metaAdSpendSync";
import { startGoogleAdsSpendSync } from "./jobs/googleAdsSpendSync";
import { startDataRetentionJob } from "./jobs/dataRetentionJob";
import { startQueue, stopQueue } from "./jobs/queue";

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
  startDataRetentionJob();
  // The pgboss schema must already exist (migrations-archive/031_pgboss_grants.sql's
  // header) — until the one-time `pg-boss migrate` CLI step has been run in
  // this environment, this throws. Caught locally (not left to crash the
  // whole process like checkDatabaseConnection() above) because nothing
  // user-facing depends on the queue yet during this rollout — once a real
  // endpoint (bulk-import) actually relies on it, this should become a hard
  // boot dependency instead.
  try {
    await startQueue();
  } catch (err) {
    logger.error({ err }, "Could not start the job queue — has `pg-boss migrate` been run yet? Continuing without it.");
  }

  // Stateless by design (JWT auth, no in-memory session/state) — any number
  // of these processes can run behind a load balancer with zero coordination
  // between them. See README.md "Scaling" for how to actually add replicas.
  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(async () => {
      await stopQueue().catch((err) => logger.error({ err }, "Error stopping the job queue"));
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

  // Request-triggered errors are already safe (every route goes through
  // asyncHandler), but the 5 background interval jobs above have no
  // equivalent safety net — an unhandled error in one of them previously
  // had nothing catching it, which crashes the whole process with no log
  // of what happened and no graceful connection drain. Logging the actual
  // error is the point here (that's the gap this closes); the clean
  // shutdown-and-let-the-supervisor-restart-us path already exists above,
  // reused as-is rather than attempting to keep running in a state Node
  // itself no longer guarantees is safe.
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception — shutting down");
    shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled promise rejection — shutting down");
    shutdown("unhandledRejection");
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal error during startup");
  process.exit(1);
});
