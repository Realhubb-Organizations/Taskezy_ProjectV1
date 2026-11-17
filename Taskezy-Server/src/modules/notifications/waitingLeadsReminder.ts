import { query } from "../../db/pool";
import { BUSINESS_TIMEZONE } from "../../utils/businessDate";
import { getAssignmentPool, findById as findPropertyById } from "../properties/properties.repository";
import { createNotification } from "./notifications.service";
import { leadIdsLink } from "./notificationLinks";

const IMPORTED_SHEET_NAME_SQL = "^Imported from Google Ads lead-form sheet \\(([^)]+)\\)";
const MAX_GROUPS_IN_MESSAGE = 5;

export type ReminderSlot = "morning" | "evening";
const SLOT_PREFIX: Record<ReminderSlot, string> = { morning: "Morning", evening: "End of day" };

interface WaitingRow {
  id: string;
  from_sheet: boolean;
  campaign: string | null;
  tab: string | null;
  property_id: string | null;
}

interface WaitingGroup {
  label: string;
  leadIds: string[];
}

/**
 * Every Meta / Google sheet lead still waiting Unassigned on an admin (last 30
 * days, nobody has worked it — same safeguards as the property page's
 * waiting list), grouped by why it's waiting:
 *  - its Meta campaign isn't linked to any property;
 *  - its Google sheet tab / campaign isn't linked to any property;
 *  - it's linked to a property that has no active sales team;
 *  - it's linked to a property with a team but hasn't been assigned yet.
 * Largest group first.
 */
export async function summarizeWaitingLeads(): Promise<{ total: number; groups: WaitingGroup[]; leadIds: string[] }> {
  const { rows } = await query<WaitingRow>(
    `SELECT l.id, (l.sheet_lead_key IS NOT NULL) AS from_sheet, l.campaign, t.tab,
            COALESCE(
              l.property_id,
              CASE WHEN l.sheet_lead_key IS NULL
                   THEN (SELECT property_id FROM property_meta_campaigns WHERE campaign_name = l.campaign)
                   ELSE COALESCE(
                     (SELECT property_id FROM property_google_campaigns WHERE campaign_name = l.campaign),
                     (SELECT property_id FROM property_sheet_sources WHERE sheet_source_name = t.tab))
              END
            ) AS property_id
     FROM leads l
     JOIN users u ON u.id = l.assigned_agent_id
     LEFT JOIN LATERAL (
       SELECT substring(g.message from $1) AS tab FROM lead_logs g
       WHERE g.lead_id = l.id AND g.message LIKE 'Imported from Google Ads lead-form sheet (%'
       ORDER BY g.created_at ASC LIMIT 1
     ) t ON true
     WHERE l.status_code = 'UNASSIGNED' AND u.role = 'ADMIN'
       AND l.created_at > now() - interval '30 days'
       AND (l.source = 'Meta Ads' OR l.sheet_lead_key IS NOT NULL)
     ORDER BY l.created_at`,
    [IMPORTED_SHEET_NAME_SQL]
  );

  const groups = new Map<string, WaitingGroup>();
  const add = (key: string, label: string, id: string) => {
    const g = groups.get(key) ?? { label, leadIds: [] };
    g.leadIds.push(id);
    groups.set(key, g);
  };

  const propertyInfo = new Map<string, { name: string; hasTeam: boolean }>();
  for (const row of rows) {
    if (!row.property_id) {
      if (row.from_sheet) {
        const name = row.tab ?? row.campaign ?? "unknown sheet";
        add(`sheet:${name}`, `Google sheet "${name}" isn't linked to any property`, row.id);
      } else {
        const name = row.campaign ?? "no campaign name";
        add(`meta:${name}`, `Meta campaign "${name}" isn't linked to any property`, row.id);
      }
      continue;
    }
    if (!propertyInfo.has(row.property_id)) {
      const [property, pool] = await Promise.all([findPropertyById(row.property_id), getAssignmentPool(row.property_id)]);
      propertyInfo.set(row.property_id, { name: property?.name ?? "A property", hasTeam: !!pool && pool.pool.length > 0 });
    }
    const info = propertyInfo.get(row.property_id)!;
    if (info.hasTeam) add(`ready:${row.property_id}`, `"${info.name}" is linked; assign them from its page`, row.id);
    else add(`noteam:${row.property_id}`, `"${info.name}" is linked but has no active sales team`, row.id);
  }

  const sorted = [...groups.values()].sort((a, b) => b.leadIds.length - a.leadIds.length);
  return { total: rows.length, groups: sorted, leadIds: rows.map(r => r.id) };
}

/** Whether this admin already got this slot's reminder today (business day). */
async function alreadySentToday(adminId: string, slot: ReminderSlot): Promise<boolean> {
  const { rows } = await query<{ n: string }>(
    `SELECT count(*) AS n FROM notifications
     WHERE recipient_user_id = $1 AND category = 'REMINDER' AND title LIKE $2
       AND created_at >= (date_trunc('day', now() AT TIME ZONE $3) AT TIME ZONE $3)`,
    [adminId, `${SLOT_PREFIX[slot]}: % waiting to be assigned`, BUSINESS_TIMEZONE]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * Sends one admin the "N leads waiting to be assigned" reminder (Reminder
 * Alerts) for this slot, at most once per admin per slot per business day,
 * and only when something is waiting. Pass a precomputed `summary` when
 * sending to several admins in one run.
 */
export async function sendWaitingLeadsReminder(
  adminId: string,
  slot: ReminderSlot,
  summary?: Awaited<ReturnType<typeof summarizeWaitingLeads>>
): Promise<boolean> {
  const s = summary ?? (await summarizeWaitingLeads());
  if (s.total === 0) return false;
  if (await alreadySentToday(adminId, slot)) return false;

  const title = `${SLOT_PREFIX[slot]}: ${s.total} lead${s.total === 1 ? "" : "s"} waiting to be assigned`;
  const shown = s.groups.slice(0, MAX_GROUPS_IN_MESSAGE).map(g => `${g.label}: ${g.leadIds.length}`);
  const more = s.groups.length - shown.length;
  const message = shown.join(" · ") + (more > 0 ? ` · and ${more} more` : "");

  await createNotification({
    system: "CRM",
    category: "REMINDER",
    title,
    message,
    recipientUserId: adminId,
    link: leadIdsLink(title, s.leadIds, "/dashboard/properties")
  });
  return true;
}
