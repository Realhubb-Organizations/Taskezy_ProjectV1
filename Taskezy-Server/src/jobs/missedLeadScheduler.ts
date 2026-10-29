import { pool } from "../db/pool";
import { logger } from "../utils/logger";
import { createNotification } from "../modules/notifications/notifications.service";
import { listActiveAdminIds } from "../modules/users/users.repository";
import { BUSINESS_TIMEZONE } from "../utils/businessDate";

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
  // Claim-before-send, not send-before-claim: folding the candidate SELECT
  // and the missed_notified_at UPDATE into one statement means Postgres
  // row-locks the claim itself, so two overlapping runs can never both pick
  // up the same lead the way a separate SELECT-then-UPDATE could. The
  // tradeoff is that if the process crashes after this claim commits but
  // before a notification actually sends, that one reminder is silently
  // missed — low cost, one-time — versus the alternative of risking
  // duplicate sends, which is the wrong tradeoff for a notification system:
  // duplicates erode trust and train users to ignore alerts.
  const { rows } = await pool.query<MissedLead>(
    `UPDATE leads l
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
               u.manager_id`
  );
  if (rows.length === 0) return;

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
    await createNotification({
      system: "CRM",
      category: "MISSED_SLA",
      title: leads.length === 1 ? "Lead Missed SLA" : `${leads.length} Leads Missed SLA`,
      message: leads.length === 1
        ? `"${leads[0].name}" has had no response within ${SLA_MINUTES} minutes of assignment.`
        : `${leads.length} leads have had no response within ${SLA_MINUTES} minutes of assignment: ${quoteList(leads)}.`,
      recipientUserId: agentId,
      leadId: leads.length === 1 ? leads[0].id : undefined,
      link: "/dashboard/crm"
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
    // One agent in this escalation -> deep-link straight to their Sales
    // Agent Report instead of the generic Reports landing page. Several
    // agents at once has no single agent to land on, so that case keeps
    // the plain link.
    const [singleAgentId] = byAgent.size === 1 ? [...byAgent.keys()] : [];
    await createNotification({
      system: "CRM",
      category: "MISSED_SLA",
      title: totalLeads === 1 ? "Team Lead Missed SLA" : `${totalLeads} Team Leads Missed SLA`,
      message: `${parts.join("; ")} within ${SLA_MINUTES} minutes.`,
      recipientUserId: recipientId,
      link: singleAgentId ? `/dashboard/reports?tab=agent&agentId=${singleAgentId}` : "/dashboard/reports"
    });
  }

  // Admin also gets a running same-day total whenever it changes — a
  // per-lead ping tells them *that* something was missed, this tells them
  // *how much* has piled up today across the whole team, which per-lead
  // pings alone don't answer. Fires once per poll cycle that actually found
  // new misses (not every cycle), so it updates live through the day without
  // spamming a fresh notification every 60s when nothing's changed.
  await notifyAdminDailyDigest(adminIds);
}

interface DailyMissedRow {
  agent_id: string;
  agent_name: string;
  manager_name: string | null;
  missed_count: string;
}

async function notifyAdminDailyDigest(adminIds: string[]): Promise<void> {
  const { rows } = await pool.query<DailyMissedRow>(
    `SELECT u.id AS agent_id, u.first_name || COALESCE(' ' || u.last_name, '') AS agent_name,
            m.first_name || COALESCE(' ' || m.last_name, '') AS manager_name,
            count(*) AS missed_count
     FROM leads l
     JOIN users u ON u.id = l.assigned_agent_id
     LEFT JOIN users m ON m.id = u.manager_id
     WHERE (l.missed_notified_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date
     GROUP BY u.id, u.first_name, u.last_name, m.first_name, m.last_name
     ORDER BY count(*) DESC`,
    [BUSINESS_TIMEZONE]
  );
  if (rows.length === 0) return;

  const total = rows.reduce((sum, r) => sum + Number(r.missed_count), 0);
  const breakdown = rows
    .map(r => `${r.agent_name}: ${r.missed_count}${r.manager_name ? ` (${r.manager_name}'s team)` : ""}`)
    .join(" · ");
  // Today's misses are all one agent -> land the admin straight on that
  // agent's Sales Agent Report, same as the per-agent escalation above.
  const link = rows.length === 1 ? `/dashboard/reports?tab=agent&agentId=${rows[0].agent_id}` : "/dashboard/reports";

  for (const adminId of adminIds) {
    await createNotification({
      system: "CRM",
      category: "REMINDER",
      title: `Missed Leads Today: ${total}`,
      message: `${total} missed lead${total === 1 ? "" : "s"} today across ${rows.length} agent${rows.length === 1 ? "" : "s"} — ${breakdown}`,
      recipientUserId: adminId,
      link
    });
  }
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
