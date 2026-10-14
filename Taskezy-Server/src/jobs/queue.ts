import { PgBoss } from "pg-boss";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { bulkImportLeads, BulkImportLeadsInput } from "../modules/leads/leads.service";

// Postgres-backed job queue (same RDS instance, its own `pgboss` schema —
// see migrations-archive/031_pgboss_grants.sql for the one-time setup).
// `migrate: false`: this app's own connection (taskezy_app) deliberately
// has no DDL rights outside that schema's sandboxed grant — schema
// creation/upgrades are a manual step (the pg-boss CLI, run as
// taskezy_admin), never something the running API process attempts itself.
export const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
  schema: "pgboss",
  migrate: false
});

boss.on("error", (err) => logger.error({ err }, "pg-boss error"));

const HELLO_QUEUE = "hello-world";

// First real job on the queue (see leads.routes.ts's POST /bulk-import) —
// an admin's Excel upload can be 100k+ rows, long enough to risk an
// upstream proxy timeout if run inline in the request. The handler stays
// the same bulkImportLeads function leads.service.ts always had; only the
// trigger moved from "awaited in the request" to "queued, polled via
// GET /bulk-import/:jobId/status". Its return value becomes this job's
// `output`, which pg-boss stores for us — no separate results table needed.
export const BULK_IMPORT_LEADS_QUEUE = "bulk-import-leads";

/**
 * Starts the queue and registers every job worker this process handles.
 * Same process as the API server (see server.ts) — this app is already
 * stateless/horizontally-replicable (JWT auth, no in-memory session
 * state), and pg-boss's SKIP LOCKED claiming is explicitly built to let
 * multiple same-process-shaped workers safely compete for the same queue,
 * so running the worker loop inside every API replica (rather than a
 * separate worker process) costs nothing extra if this app is ever scaled
 * to more than one instance.
 *
 * Also sends one `hello-world` job on every boot and logs when it's
 * picked up and completed — a real, self-verifying end-to-end smoke test
 * of the whole queue (enqueue -> claim -> process -> complete) on every
 * server start, not just a one-time manual check.
 */
export async function startQueue(): Promise<void> {
  await boss.start();
  await boss.createQueue(HELLO_QUEUE);

  await boss.work<{ bootedAt: string }>(HELLO_QUEUE, async ([job]) => {
    logger.info({ jobId: job.id, bootedAt: job.data.bootedAt }, "pg-boss hello-world job processed — queue plumbing is working");
  });

  const id = await boss.send(HELLO_QUEUE, { bootedAt: new Date().toISOString() });
  logger.info({ jobId: id }, "pg-boss started, hello-world smoke-test job queued");

  await boss.createQueue(BULK_IMPORT_LEADS_QUEUE);
  await boss.work<BulkImportLeadsInput>(BULK_IMPORT_LEADS_QUEUE, async ([job]) => {
    logger.info({ jobId: job.id }, "Processing queued bulk lead import");
    return bulkImportLeads(job.data);
  });
}

export async function stopQueue(): Promise<void> {
  await boss.stop({ graceful: true, timeout: 10_000 });
}
