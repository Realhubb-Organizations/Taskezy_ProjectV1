import { pool } from "../../db/pool";
import { publishToUser } from "../../utils/sseHub";

export interface CreateNotificationInput {
  system: "CRM" | "HRMS" | "FINANCE" | "ADMIN";
  category: "NEW_LEAD" | "REMINDER" | "REGULARIZATION" | "ATTENDANCE" | "LEAVE" | "INVOICE" | "CLAIM" | "KYC" | "GENERAL";
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
}
