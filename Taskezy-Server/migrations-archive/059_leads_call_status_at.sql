-- 059: when a lead's Data Calling result (call status / sub-status) was set.
--
-- The Data Calling page and the Reports Team report (Data Calling mode)
-- counted Connected / Qualified / Not Qualified / RNR by the day the lead was
-- UPLOADED, so an agent's calls on 19 Nov to leads uploaded on 13 Nov showed
-- up under 13 Nov and the 19 Nov row read 0. They now count by this date: the
-- day the lead's current result was first set. From now on Taskezy sets it
-- whenever the call status or sub-status actually changes; re-saving the same
-- result keeps its day.
--
-- Existing leads are filled in once from their own history in lead_logs
-- ("Call status changed to ..." / "Sub-status changed to ..." / "Sub-status
-- cleared", written in the same transaction as every call-status change):
-- walking each lead's entries in order, the moment its result last actually
-- changed. A lead with a call status but no such entries keeps NULL and is
-- counted on its upload day, as before.
--
-- Run as the table owner (taskezy_admin) BEFORE deploying the code. Safe to re-run
-- (only fills leads that are still NULL). No new grant: taskezy_app already has
-- UPDATE on leads.

-- Don't queue behind a long-running query on leads (that would block every
-- lead read behind this ALTER): give up after 5s instead; just run it again.
SET lock_timeout = '5s';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_status_at TIMESTAMPTZ;
RESET lock_timeout;

DO $$
DECLARE
  r record;
  g record;
  cs text;
  css text;
  prev_cs text;
  prev_css text;
  changed_at timestamptz;
BEGIN
  FOR r IN SELECT id FROM leads WHERE call_status IS NOT NULL AND call_status_at IS NULL LOOP
    cs := NULL; css := NULL; changed_at := NULL;
    FOR g IN
      SELECT message, created_at FROM lead_logs
      WHERE lead_id = r.id
        AND (message LIKE 'Call status changed to %' OR message LIKE 'Sub-status changed to %' OR message = 'Sub-status cleared')
      ORDER BY created_at
    LOOP
      prev_cs := cs; prev_css := css;
      IF g.message LIKE 'Call status changed to %' THEN
        cs := substring(g.message from 'Call status changed to "(.*)"');
        IF cs IS DISTINCT FROM 'Connected' THEN css := NULL; END IF;
      ELSIF g.message = 'Sub-status cleared' THEN
        css := NULL;
      ELSE
        css := substring(g.message from 'Sub-status changed to "(.*)"');
      END IF;
      IF cs IS DISTINCT FROM prev_cs OR css IS DISTINCT FROM prev_css THEN
        changed_at := g.created_at;
      END IF;
    END LOOP;
    IF changed_at IS NOT NULL THEN
      UPDATE leads SET call_status_at = changed_at WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
