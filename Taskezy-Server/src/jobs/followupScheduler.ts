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
  // Claim-before-send: the candidate SELECT and the due_notified_at marker are
  // merged into one atomic UPDATE ... RETURNING so a row is claimed (and thus
  // invisible to any overlapping run of this same query) before we ever send a
  // notification for it. If the process crashes after this claim but before
  // createNotification below actually sends, that one reminder is silently
  // missed — a low-cost outcome we accept in exchange for making duplicate
  // sends impossible, since duplicates erode trust and teach users to ignore
  // alerts, which is worse than rarely missing one.
  const { rows } = await pool.query<DueFollowup>(
    `UPDATE followup_calls
     SET due_notified_at = now()
     WHERE status = 'UPCOMING' AND scheduled_at <= now() AND due_notified_at IS NULL
     RETURNING id, lead_id, lead_name, call_type, assigned_to_id`
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
  // Claim-before-send, same reasoning as notifyDueFollowups above: the candidate
  // query (including the agent_name join) and the violation marker + MISSED
  // status transition are merged into one atomic UPDATE ... FROM ... RETURNING
  // so a row is claimed before any admin notification is sent for it. Worst case
  // on a crash mid-send is a missed one-time escalation, not a duplicate one.
  const { rows } = await pool.query<OverdueFollowup>(
    // VIOLATION_WINDOW_MS above must match this literal — kept as a fixed
    // SQL interval rather than a bound parameter since it's a constant, not
    // user input.
    `UPDATE followup_calls fc
     SET violation_notified_at = now(), status = 'MISSED'
     FROM users u
     WHERE u.id = fc.assigned_to_id
       AND fc.status = 'UPCOMING'
       AND fc.due_notified_at IS NOT NULL
       AND fc.due_notified_at <= now() - interval '10 minutes'
       AND fc.violation_notified_at IS NULL
     RETURNING fc.id, fc.lead_id, fc.lead_name, u.first_name || COALESCE(' ' || u.last_name, '') AS agent_name`
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
  }
}

/**
 * Single-process, in-memory poller — matches the same tradeoff already
 * accepted for the SSE hub (utils/sseHub.ts): fine as long as the API runs
 * as one container. The candidate queries in notifyDueFollowups and
 * notifySlaViolations above are each a single atomic `UPDATE ... RETURNING`
 * (claim-then-read), so Postgres row-locks the claim itself — this is safe
 * even if this job ever runs as more than one process against the same
 * database, not just within one. The in-flight guard below closes the
 * separate, currently-exploitable gap: a single process whose cycle runs
 * long enough that the next `setInterval` tick would start overlapping it.
 */
export function startFollowupScheduler(): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await notifyDueFollowups().catch((err) => logger.error({ err }, "Follow-up due-notification poll failed"));
      await notifySlaViolations().catch((err) => logger.error({ err }, "Follow-up SLA-violation poll failed"));
    } finally {
      running = false;
    }
  };
  setInterval(tick, POLL_INTERVAL_MS).unref();
  logger.info(`Follow-up SLA scheduler started (poll every ${POLL_INTERVAL_MS / 1000}s, violation window ${VIOLATION_WINDOW_MS / 60_000}min)`);
}
