import { pool } from "../db/pool";
import { logger } from "../utils/logger";
import { createNotification } from "../modules/notifications/notifications.service";
import { listActiveAdminIds } from "../modules/users/users.repository";

const POLL_INTERVAL_MS = 60_000;
const SLA_MINUTES = 20; // matches Reports' isMissedLead / getMissedInfo rule (reportMetrics.ts)

interface MissedLead {
  id: string;
  name: string;
  assigned_agent_id: string;
  agent_name: string;
  manager_id: string | null;
}

/**
 * Fires the moment a lead crosses the same 20-minute "no first response"
 * threshold Reports has always computed live in the browser — this makes it
 * a real-time push instead of something only visible next time someone opens
 * the Reports page. missed_notified_at is a one-shot marker, mirroring
 * followup_calls.due_notified_at in followupScheduler.ts, so a lead that
 * stays untouched doesn't re-notify every poll cycle.
 */
async function notifyMissedLeads(): Promise<void> {
  const { rows } = await pool.query<MissedLead>(
    `SELECT l.id, l.name, l.assigned_agent_id,
            u.first_name || COALESCE(' ' || u.last_name, '') AS agent_name,
            u.manager_id
     FROM leads l
     JOIN users u ON u.id = l.assigned_agent_id
     WHERE l.first_response_at IS NULL
       AND l.assigned_at IS NOT NULL
       AND l.assigned_at <= now() - interval '${SLA_MINUTES} minutes'
       AND l.missed_notified_at IS NULL`
  );
  if (rows.length === 0) return;

  // Escalation always reaches Admin, not just the agent's direct manager —
  // an agent with no manager_id set (manager_id IS NULL) would otherwise
  // have their missed SLA go completely unescalated, seen by no one but
  // themselves. Mirrors followupScheduler.ts's SLA-violation escalation,
  // which always notifies every active admin for the same reason.
  const adminIds = await listActiveAdminIds();

  for (const row of rows) {
    await createNotification({
      system: "CRM",
      category: "MISSED_SLA",
      title: "Lead Missed SLA",
      message: `"${row.name}" has had no response within ${SLA_MINUTES} minutes of assignment.`,
      recipientUserId: row.assigned_agent_id,
      leadId: row.id,
      link: "/dashboard/crm"
    });

    // Manager (if any) + every active admin, deduplicated so someone who is
    // both doesn't get notified twice.
    const escalationRecipients = new Set<string>(adminIds);
    if (row.manager_id) escalationRecipients.add(row.manager_id);
    escalationRecipients.delete(row.assigned_agent_id);

    for (const recipientId of escalationRecipients) {
      await createNotification({
        system: "CRM",
        category: "MISSED_SLA",
        title: "Team Lead Missed SLA",
        message: `${row.agent_name} hasn't responded to "${row.name}" within ${SLA_MINUTES} minutes.`,
        recipientUserId: recipientId,
        leadId: row.id,
        link: "/dashboard/reports"
      });
    }

    await pool.query(`UPDATE leads SET missed_notified_at = now() WHERE id = $1`, [row.id]);
  }
}

/** Single-process in-memory poller — same scaling caveat as followupScheduler.ts and utils/sseHub.ts. */
export function startMissedLeadScheduler(): void {
  setInterval(() => {
    notifyMissedLeads().catch((err) => logger.error({ err }, "Missed-lead SLA poll failed"));
  }, POLL_INTERVAL_MS).unref();
  logger.info(`Missed-lead SLA scheduler started (poll every ${POLL_INTERVAL_MS / 1000}s, ${SLA_MINUTES}min threshold)`);
}
