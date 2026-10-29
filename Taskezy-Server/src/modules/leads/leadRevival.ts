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
            CASE WHEN l.phone = $1 THEN 'phone' ELSE 'email' END AS matched_by
     FROM leads l
     JOIN users u ON u.id = l.assigned_agent_id
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
 */
export async function markLeadRevived(match: RevivalMatch, sourceLabel: string): Promise<void> {
  await withTransaction(async (client) => {
    await insertLeadLog(
      client,
      match.id,
      match.assigned_agent_id,
      sourceLabel,
      `Revived — a new ${sourceLabel} submission matched this lead by ${match.matched_by}; no duplicate lead was created.`
    );
  });

  const recipients = new Set<string>(await listActiveAdminIds());
  if (match.manager_id) recipients.add(match.manager_id);
  recipients.add(match.assigned_agent_id);

  for (const recipientId of recipients) {
    await createNotification({
      system: "CRM",
      category: "GENERAL",
      title: "Revived Lead",
      message: `"${match.name}" revived lead received — a new ${sourceLabel} submission matched this existing lead (assigned to ${match.assigned_agent_name}).`,
      recipientUserId: recipientId,
      leadId: match.id,
      link: "/dashboard/crm"
    });
  }
}
