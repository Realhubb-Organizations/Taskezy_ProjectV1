import { query, withTransaction } from "../../db/pool";
import { insertLeadLog } from "./leads.repository";
import { createNotification } from "../notifications/notifications.service";
import { listActiveAdminIds } from "../users/users.repository";

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

  await withTransaction(async (client) => {
    await insertLeadLog(client, match.id, match.assigned_agent_id, sourceLabel, noteMessage);
  });

  const recipients = new Set<string>(await listActiveAdminIds());
  if (match.manager_id) recipients.add(match.manager_id);
  recipients.add(match.assigned_agent_id);

  const notificationMessage = newPropertyName
    ? `"${match.name}" revived lead received for "${newPropertyName}" — a new ${sourceLabel} submission matched this existing lead (assigned to ${match.assigned_agent_name}).`
    : `"${match.name}" revived lead received — a new ${sourceLabel} submission matched this existing lead (assigned to ${match.assigned_agent_name}).`;

  for (const recipientId of recipients) {
    await createNotification({
      system: "CRM",
      category: "GENERAL",
      title: "Revived Lead",
      message: notificationMessage,
      recipientUserId: recipientId,
      leadId: match.id,
      link: "/dashboard/crm"
    });
  }
}
