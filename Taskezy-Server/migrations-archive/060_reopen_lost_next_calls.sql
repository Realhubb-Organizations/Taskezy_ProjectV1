-- 060: data repair for the Next Call Date bug (fixed in leads.service.ts updateLeadStatus).
-- A status change used to close the lead's future scheduled call even when the new status still
-- needs a next call (RNR, Call Back, Followup, EOI, Site Visit Scheduled), so the Next Call Date
-- went blank. This reopens that call when it is still in the future, the lead was not reassigned
-- since (reassignment closes calls on purpose), the lead has no other open call, the status
-- was not set to a closing one (Site Visit Done, Low Budget, ...) after the call was booked,
-- and a site visit is only reopened while the lead is still Site Visit Scheduled.
-- Run AFTER the fix is deployed. Safe to re-run: a reopened call no longer matches.
SET lock_timeout = '5s';

WITH last_call AS (
  SELECT DISTINCT ON (f.lead_id) f.id, f.lead_id, f.scheduled_at, f.status, f.assigned_to_id, f.call_type, f.created_at
  FROM followup_calls f
  WHERE f.lead_id IS NOT NULL
  ORDER BY f.lead_id, f.created_at DESC, f.id
)
UPDATE followup_calls fc
SET status = 'UPCOMING'
FROM last_call c
JOIN leads l ON l.id = c.lead_id
WHERE fc.id = c.id
  AND c.status = 'COMPLETED'
  AND c.scheduled_at > now()
  AND l.assigned_agent_id = c.assigned_to_id
  AND l.status_code IN ('RNR','CALL_BACK','FOLLOWUP','EOI','SITE_VISIT_SCHEDULED')
  AND NOT EXISTS (SELECT 1 FROM followup_calls o WHERE o.lead_id = l.id AND o.status <> 'COMPLETED')
  AND (l.reassigned_at IS NULL OR l.reassigned_at < c.created_at)
  AND (c.call_type <> 'SITE_VISIT' OR l.status_code = 'SITE_VISIT_SCHEDULED')
  AND NOT EXISTS (
    SELECT 1 FROM lead_logs ll
    WHERE ll.lead_id = l.id AND ll.created_at > c.created_at
      AND ll.message LIKE 'Status changed to "%'
      AND ll.message NOT IN ('Status changed to "RNR"', 'Status changed to "CALL_BACK"', 'Status changed to "FOLLOWUP"',
                             'Status changed to "EOI"', 'Status changed to "SITE_VISIT_SCHEDULED"'))
RETURNING fc.lead_id, fc.lead_name, fc.scheduled_at;
