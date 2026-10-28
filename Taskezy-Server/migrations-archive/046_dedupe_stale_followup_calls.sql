-- One-time cleanup: before this session's fix to POST /follow-ups (which
-- now marks a lead's older pending reminders COMPLETED whenever a new one
-- is scheduled for it), rescheduling a lead left every prior reminder
-- sitting as Upcoming/Missed forever. Next Call Date columns always prefer
-- an overdue row over an upcoming one (lib/followups.ts's nextFollowupFor),
-- so a lead with a stale overdue reminder kept showing that stale date
-- even after being rescheduled to a real future date. This marks every
-- lead's older non-completed reminders done, keeping only the most
-- recently created one per lead as the active schedule — paste-ready for
-- TablePlus.
UPDATE followup_calls fc
SET status = 'COMPLETED'
WHERE fc.status <> 'COMPLETED'
  AND fc.lead_id IS NOT NULL
  AND fc.id NOT IN (
    SELECT DISTINCT ON (lead_id) id
    FROM followup_calls
    WHERE lead_id IS NOT NULL AND status <> 'COMPLETED'
    ORDER BY lead_id, created_at DESC
  );
