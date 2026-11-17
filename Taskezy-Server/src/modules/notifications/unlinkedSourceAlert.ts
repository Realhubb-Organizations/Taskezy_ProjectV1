import { query } from "../../db/pool";
import { logger } from "../../utils/logger";
import { BUSINESS_TIMEZONE } from "../../utils/businessDate";
import { listActiveAdminIds } from "../users/users.repository";
import { createNotification } from "./notifications.service";
import { leadIdsLink } from "./notificationLinks";

const IMPORTED_SHEET_NAME_SQL = "^Imported from Google Ads lead-form sheet \\(([^)]+)\\)";

/**
 * Tells admins, in the bell's Reminder Alerts tab, that leads are arriving
 * from a Meta campaign or Google sheet tab that isn't linked to any property,
 * so they're sitting Unassigned on an admin instead of reaching a sales team.
 * At most one alert per campaign/tab per business day: the first unrouted
 * lead of the day triggers it, later ones that day don't (the property
 * page's "Leads waiting" panel always shows the live list). Stops by itself
 * once the campaign/tab is linked, because its leads route normally then.
 *
 * Never throws: an alert failing must not affect the lead that was just saved.
 */
export async function alertUnlinkedSource(kind: "meta-campaign" | "sheet-tab", name: string): Promise<void> {
  try {
    const title = kind === "meta-campaign" ? `Meta campaign not linked: ${name}` : `Google sheet not linked: ${name}`;

    // ponytail: two leads arriving in the same instant could both pass this
    // check and send the alert twice; rare and harmless. Add an advisory lock
    // if it ever shows up in practice.
    const { rows: sent } = await query<{ n: string }>(
      `SELECT count(*) AS n FROM notifications
       WHERE category = 'REMINDER' AND title = $1
         AND created_at >= (date_trunc('day', now() AT TIME ZONE $2) AT TIME ZONE $2)`,
      [title, BUSINESS_TIMEZONE]
    );
    if (Number(sent[0]?.n ?? 0) > 0) return;

    // Every lead from this campaign/tab still waiting Unassigned on an admin
    // (same safeguards as the property page's waiting-leads list).
    const { rows: waiting } = await query<{ id: string }>(
      kind === "meta-campaign"
        ? `SELECT l.id FROM leads l JOIN users u ON u.id = l.assigned_agent_id
           WHERE l.status_code = 'UNASSIGNED' AND u.role = 'ADMIN' AND l.created_at > now() - interval '30 days'
             AND l.source = 'Meta Ads' AND l.sheet_lead_key IS NULL AND l.campaign = $1
           ORDER BY l.created_at`
        : `SELECT l.id FROM leads l JOIN users u ON u.id = l.assigned_agent_id
           WHERE l.status_code = 'UNASSIGNED' AND u.role = 'ADMIN' AND l.created_at > now() - interval '30 days'
             AND l.sheet_lead_key IS NOT NULL
             AND (SELECT substring(g.message from $2) FROM lead_logs g
                  WHERE g.lead_id = l.id AND g.message LIKE 'Imported from Google Ads lead-form sheet (%'
                  ORDER BY g.created_at ASC LIMIT 1) = $1
           ORDER BY l.created_at`,
      kind === "meta-campaign" ? [name] : [name, IMPORTED_SHEET_NAME_SQL]
    );
    if (waiting.length === 0) return;

    const count = waiting.length;
    const what = kind === "meta-campaign" ? "Meta campaign" : "Google sheet tab";
    const message =
      `${count} lead${count === 1 ? "" : "s"} from the ${what} "${name}" ${count === 1 ? "is" : "are"} waiting Unassigned on an admin ` +
      `because it isn't linked to any property. Link it on the property's page and they'll go to that property's team automatically.`;
    const link = leadIdsLink(title, waiting.map(l => l.id), "/dashboard/properties");

    for (const adminId of await listActiveAdminIds()) {
      await createNotification({ system: "CRM", category: "REMINDER", title, message, recipientUserId: adminId, link });
    }
  } catch (err) {
    logger.error({ err, kind, name }, "Unlinked campaign/sheet alert failed");
  }
}
