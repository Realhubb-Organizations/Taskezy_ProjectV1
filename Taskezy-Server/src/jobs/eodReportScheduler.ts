import { pool } from "../db/pool";
import { logger } from "../utils/logger";
import { createNotification } from "../modules/notifications/notifications.service";
import { BUSINESS_TIMEZONE } from "../utils/businessDate";

const POLL_INTERVAL_MS = 5 * 60_000; // 5min — EOD doesn't need missedLeadScheduler's 60s granularity

interface DueUser {
  id: string;
  role: string;
  role_type: string | null;
  first_name: string;
  last_name: string | null;
}

/**
 * Fires once per user per business day, the moment the current time (in
 * BUSINESS_TIMEZONE) passes their effective EOD time — their own
 * eod_report_time override if set, else the tenant-wide default. Same
 * claim-before-send shape as missedLeadScheduler.ts: the UPDATE...RETURNING
 * both selects and marks the day's claim in one statement, so two
 * overlapping runs can't double-notify the same user, and
 * eod_notified_date (date-grained, not timestamp-grained) naturally allows
 * the next calendar day's run without a separate reset job.
 *
 * `role` is 'ADMIN'/'FINANCE'/'AGENT' (schema.sql's user_role enum) and
 * `role_type` is a separate 'MEMBER'/'MANAGER' dimension that doesn't
 * meaningfully apply outside the sales hierarchy — Admin's own role_type
 * is typically 'MEMBER' by default, not a distinct value, and Finance
 * users don't make CRM calls at all. So only role = 'ADMIN' (company
 * digest) or role = 'AGENT' (role_type decides Member-vs-Manager) are
 * claimed — Finance is excluded entirely, same exclusion precedent as
 * users.repository.ts's own `role_type IS DISTINCT FROM 'MANAGER' AND
 * role <> 'ADMIN'` branch.
 */
async function notifyEodReports(): Promise<void> {
  const { rows } = await pool.query<DueUser>(
    `UPDATE users u
     SET eod_notified_date = (now() AT TIME ZONE $1)::date
     FROM tenant_settings t
     WHERE u.status = 'ACTIVE'
       AND u.role IN ('ADMIN', 'AGENT')
       AND (now() AT TIME ZONE $1)::time >= COALESCE(u.eod_report_time, t.eod_report_time)
       AND (u.eod_notified_date IS NULL OR u.eod_notified_date < (now() AT TIME ZONE $1)::date)
     RETURNING u.id, u.role, u.role_type, u.first_name, u.last_name`,
    [BUSINESS_TIMEZONE]
  );
  if (rows.length === 0) return;

  for (const user of rows) {
    if (user.role === "ADMIN") await notifyAdminCompanyDigest(user.id);
    else if (user.role_type === "MANAGER") await notifyManagerTeamDigest(user.id);
    else await notifyAgentCallCount(user.id);
  }
}

async function notifyAgentCallCount(agentId: string): Promise<void> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM call_attempts
     WHERE caller_user_id = $1 AND channel = 'CALL'
       AND (started_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date`,
    [agentId, BUSINESS_TIMEZONE]
  );
  const count = Number(rows[0]?.count ?? 0);
  await createNotification({
    system: "CRM",
    category: "GENERAL",
    title: "End of Day Summary",
    message: `You made ${count} call${count === 1 ? "" : "s"} today.`,
    recipientUserId: agentId,
    link: "/dashboard/crm/data-calling"
  });
}

interface TeamCallRow {
  agent_name: string;
  call_count: string;
}

async function notifyManagerTeamDigest(managerId: string): Promise<void> {
  const { rows } = await pool.query<TeamCallRow>(
    `SELECT u.first_name || COALESCE(' ' || u.last_name, '') AS agent_name, count(ca.id) AS call_count
     FROM users u
     LEFT JOIN call_attempts ca ON ca.caller_user_id = u.id AND ca.channel = 'CALL'
       AND (ca.started_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date
     WHERE u.manager_id = $1 AND u.status = 'ACTIVE' AND u.role = 'AGENT'
     GROUP BY u.id, u.first_name, u.last_name
     ORDER BY count(ca.id) DESC`,
    [managerId, BUSINESS_TIMEZONE]
  );
  // No direct reports — nothing to summarize, not an empty notification.
  if (rows.length === 0) return;

  const total = rows.reduce((sum, r) => sum + Number(r.call_count), 0);
  const breakdown = rows.map(r => `${r.agent_name}: ${r.call_count}`).join(" · ");
  await createNotification({
    system: "CRM",
    category: "GENERAL",
    title: "Team End of Day Summary",
    message: `Your team made ${total} call${total === 1 ? "" : "s"} today — ${breakdown}`,
    recipientUserId: managerId,
    link: "/dashboard/reports"
  });
}

interface ManagerTeamTotal {
  manager_name: string;
  call_count: string;
}

/**
 * Company-wide digest for Admin — every manager's team total, one after
 * another ("Manager A's team: 123 calls, Manager B's team: 87 calls, ..."),
 * plus an "Unassigned" bucket for any agent with no manager_id, so the
 * grand total always reconciles to the real company-wide call count for
 * the day — same reasoning as missedLeadScheduler.ts's notifyAdminDailyDigest
 * (a running total, not just per-event pings).
 */
async function notifyAdminCompanyDigest(adminId: string): Promise<void> {
  const { rows: managerTotals } = await pool.query<ManagerTeamTotal>(
    `SELECT m.first_name || COALESCE(' ' || m.last_name, '') AS manager_name,
            count(ca.id) FILTER (WHERE ca.channel = 'CALL' AND (ca.started_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date) AS call_count
     FROM users m
     JOIN users u ON u.manager_id = m.id AND u.status = 'ACTIVE' AND u.role = 'AGENT'
     LEFT JOIN call_attempts ca ON ca.caller_user_id = u.id
     WHERE m.role_type = 'MANAGER' AND m.status = 'ACTIVE'
     GROUP BY m.id, m.first_name, m.last_name
     ORDER BY count(ca.id) FILTER (WHERE ca.channel = 'CALL' AND (ca.started_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date) DESC`,
    [BUSINESS_TIMEZONE]
  );

  const { rows: unassignedRows } = await pool.query<{ call_count: string }>(
    `SELECT count(ca.id) AS call_count
     FROM users u
     LEFT JOIN call_attempts ca ON ca.caller_user_id = u.id AND ca.channel = 'CALL'
       AND (ca.started_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date
     WHERE u.role = 'AGENT' AND u.role_type = 'MEMBER' AND u.manager_id IS NULL AND u.status = 'ACTIVE'`,
    [BUSINESS_TIMEZONE]
  );
  const unassignedCount = Number(unassignedRows[0]?.call_count ?? 0);

  // Nobody to report on at all (no managers with a team, no unassigned
  // agents either) — not the same as "zero calls today," which still gets
  // a digest, same as notifyManagerTeamDigest firing for a team that made
  // no calls as long as the team itself exists.
  if (managerTotals.length === 0 && unassignedCount === 0) return;

  const managerTotal = managerTotals.reduce((sum, r) => sum + Number(r.call_count), 0);
  const grandTotal = managerTotal + unassignedCount;

  const parts = managerTotals.map(r => `${r.manager_name}'s team: ${r.call_count}`);
  if (unassignedCount > 0) parts.push(`Unassigned: ${unassignedCount}`);

  await createNotification({
    system: "CRM",
    category: "GENERAL",
    title: `Company End of Day Summary: ${grandTotal} call${grandTotal === 1 ? "" : "s"}`,
    message: parts.join(" · "),
    recipientUserId: adminId,
    link: "/dashboard/reports"
  });
}

export function startEodReportScheduler(): void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await notifyEodReports().catch((err) => logger.error({ err }, "EOD report poll failed"));
    } finally {
      running = false;
    }
  };
  setInterval(tick, POLL_INTERVAL_MS).unref();
  logger.info(`EOD report scheduler started (poll every ${POLL_INTERVAL_MS / 1000}s)`);
}
