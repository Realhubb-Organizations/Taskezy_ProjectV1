-- 064: data repair — call feedback still owed on a lead that was reassigned
-- after the call (Gunneswara, 27 Nov).
--
-- An agent calls a lead, and before they fill the call feedback the lead is
-- moved to another agent. The lead isn't theirs any more, so the feedback
-- popup couldn't load it and kept blocking their app. From now on a
-- reassignment closes that feedback itself (leads.repository.ts
-- closeCallFeedbackOnReassign); this closes the ones already stuck, the same
-- way: only the previous owner's own calls made before the reassignment, each
-- with a line in the lead's history.
--
-- Run as the table owner (taskezy_admin), any time. Safe to re-run: a closed
-- call no longer matches.

WITH closed AS (
  UPDATE call_attempts ca
     SET status = 'COMPLETED', outcome = 'Not needed — lead reassigned'
    FROM leads l
   WHERE l.id = ca.lead_id
     AND ca.status <> 'COMPLETED'
     AND ca.caller_user_id = l.previous_agent_id
     AND l.assigned_agent_id IS DISTINCT FROM ca.caller_user_id
     AND l.reassigned_at > ca.created_at
  RETURNING ca.lead_id, ca.caller_user_id
)
INSERT INTO lead_logs (lead_id, user_id, user_name_snapshot, message)
SELECT c.lead_id, NULL, 'System',
       u.first_name || COALESCE(' ' || u.last_name, '') || '''s call feedback is no longer needed — the lead was reassigned.'
  FROM closed c
  JOIN users u ON u.id = c.caller_user_id;
