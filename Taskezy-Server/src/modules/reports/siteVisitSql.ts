// Shared SQL for counting site visits from followup_calls (alias `fc`).

/**
 * A follow-up row that is a site visit. Rows typed SITE_VISIT, plus older
 * CALLBACK rows created while the lead was in Site Visit Scheduled — the
 * call-feedback popup saved every next date as CALLBACK until the report
 * work (scheduleFollowupJob.ts), so a rescheduled visit from there looked
 * like a callback. The lead's status at the time comes from its latest
 * 'Status changed to "…"' log written before the row (status changes are
 * always saved before the follow-up is created).
 */
export const IS_SITE_VISIT_FOLLOWUP_SQL = `(fc.call_type = 'SITE_VISIT' OR (
  fc.call_type = 'CALLBACK' AND fc.lead_id IS NOT NULL AND (
    SELECT ll.message FROM lead_logs ll
    WHERE ll.lead_id = fc.lead_id AND ll.message LIKE 'Status changed to "%' AND ll.created_at <= fc.created_at
    ORDER BY ll.created_at DESC
    LIMIT 1
  ) = 'Status changed to "SITE_VISIT_SCHEDULED"'
))`;

/**
 * The task was missed at some point. status alone isn't enough: a later
 * reschedule marks the lead's older rows (MISSED included) COMPLETED, but
 * violation_notified_at (set by followupScheduler.ts when it flags the row
 * missed) stays.
 */
export const FOLLOWUP_EVER_MISSED_SQL = `(fc.status = 'MISSED' OR fc.violation_notified_at IS NOT NULL)`;

/**
 * A missed call's frozen record (alias `r`, migration 053) — r.agent_id is
 * the agent the call belonged to when it was missed. Agent-wise missed-task
 * counts use it instead of fc.assigned_to_id, which can change afterwards
 * (lead reassigned, agent removed), so a miss never moves to another agent.
 */
export const MISSED_BY_JOIN_SQL = `JOIN missed_lead_records r ON r.followup_call_id = fc.id AND r.miss_type = 'CALL'`;

/** Log line updateLeadStatus writes when a lead moves to Site Visit Done. */
export const SITE_VISIT_DONE_LOG = 'Status changed to "SITE_VISIT_DONE"';
