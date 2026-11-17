import { PoolClient } from "pg";
import { query, withTransaction } from "../../db/pool";
import { createNotification } from "../notifications/notifications.service";
import { listActiveAdminIds } from "../users/users.repository";
import { REVIVABLE_STATUS_CODES, REVIVED_CODE } from "./leadStatusTransitions";
import { broadcastLeadChanged } from "./leads.realtime";

export interface RevivalMatch {
  id: string;
  name: string;
  assigned_agent_id: string;
  assigned_agent_name: string;
  manager_id: string | null;
  matched_by: "phone" | "email";
  property_id: string | null;
  property_name: string | null;
}

/**
 * Adds one Activity History entry for a revival. Uses the actual write time
 * (clock_timestamp) rather than the transaction's start time, so the 2–3
 * entries one revival writes always show in the order they were written —
 * revival note, then status change, then "moved from Data Calling".
 */
async function insertRevivalLog(client: PoolClient, leadId: string, userId: string, userName: string, message: string): Promise<void> {
  await client.query(
    `INSERT INTO lead_logs (lead_id, user_id, user_name_snapshot, message, created_at) VALUES ($1, $2, $3, $4, clock_timestamp())`,
    [leadId, userId, userName, message]
  );
}

/** Data Calling leads are the ones still carrying the bulk-upload source. */
const DATA_CALLING_SOURCE = "Bulk Upload";
/** Same source a Connected + Qualified Data Calling promotion sets (leads.service.ts). */
const PROMOTED_DATA_CALLING_SOURCE = "Data";

/**
 * Sets the lead to Revived Lead when it's cold/closed (REVIVABLE_STATUS_CODES)
 * or still in Data Calling — in which case it also moves onto the Leads page,
 * the same way a qualified promotion does. Restarts the response clock like a
 * new lead (Pending Tasks, 20-minute missed-lead check, first response), and
 * records when and how often it was revived. Leads already being worked are
 * left exactly as they are. Nothing in the lead's history is changed or
 * removed — the caller only adds entries. The row lock keeps two enquiries
 * arriving together from reviving it twice.
 */
async function reviveLeadStatus(client: PoolClient, leadId: string): Promise<{ revived: boolean; movedFromDataCalling: boolean }> {
  const { rows } = await client.query<{ old_status: string; old_source: string | null }>(
    `WITH old AS (SELECT id, status_code, source FROM leads WHERE id = $1 FOR UPDATE)
     UPDATE leads l
     SET status_code = $2,
         source = CASE WHEN old.source = $4 THEN $5 ELSE l.source END,
         revived_at = now(),
         revival_count = l.revival_count + 1,
         assigned_at = now(),
         first_response_at = NULL,
         missed_notified_at = NULL
     FROM old
     WHERE l.id = old.id
       AND (old.status_code = ANY($3::text[]) OR old.source = $4)
     RETURNING old.status_code AS old_status, old.source AS old_source`,
    [leadId, REVIVED_CODE, REVIVABLE_STATUS_CODES, DATA_CALLING_SOURCE, PROMOTED_DATA_CALLING_SOURCE]
  );
  const row = rows[0];
  return { revived: !!row, movedFromDataCalling: row?.old_source === DATA_CALLING_SOURCE };
}

/**
 * Looks for an existing lead with the same phone, or (only when an email
 * is actually given) the same email, case-insensitive — used by the Meta/
 * Google ingest paths to avoid creating a true duplicate when the same
 * prospect submits another lead form. Name is deliberately NOT matched on
 * — too many real people share a common name, and a false match there
 * would wrongly suppress a genuinely new lead.
 */
export async function findLeadForRevival(phone: string, email?: string | null): Promise<RevivalMatch | undefined> {
  const conditions = ["l.phone = $1"];
  const params: unknown[] = [phone];
  if (email) {
    params.push(email);
    conditions.push(`lower(l.email) = lower($${params.length})`);
  }
  const { rows } = await query<RevivalMatch>(
    `SELECT l.id, l.name, l.assigned_agent_id,
            u.first_name || COALESCE(' ' || u.last_name, '') AS assigned_agent_name,
            u.manager_id,
            CASE WHEN l.phone = $1 THEN 'phone' ELSE 'email' END AS matched_by,
            l.property_id, p.name AS property_name
     FROM leads l
     JOIN users u ON u.id = l.assigned_agent_id
     LEFT JOIN properties p ON p.id = l.property_id
     WHERE ${conditions.join(" OR ")}
     LIMIT 1`,
    params
  );
  return rows[0];
}

/**
 * Logs an Activity History note on the matched lead and notifies its
 * assigned agent, their manager (if any), and every active admin — instead
 * of a new lead being created. The existing lead's own owner is used as
 * the log's actor (a real user id is required; the display name is
 * overridden via user_name_snapshot, same convention the ingest files'
 * own reactive-duplicate notes already use).
 *
 * `newPropertyId` is whatever property this specific submission resolved
 * to (same campaign/sheet-source matching a fresh lead would use) — when
 * it's a real property different from the one already stored on the lead,
 * the note/notification name it explicitly (the lead's own property field
 * is deliberately left unchanged, per the user's choice — this only
 * affects what's shown, not what's stored).
 */
export async function markLeadRevived(match: RevivalMatch, sourceLabel: string, newPropertyId?: string): Promise<void> {
  let newPropertyName: string | undefined;
  if (newPropertyId && newPropertyId !== match.property_id) {
    const { rows } = await query<{ name: string }>(`SELECT name FROM properties WHERE id = $1`, [newPropertyId]);
    newPropertyName = rows[0]?.name;
  }

  const noteMessage = newPropertyName
    ? `Revived — a new ${sourceLabel} submission matched this lead by ${match.matched_by}, now enquiring about "${newPropertyName}"${match.property_name ? ` (previously "${match.property_name}")` : ""}; no duplicate lead was created.`
    : `Revived — a new ${sourceLabel} submission matched this lead by ${match.matched_by}; no duplicate lead was created.`;

  // History only grows: the revival note, then (when the status changes) a
  // standard status-change entry the Activity History timeline already
  // understands, and a plain note when it left Data Calling.
  await withTransaction(async (client) => {
    await insertRevivalLog(client, match.id, match.assigned_agent_id, sourceLabel, noteMessage);
    const { revived, movedFromDataCalling } = await reviveLeadStatus(client, match.id);
    if (revived) {
      await insertRevivalLog(client, match.id, match.assigned_agent_id, sourceLabel, `Status changed to "${REVIVED_CODE}"`);
    }
    if (movedFromDataCalling) {
      await insertRevivalLog(client, match.id, match.assigned_agent_id, sourceLabel, "Lead revived and moved from Data Calling to the main leads list.");
    }
  });
  broadcastLeadChanged(match.id);

  const recipients = new Set<string>(await listActiveAdminIds());
  if (match.manager_id) recipients.add(match.manager_id);
  recipients.add(match.assigned_agent_id);

  const notificationMessage = newPropertyName
    ? `"${match.name}" revived lead received for "${newPropertyName}" — a new ${sourceLabel} submission matched this existing lead (assigned to ${match.assigned_agent_name}).`
    : `"${match.name}" revived lead received — a new ${sourceLabel} submission matched this existing lead (assigned to ${match.assigned_agent_name}).`;

  for (const recipientId of recipients) {
    await createNotification({
      system: "CRM",
      // New Leads tab: a revived lead is worked like a new one.
      category: "NEW_LEAD",
      title: "Revived Lead",
      message: notificationMessage,
      recipientUserId: recipientId,
      leadId: match.id,
      link: "/dashboard/crm"
    });
  }
}
