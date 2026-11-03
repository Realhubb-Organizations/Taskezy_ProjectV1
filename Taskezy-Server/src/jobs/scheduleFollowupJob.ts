import { pool } from "../db/pool";
import { logger } from "../utils/logger";
import { deleteLeadActivityNotifications, createNotification } from "../modules/notifications/notifications.service";
import { broadcastDataChanged } from "../utils/dataChanged";

const AGENT_CONFLICT_WINDOW_MS = 5 * 60 * 1000;

export interface ScheduleFollowupJobData {
  leadId: string;
  leadName: string;
  phone: string | null;
  assignedAgentId: string;
  scheduledAt: string; // ISO
  /** Left out by jobs queued before site visits were told apart = CALLBACK. */
  callType?: "CALLBACK" | "SITE_VISIT";
  rescheduleReason?: string;
}

/**
 * The scheduling half of closing a call-feedback attempt (CallFeedbackGate's
 * Save & Continue) — split out onto the background queue so the agent isn't
 * held waiting on it. The status/note save and closing the call attempt
 * itself stay synchronous (call-attempts.routes.ts's PATCH /:id, unchanged);
 * this only runs the "now go actually schedule the reminder" part after
 * the popup has already unlocked.
 *
 * Same-lead duplicates are already handled for free: inserting a new
 * followup_calls row for a lead always marks that lead's older pending
 * ones COMPLETED first (same block this mirrors from followups.routes.ts's
 * POST /) — there's no "ask the agent which one to keep" step needed here,
 * that was only ever a courtesy warning on top of behavior the DB already
 * made safe. A cross-lead clash (the agent already has a DIFFERENT lead
 * booked within 5 minutes) is caught in the popup before saving
 * (CallFeedbackGate, same check as the status popup). If one still gets
 * here (two saves at the same moment), the follow-up is created anyway and
 * the agent is told about the overlap — dropping it left the lead with no
 * scheduled call, so it showed as Pending and then Missed right after the
 * agent had just scheduled it.
 */
export async function processScheduleFollowup(data: ScheduleFollowupJobData): Promise<void> {
  const { leadId, leadName, phone, assignedAgentId, scheduledAt } = data;
  const newTime = new Date(scheduledAt).getTime();
  const dayStart = new Date(scheduledAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(scheduledAt);
  dayEnd.setHours(23, 59, 59, 999);

  const { rows: sameDayRows } = await pool.query<{ lead_id: string | null; lead_name: string; scheduled_at: string }>(
    `SELECT lead_id, lead_name, scheduled_at FROM followup_calls
     WHERE assigned_to_id = $1 AND status = 'UPCOMING' AND lead_id <> $2
       AND scheduled_at >= $3 AND scheduled_at <= $4`,
    [assignedAgentId, leadId, dayStart.toISOString(), dayEnd.toISOString()]
  );
  const conflict = sameDayRows.find(r => Math.abs(new Date(r.scheduled_at).getTime() - newTime) < AGENT_CONFLICT_WINDOW_MS);
  await pool.query(`UPDATE followup_calls SET status = 'COMPLETED' WHERE lead_id = $1 AND status <> 'COMPLETED'`, [leadId]);
  await deleteLeadActivityNotifications(leadId, ["REMINDER"]);
  // reschedule_reason only when given, so nothing else depends on migration 051.
  const reason = data.rescheduleReason || null;
  await pool.query(
    `INSERT INTO followup_calls (scheduled_at, lead_id, lead_name, phone, call_type, assigned_to_id${reason ? ", reschedule_reason" : ""})
     VALUES ($1, $2, $3, $4, $5, $6${reason ? ", $7" : ""})`,
    [scheduledAt, leadId, leadName, phone, data.callType ?? "CALLBACK", assignedAgentId, ...(reason ? [reason] : [])]
  );
  // After the insert: the lead's older reminder notifications were cleared just above.
  if (conflict) {
    await createNotification({
      system: "CRM",
      category: "REMINDER",
      title: "Two follow-ups close together",
      message: `"${leadName}" is scheduled within 5 minutes of your "${conflict.lead_name}" follow-up. You may want to move one of them.`,
      recipientUserId: assignedAgentId,
      leadId,
      link: "/dashboard/crm"
    });
    logger.info({ leadId, assignedAgentId }, "Background follow-up scheduled within 5 minutes of another lead's");
  }

  // This runs outside any route, so broadcastOnWrite never sees it — tell
  // open screens directly. Until now the lead counted as "due now" in
  // Pending Tasks (it had no scheduled call yet), and Next Call Date was blank.
  broadcastDataChanged("followups", "tasks");
}
