import { pool } from "../../db/pool";
import { logger } from "../../utils/logger";
import { publishToUser } from "../../utils/sseHub";
import { sendPushToUser } from "./push.service";

export interface CreateNotificationInput {
  system: "CRM" | "HRMS" | "FINANCE" | "ADMIN";
  category: "NEW_LEAD" | "REMINDER" | "REGULARIZATION" | "ATTENDANCE" | "LEAVE" | "INVOICE" | "CLAIM" | "KYC" | "GENERAL" | "REASSIGNMENT" | "MISSED_SLA";
  title: string;
  message: string;
  recipientUserId: string;
  leadId?: string;
  link?: string;
}

/** Inserts a notification row and, if the recipient has an open SSE stream, pushes it live. */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const { rows } = await pool.query(
    `INSERT INTO notifications (system, category, title, message, recipient_user_id, lead_id, link)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, system, category, title, message, read, lead_id, link, created_at`,
    [input.system, input.category, input.title, input.message, input.recipientUserId, input.leadId ?? null, input.link ?? null]
  );
  publishToUser(input.recipientUserId, "notification", rows[0]);
  if (input.recipientUserId) {
    sendPushToUser(input.recipientUserId, {
      title: input.title,
      body: input.message,
      link: input.link ?? null,
      notificationId: rows[0].id,
      category: input.category,
      system: input.system
    }).catch(() => {});
  }
}

// Lead-linked alerts that stay until someone acts on the lead (a status
// update), not until they're read. Every other notification is purely
// informational and is deleted as soon as its recipient reads it.
export const LEAD_ACTIVITY_CATEGORIES = ["REMINDER", "MISSED_SLA", "GENERAL", "REASSIGNMENT", "KYC"] as const;

// SQL condition matching an informational row — the negation of "lead-linked activity alert".
export const INFORMATIONAL_SQL = `NOT (lead_id IS NOT NULL AND category = ANY('{${LEAD_ACTIVITY_CATEGORIES.join(",")}}'::text[]))`;

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
    await pool.query(`DELETE FROM notifications WHERE lead_id = $1 AND category = ANY($2::text[])`, [leadId, categories]);
  } catch (err) {
    logger.warn({ errCode: (err as { code?: string }).code, leadId }, "Could not delete a lead's activity notifications");
  }
}

/** Runs a notification DELETE, returning the deleted count, or 0 if it failed (logged, never thrown). */
export async function tryDeleteNotifications(sql: string, params: unknown[]): Promise<number> {
  try {
    const { rowCount } = await pool.query(sql, params);
    return rowCount ?? 0;
  } catch (err) {
    logger.warn({ errCode: (err as { code?: string }).code }, "Could not delete notifications");
    return 0;
  }
}
