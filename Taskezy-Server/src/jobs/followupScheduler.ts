import { pool } from "../db/pool";
import { logger } from "../utils/logger";
import { createNotification } from "../modules/notifications/notifications.service";
import { listActiveAdminIds } from "../modules/users/users.repository";

const POLL_INTERVAL_MS = 60_000;
const VIOLATION_WINDOW_MS = 10 * 60_000; // 10 minutes, per product decision

interface DueFollowup {
  id: string;
  lead_id: string | null;
  lead_name: string;
  call_type: string;
  assigned_to_id: string;
}

/** Fires a "reminder due" notification the moment a scheduled follow-up's time arrives. */
async function notifyDueFollowups(): Promise<void> {
  const { rows } = await pool.query<DueFollowup>(
    `SELECT id, lead_id, lead_name, call_type, assigned_to_id
     FROM followup_calls
     WHERE status = 'UPCOMING' AND scheduled_at <= now() AND due_notified_at IS NULL`
  );

  for (const row of rows) {
    await createNotification({
      system: "CRM",
      category: "REMINDER",
      title: "Reminder Due Now",
      message: `${row.lead_name} — ${row.call_type.replace("_", " ").toLowerCase()} reminder is due.`,
      recipientUserId: row.assigned_to_id,
      leadId: row.lead_id ?? undefined,
      link: "/dashboard/crm"
    });
    await pool.query(`UPDATE followup_calls SET due_notified_at = now() WHERE id = $1`, [row.id]);
  }
}

interface OverdueFollowup {
  id: string;
  lead_id: string | null;
  lead_name: string;
  agent_name: string;
}

/**
 * Escalates to every active admin when a follow-up has been due for more
 * than VIOLATION_WINDOW_MS with no lead status change in the meantime — see
 * leads.service.ts::updateLeadStatus, which marks the follow-up COMPLETED
 * the moment the assigned agent actually updates the lead, which is what
 * keeps a handled follow-up out of this query.
 */
async function notifySlaViolations(): Promise<void> {
  const { rows } = await pool.query<OverdueFollowup>(
    // VIOLATION_WINDOW_MS above must match this literal — kept as a fixed
    // SQL interval rather than a bound parameter since it's a constant, not
    // user input.
    `SELECT fc.id, fc.lead_id, fc.lead_name, u.first_name || COALESCE(' ' || u.last_name, '') AS agent_name
     FROM followup_calls fc
     JOIN users u ON u.id = fc.assigned_to_id
     WHERE fc.status = 'UPCOMING'
       AND fc.due_notified_at IS NOT NULL
       AND fc.due_notified_at <= now() - interval '10 minutes'
       AND fc.violation_notified_at IS NULL`
  );
  if (rows.length === 0) return;

  const adminIds = await listActiveAdminIds();

  for (const row of rows) {
    for (const adminId of adminIds) {
      await createNotification({
        system: "CRM",
        category: "GENERAL",
        title: "Follow-up SLA Violation",
        message: `${row.agent_name} has not followed up on "${row.lead_name}" within 10 minutes of the reminder.`,
        recipientUserId: adminId,
        leadId: row.lead_id ?? undefined,
        link: "/dashboard/crm"
      });
    }
    await pool.query(
      `UPDATE followup_calls SET violation_notified_at = now(), status = 'MISSED' WHERE id = $1`,
      [row.id]
    );
  }
}

/**
 * Single-process, in-memory poller — matches the same tradeoff already
 * accepted for the SSE hub (utils/sseHub.ts): fine as long as the API runs
 * as one container. If this ever runs as more than one instance, every
 * instance polls independently and could double-fire notifications; would
 * need a DB-level lock (e.g. `SELECT ... FOR UPDATE SKIP LOCKED`) or to move
 * to a dedicated job runner at that point.
 */
export function startFollowupScheduler(): void {
  setInterval(() => {
    notifyDueFollowups().catch((err) => logger.error({ err }, "Follow-up due-notification poll failed"));
    notifySlaViolations().catch((err) => logger.error({ err }, "Follow-up SLA-violation poll failed"));
  }, POLL_INTERVAL_MS).unref();
  logger.info(`Follow-up SLA scheduler started (poll every ${POLL_INTERVAL_MS / 1000}s, violation window ${VIOLATION_WINDOW_MS / 60_000}min)`);
}
