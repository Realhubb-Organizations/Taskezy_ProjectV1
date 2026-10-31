import { pool } from "../db/pool";
import { logger } from "../utils/logger";
import { createNotification } from "../modules/notifications/notifications.service";
import { listActiveAdminIds } from "../modules/users/users.repository";

const POLL_INTERVAL_MS = 10 * 60_000; // housekeeping, not a live SLA — 10 minutes is plenty
const STUCK_THRESHOLD_MINUTES = 20;

interface StuckCall {
  id: string;
  lead_id: string | null;
  lead_name: string | null;
  caller_user_id: string;
  caller_name: string;
  manager_id: string | null;
  channel: string;
}

/**
 * CallFeedbackGate (the mandatory call/WhatsApp feedback popup) is
 * deliberately unclosable until the agent successfully submits it — every
 * known way to get permanently stuck there has been fixed (the 5-minute
 * scheduling conflict's missing escape valve, the API layer's missing
 * timeout, same-lead duplicate scheduling, past-date scheduling — see the
 * 2026-10-31 commits), but this is the backstop: if an agent is EVER stuck
 * on it for more than 20 minutes, for ANY reason, including one not yet
 * discovered, their manager and every admin get notified automatically —
 * so nobody has to rely on the agent complaining or someone happening to
 * open the rescue panel. Today's incident had agents stuck for 4+ hours
 * before anyone noticed; this closes that gap regardless of root cause.
 *
 * At most one PENDING_FEEDBACK row can exist per agent at a time (see
 * call_attempts' own partial index), so there's no "group multiple per
 * agent" complexity needed the way missedLeadScheduler.ts has — one row
 * here is already one agent's one stuck call.
 *
 * stuck_notified_at (migration 049) is a one-shot marker, same pattern as
 * leads.missed_notified_at / followup_calls.due_notified_at — the claim
 * UPDATE both finds candidates and marks them in one atomic statement, so
 * two overlapping poll cycles (or process instances) can't double-notify.
 */
async function notifyStuckCalls(): Promise<void> {
  const { rows } = await pool.query<StuckCall>(
    `UPDATE call_attempts ca
     SET stuck_notified_at = now()
     FROM users u
     LEFT JOIN leads l ON l.id = ca.lead_id
     WHERE u.id = ca.caller_user_id
       AND ca.status = 'PENDING_FEEDBACK'
       AND ca.stuck_notified_at IS NULL
       AND ca.created_at <= now() - interval '${STUCK_THRESHOLD_MINUTES} minutes'
     RETURNING ca.id, ca.lead_id, l.name AS lead_name, ca.caller_user_id,
               u.first_name || COALESCE(' ' || u.last_name, '') AS caller_name,
               u.manager_id, ca.channel`
  );
  if (rows.length === 0) return;

  const adminIds = await listActiveAdminIds();

  for (const row of rows) {
    const recipients = new Set<string>(adminIds);
    if (row.manager_id) recipients.add(row.manager_id);
    const channelLabel = row.channel === "WHATSAPP" ? "WhatsApp" : "call";
    for (const recipientId of recipients) {
      await createNotification({
        system: "CRM",
        category: "REMINDER",
        title: "Agent stuck on call feedback",
        message: `${row.caller_name} has been stuck on the ${channelLabel}-feedback popup for "${row.lead_name ?? "a lead"}" for over ${STUCK_THRESHOLD_MINUTES} minutes. Use the Stuck Calls panel to unblock them.`,
        recipientUserId: recipientId,
        link: "/dashboard/crm"
      });
    }
  }
  logger.warn({ count: rows.length }, "Stuck call-feedback alert(s) sent");
}

export function startStuckCallScheduler(): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await notifyStuckCalls().catch((err) => logger.error({ err }, "Stuck-call poll failed"));
    } finally {
      running = false;
    }
  };
  setInterval(tick, POLL_INTERVAL_MS).unref();
  logger.info(`Stuck-call scheduler started (poll every ${POLL_INTERVAL_MS / 1000}s, ${STUCK_THRESHOLD_MINUTES}min threshold)`);
}
