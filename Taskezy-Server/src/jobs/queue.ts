import { PgBoss } from "pg-boss";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { AccessTokenPayload } from "../utils/tokens";
import { bulkImportLeads, BulkImportLeadsInput, bulkDeleteLeads, bulkReassignLeads, bulkSetLeadProperty } from "../modules/leads/leads.service";

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

// Data Calling's and the main CRM Leads page's bulk-delete toolbar action —
// already bounded (500 leads/request) and fast, but queued anyway for the
// same reason as the other two: one consistent "enqueue, poll, show result"
// shape across every bulk lead action rather than a special case.
export const BULK_DELETE_LEADS_QUEUE = "bulk-delete-leads";
interface BulkDeleteLeadsJobData {
  actor: { userId: string; name: string };
  leadIds: string[];
}

// Backs both pages' bulk Assign/Reshuffle — previously N individual
// apiReassignLead calls fired directly from the browser (see
// leads.service.ts's bulkReassignLeads for the full reasoning).
export const BULK_REASSIGN_LEADS_QUEUE = "bulk-reassign-leads";
interface BulkReassignLeadsJobData {
  caller: AccessTokenPayload;
  leadIds: string[];
  newAgentId: string;
  note: string;
}

// Main CRM Leads page's bulk "Change Property" toolbar action — same
// queued shape as bulk reassign (leads.service.ts's bulkSetLeadProperty).
export const BULK_SET_PROPERTY_QUEUE = "bulk-set-property";
interface BulkSetPropertyJobData {
  caller: AccessTokenPayload;
  leadIds: string[];
  propertyId: string | null;
  note: string;
}

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

  await boss.createQueue(BULK_DELETE_LEADS_QUEUE);
  await boss.work<BulkDeleteLeadsJobData>(BULK_DELETE_LEADS_QUEUE, async ([job]) => {
    logger.info({ jobId: job.id }, "Processing queued bulk lead delete");
    return bulkDeleteLeads(job.data.actor, job.data.leadIds);
  });

  await boss.createQueue(BULK_REASSIGN_LEADS_QUEUE);
  await boss.work<BulkReassignLeadsJobData>(BULK_REASSIGN_LEADS_QUEUE, async ([job]) => {
    logger.info({ jobId: job.id }, "Processing queued bulk lead reassignment");
    return bulkReassignLeads(job.data.caller, job.data.leadIds, job.data.newAgentId, job.data.note);
  });

  await boss.createQueue(BULK_SET_PROPERTY_QUEUE);
  await boss.work<BulkSetPropertyJobData>(BULK_SET_PROPERTY_QUEUE, async ([job]) => {
    logger.info({ jobId: job.id }, "Processing queued bulk lead property change");
    return bulkSetLeadProperty(job.data.caller, job.data.leadIds, job.data.propertyId, job.data.note);
  });
}

export async function stopQueue(): Promise<void> {
  await boss.stop({ graceful: true, timeout: 10_000 });
}
