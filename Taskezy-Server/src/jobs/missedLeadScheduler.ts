import { pool } from "../db/pool";
import { logger } from "../utils/logger";
import { createNotification } from "../modules/notifications/notifications.service";
import { listActiveAdminIds } from "../modules/users/users.repository";
import { broadcastDataChanged } from "../utils/dataChanged";
import { missedRecordIdsLink } from "../modules/notifications/notificationLinks";
import { INSERT_LEAD_MISS_RECORDS_SQL } from "../modules/missed-records/missedRecords.sql";

const POLL_INTERVAL_MS = 60_000;
const SLA_MINUTES = 20; // matches Reports' isMissedLead / getMissedInfo rule (reportMetrics.ts)

interface MissedLead {
  id: string;
  name: string;
  assigned_agent_id: string;
  agent_name: string;
  manager_id: string | null;
  /** Its frozen missed_lead_records row (migration 053), saved in the same statement. */
  record_id: string;
  /** The claim's now() — every lead in this run shares it as missed_at. */
  missed_at: Date;
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
  // Claim-before-send, not send-before-claim: folding the candidate SELECT
  // and the missed_notified_at UPDATE into one statement means Postgres
  // row-locks the claim itself, so two overlapping runs can never both pick
  // up the same lead the way a separate SELECT-then-UPDATE could. The
  // tradeoff is that if the process crashes after this claim commits but
  // before a notification actually sends, that one reminder is silently
  // missed — low cost, one-time — versus the alternative of risking
  // duplicate sends, which is the wrong tradeoff for a notification system:
  // duplicates erode trust and train users to ignore alerts.
  //
  // The same statement saves each lead's frozen missed record
  // (missed-records/missedRecords.sql.ts), so a claimed miss always has one.
  const { rows } = await pool.query<MissedLead>(
    `WITH claimed AS (
     UPDATE leads l
     SET missed_notified_at = now()
     FROM users u
     WHERE u.id = l.assigned_agent_id
       AND l.first_response_at IS NULL
       AND l.assigned_at IS NOT NULL
       AND l.assigned_at <= now() - interval '${SLA_MINUTES} minutes'
       AND l.missed_notified_at IS NULL
       AND l.source <> 'Bulk Upload'
     RETURNING l.id, l.name, l.assigned_agent_id,
               u.first_name || COALESCE(' ' || u.last_name, '') AS agent_name,
               u.manager_id
     ), rec AS (${INSERT_LEAD_MISS_RECORDS_SQL})
     SELECT c.*, rec.id AS record_id, now() AS missed_at FROM claimed c JOIN rec ON rec.lead_id = c.id`
  );
  if (rows.length === 0) return;
  broadcastDataChanged("leads");

  // Escalation always reaches Admin, not just the agent's direct manager —
  // an agent with no manager_id set (manager_id IS NULL) would otherwise
  // have their missed SLA go completely unescalated, seen by no one but
  // themselves. Mirrors followupScheduler.ts's SLA-violation escalation,
  // which always notifies every active admin for the same reason.
  const adminIds = await listActiveAdminIds();

  // Grouped by recipient BEFORE any createNotification call — one notification
  // per recipient per poll cycle, not one per (lead x recipient) pair. Without
  // this, an agent (or an escalated manager/admin) with 3 leads crossing the
  // threshold in the same ~60s cycle got 3 separate notifications/pushes;
  // the frontend's sound debounce only coalesces playback on an already-open
  // tab, it can't fix 3 separate bell entries or 3 separate OS push popups.
  const leadsByAgent = new Map<string, MissedLead[]>();
  for (const row of rows) {
    const list = leadsByAgent.get(row.assigned_agent_id) ?? [];
    list.push(row);
    leadsByAgent.set(row.assigned_agent_id, list);
  }

  const quoteList = (leads: MissedLead[]) => leads.map(l => `"${l.name}"`).join(", ");

  for (const [agentId, leads] of leadsByAgent) {
    const title = leads.length === 1 ? "Lead Missed SLA" : `${leads.length} Leads Missed SLA`;
    await createNotification({
      system: "CRM",
      category: "MISSED_SLA",
      title,
      message: leads.length === 1
        ? `"${leads[0].name}" has had no response within ${SLA_MINUTES} minutes of assignment.`
        : `${leads.length} leads have had no response within ${SLA_MINUTES} minutes of assignment: ${quoteList(leads)}.`,
      recipientUserId: agentId,
      leadId: leads.length === 1 ? leads[0].id : undefined,
      // Opens the frozen record(s) of these misses — the leads as they were then.
      link: missedRecordIdsLink(title, leads.map(l => l.record_id), "LEAD", leads[0].missed_at, agentId)
    });
  }

  // Escalation: manager (if any) + every active admin, per agent, deduplicated
  // against the agent themselves — grouped the same way, by recipient -> agent
  // -> their leads this cycle, so one admin notifying 3 different agents'
  // misses in one cycle still gets just one notification, not three.
  const escalationByRecipient = new Map<string, Map<string, MissedLead[]>>();
  for (const [agentId, leads] of leadsByAgent) {
    const escalationRecipients = new Set<string>(adminIds);
    const managerId = leads[0].manager_id;
    if (managerId) escalationRecipients.add(managerId);
    escalationRecipients.delete(agentId);

    for (const recipientId of escalationRecipients) {
      let byAgent = escalationByRecipient.get(recipientId);
      if (!byAgent) { byAgent = new Map(); escalationByRecipient.set(recipientId, byAgent); }
      byAgent.set(agentId, leads);
    }
  }

  for (const [recipientId, byAgent] of escalationByRecipient) {
    const agentGroups = [...byAgent.values()];
    const totalLeads = agentGroups.reduce((sum, leads) => sum + leads.length, 0);
    const parts = agentGroups.map(leads =>
      leads.length === 1
        ? `${leads[0].agent_name} hasn't responded to "${leads[0].name}"`
        : `${leads[0].agent_name} hasn't responded to ${leads.length} leads (${quoteList(leads)})`
    );
    // One agent in this escalation -> the too-many-ids fallback link narrows
    // to them (missedRecordIdsLink).
    const [singleAgentId] = byAgent.size === 1 ? [...byAgent.keys()] : [];
    // Exactly one lead named in the message: the notification stays tied to
    // that lead (its lifecycle), but a click opens its frozen record.
    const singleLeadId = totalLeads === 1 ? agentGroups[0][0].id : undefined;
    const title = totalLeads === 1 ? "Team Lead Missed SLA" : `${totalLeads} Team Leads Missed SLA`;
    await createNotification({
      system: "CRM",
      category: "MISSED_SLA",
      title,
      message: `${parts.join("; ")} within ${SLA_MINUTES} minutes.`,
      recipientUserId: recipientId,
      leadId: singleLeadId,
      link: missedRecordIdsLink(title, agentGroups.flat().map(l => l.record_id), "LEAD", agentGroups[0][0].missed_at, singleAgentId)
    });
  }
  // Admins are already covered above: they're in escalationRecipients for
  // every agent's misses, so they get a real-time notification naming the
  // specific lead(s) the moment each one crosses the threshold. A separate
  // "Missed Leads Today: N" running-total digest used to fire here too, on
  // every cycle that found a new miss — a growing pile of near-duplicate
  // notifications restating an incrementing count with no lead names,
  // directly on top of the specific ones above. Moved to
  // eodReportScheduler.ts's notifyAdminMissedLeadsDigest — same query and
  // message, fired once at each admin's own EOD time instead of live.
}

/**
 * The atomic UPDATE...RETURNING claim in notifyMissedLeads() already gives
 * DB-level locking that's safe across multiple separate processes (Postgres
 * row-locks the UPDATE statement itself, so two instances polling at once
 * can't double-claim the same lead). The `running` guard below closes the
 * other gap — a single process whose cycle runs long enough to still be in
 * flight when the next setInterval tick fires — which is exploitable today
 * even with no second instance in the picture.
 */
export function startMissedLeadScheduler(): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await notifyMissedLeads().catch((err) => logger.error({ err }, "Missed-lead SLA poll failed"));
    } finally {
      running = false;
    }
  };
  setInterval(tick, POLL_INTERVAL_MS).unref();
  logger.info(`Missed-lead SLA scheduler started (poll every ${POLL_INTERVAL_MS / 1000}s, ${SLA_MINUTES}min threshold)`);
}
