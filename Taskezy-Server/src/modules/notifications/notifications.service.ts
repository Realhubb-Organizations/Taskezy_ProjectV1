import { pool } from "../../db/pool";
import { logger } from "../../utils/logger";
import { publishToUser, publishToAll } from "../../utils/sseHub";
import { sendPushToUser, sendPushToAllUsers } from "./push.service";

export interface CreateNotificationInput {
  system: "CRM" | "HRMS" | "FINANCE" | "ADMIN";
  category: "NEW_LEAD" | "REMINDER" | "REGULARIZATION" | "ATTENDANCE" | "LEAVE" | "INVOICE" | "CLAIM" | "KYC" | "GENERAL" | "REASSIGNMENT" | "MISSED_SLA";
  title: string;
  message: string;
  /** null = broadcast to every user (recipient_user_id IS NULL — see DATA_DICTIONARY.md), used by the Admin "Announce" feature. */
  recipientUserId: string | null;
  leadId?: string;
  link?: string;
}

/** Inserts a notification row and pushes it live — to one recipient, or to everyone if recipientUserId is null. */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const { rows } = await pool.query(
    `INSERT INTO notifications (system, category, title, message, recipient_user_id, lead_id, link)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, system, category, title, message, read, lead_id, link, created_at`,
    [input.system, input.category, input.title, input.message, input.recipientUserId, input.leadId ?? null, input.link ?? null]
  );
  const pushPayload = {
    title: input.title,
    body: input.message,
    link: input.link ?? null,
    notificationId: rows[0].id,
    category: input.category,
    system: input.system
  };
  if (input.recipientUserId) {
    publishToUser(input.recipientUserId, "notification", rows[0]);
    sendPushToUser(input.recipientUserId, pushPayload).catch(() => {});
  } else {
    publishToAll("notification", rows[0]);
    sendPushToAllUsers(pushPayload).catch(() => {});
  }
}

// Lead-linked alerts that stay until someone acts on the lead (a status
// update), not until they're read — deleteLeadActivityNotifications below
// clears these. Every other notification just gets marked read (read_at
// set) and stays visible for 48h — see notifications.routes.ts's GET "/"
// filter and notificationCleanupScheduler.ts for the actual cleanup.
export const LEAD_ACTIVITY_CATEGORIES = ["REMINDER", "MISSED_SLA", "GENERAL", "REASSIGNMENT", "KYC"] as const;

/**
 * Deletes a lead's activity alerts for every recipient (the agent and any
 * manager/admin escalation copies) once the lead has been acted on.
 * Best-effort and never throws: a failed cleanup (e.g. the DB role lacks
 * DELETE before migration 023's grant) must not fail the action that triggered it.
 */
export async function deleteLeadActivityNotifications(
  leadId: string,
  categories: readonly string[] = LEAD_ACTIVITY_CATEGORIES
): Promise<void> {
  try {
    await pool.query(`DELETE FROM notifications WHERE lead_id = $1 AND category::text = ANY($2::text[])`, [leadId, categories]);
  } catch (err) {
    logger.warn({ errCode: (err as { code?: string }).code, leadId }, "Could not delete a lead's activity notifications");
  }
}
