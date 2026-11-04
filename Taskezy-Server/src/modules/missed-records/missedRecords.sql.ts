import { FEEDBACK_PENDING_LOG_PREFIX } from "../call-attempts/feedbackLock";
import { TASK_DUE_AT_SQL } from "../tasks/taskDue";

// The frozen copy of a lead at the moment it's missed (migration 053,
// missed_lead_records). Each scheduler's claim UPDATE runs as a CTE named
// `claimed` and these INSERTs read from it, so the claim and its record
// commit together — a miss is never claimed without its record, or recorded
// twice. Inside one statement `leads l` is still the row as it was before
// the claim, which is exactly the moment being recorded.

const RECORD_COLUMNS = `
  miss_type, missed_at, lead_id, followup_call_id, lead_name, lead_phone, lead_email, status_code, call_status,
  call_sub_status, next_call_at, call_type, agent_id, agent_name, manager_id, manager_name, property_id,
  property_name, campaign, source, sub_source, feedback, notes, lead_created_at, assigned_at`;

const LATEST_FEEDBACK_JOIN = `
  LEFT JOIN LATERAL (
    SELECT message FROM lead_logs WHERE lead_id = l.id AND message NOT LIKE '${FEEDBACK_PENDING_LOG_PREFIX}%'
    ORDER BY created_at DESC LIMIT 1
  ) fb ON true`;

/**
 * A lead missed its 20-minute first response. `claimed` must return
 * id, assigned_agent_id, agent_name, manager_id (the lead's).
 */
export const INSERT_LEAD_MISS_RECORDS_SQL = `
  INSERT INTO missed_lead_records (${RECORD_COLUMNS})
  SELECT 'LEAD', now(), l.id, NULL, l.name, l.phone, l.email, l.status_code, l.call_status,
         l.call_sub_status, ${TASK_DUE_AT_SQL}, NULL, c.assigned_agent_id, c.agent_name, c.manager_id,
         m.first_name || COALESCE(' ' || m.last_name, ''), l.property_id,
         p.name, l.campaign, l.source, l.sub_source, fb.message, l.notes, l.created_at, l.assigned_at
  FROM claimed c
  JOIN leads l ON l.id = c.id
  LEFT JOIN users m ON m.id = c.manager_id
  LEFT JOIN properties p ON p.id = l.property_id
  ${LATEST_FEEDBACK_JOIN}
  RETURNING id, lead_id`;

/**
 * A scheduled call wasn't done in time. `claimed` must return the follow-up's
 * id, lead_id, lead_name, phone, scheduled_at, call_type, assigned_to_id,
 * agent_name, manager_id.
 */
export const INSERT_CALL_MISS_RECORDS_SQL = `
  INSERT INTO missed_lead_records (${RECORD_COLUMNS})
  SELECT 'CALL', now(), c.lead_id, c.id, COALESCE(l.name, c.lead_name), COALESCE(l.phone, c.phone), l.email,
         l.status_code, l.call_status, l.call_sub_status, c.scheduled_at, c.call_type, c.assigned_to_id,
         c.agent_name, c.manager_id, m.first_name || COALESCE(' ' || m.last_name, ''), l.property_id,
         p.name, l.campaign, l.source, l.sub_source, fb.message, l.notes, l.created_at, l.assigned_at
  FROM claimed c
  LEFT JOIN leads l ON l.id = c.lead_id
  LEFT JOIN users m ON m.id = c.manager_id
  LEFT JOIN properties p ON p.id = l.property_id
  ${LATEST_FEEDBACK_JOIN}
  RETURNING id, followup_call_id`;
