-- A frozen record of every miss — one row per miss, never changed after:
--   LEAD: a new lead got no first response within 20 minutes of being
--         assigned (jobs/missedLeadScheduler.ts).
--   CALL: a scheduled call wasn't done within 10 minutes of its time
--         (jobs/followupScheduler.ts notifySlaViolations).
-- Each row keeps the lead as it was at that moment (status, overdue Next
-- Call Date, agent, feedback, notes, property, campaign, name, phone), so a
-- missed-lead notification shows exactly what was missed, whatever happens
-- to the lead afterwards. The live lead is worked normally on the Leads page.
--
-- Names are stored as text next to the ids, so a record stays readable
-- after a user, property or lead is deleted (the ids go NULL).
--
-- Run as the table owner (taskezy_admin). Safe to re-run.

CREATE TABLE IF NOT EXISTS missed_lead_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  miss_type TEXT NOT NULL CHECK (miss_type IN ('LEAD', 'CALL')),
  missed_at TIMESTAMPTZ NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  followup_call_id UUID REFERENCES followup_calls(id) ON DELETE SET NULL,
  lead_name TEXT NOT NULL,
  lead_phone TEXT,
  lead_email TEXT,
  status_code TEXT,                 -- the lead's status at that moment
  call_status TEXT,                 -- Data Calling: Connected / Called / Not Reachable / Wrong Number
  call_sub_status TEXT,             -- Data Calling: Qualified / Unqualified
  next_call_at TIMESTAMPTZ,         -- the (overdue) Next Call Date at that moment
  call_type TEXT,                   -- CALL: the missed call's type (CALLBACK, SITE_VISIT, ...)
  agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  agent_name TEXT,
  manager_id UUID REFERENCES users(id) ON DELETE SET NULL,
  manager_name TEXT,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  property_name TEXT,
  campaign TEXT,
  source TEXT,
  sub_source TEXT,
  feedback TEXT,                    -- latest activity entry at that moment
  notes TEXT,
  lead_created_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  -- Rebuilt once from activity history by this migration (misses from
  -- before the table existed), not captured live — best effort.
  is_backfilled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notification lists and Reports read by day / type / agent / lead.
CREATE INDEX IF NOT EXISTS idx_missed_lead_records_missed_at ON missed_lead_records (missed_at DESC);
CREATE INDEX IF NOT EXISTS idx_missed_lead_records_type_missed_at ON missed_lead_records (miss_type, missed_at DESC);
CREATE INDEX IF NOT EXISTS idx_missed_lead_records_agent_missed_at ON missed_lead_records (agent_id, missed_at DESC);
CREATE INDEX IF NOT EXISTS idx_missed_lead_records_lead_missed_at ON missed_lead_records (lead_id, missed_at DESC);
-- A scheduled call is missed once — never two records for it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_missed_lead_records_followup_call
  ON missed_lead_records (followup_call_id) WHERE followup_call_id IS NOT NULL;
-- Keeps the backfill below from adding the same lead miss twice on a re-run.
CREATE UNIQUE INDEX IF NOT EXISTS uq_missed_lead_records_lead_miss
  ON missed_lead_records (lead_id, missed_at) WHERE miss_type = 'LEAD';

-- The app connects as taskezy_app; it only ever adds and reads rows.
GRANT SELECT, INSERT ON missed_lead_records TO taskezy_app;

-- ---------------------------------------------------------------------------
-- One-time backfill from history (is_backfilled = true). Status at the time
-- = the lead's last "Status changed to ..." entry before the miss (old pre-030
-- codes mapped the way migration 030 mapped the leads), else New Lead.
-- Feedback / notes = the latest entries before the miss. Property, campaign
-- and source are the lead's current ones (history doesn't keep them).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.status_at(p_lead UUID, p_at TIMESTAMPTZ) RETURNS TEXT AS $$
  SELECT CASE code
    WHEN 'NEW' THEN 'NEW_LEAD' WHEN 'ASSIGNED' THEN 'NEW_LEAD' WHEN 'LEAD_POOL' THEN 'NEW_LEAD' WHEN 'AFTER_RERA' THEN 'NEW_LEAD'
    WHEN 'CONNECTED' THEN 'FOLLOWUP' WHEN 'INTERESTED' THEN 'FOLLOWUP' WHEN 'FOLLOW_UP' THEN 'FOLLOWUP'
    WHEN 'IN_NEGOTIATION' THEN 'FOLLOWUP' WHEN 'REVIVED' THEN 'FOLLOWUP'
    WHEN 'MEETING_SCHEDULED' THEN 'SITE_VISIT_SCHEDULED' WHEN 'MEETING_DONE' THEN 'SITE_VISIT_DONE'
    WHEN 'BOOKING_DONE' THEN 'BOOKED' WHEN 'FINANCE_REVIEW' THEN 'BOOKED' WHEN 'BOOKING_APPROVED' THEN 'BOOKED' WHEN 'COMPLETED' THEN 'BOOKED'
    WHEN 'FINANCE_REJECTED' THEN 'CANCELLED' WHEN 'INVALID' THEN 'DEAD_LEAD' WHEN 'DEAD' THEN 'DEAD_LEAD' WHEN 'SWITCH_OFF' THEN 'RNR'
    ELSE code END
  FROM (SELECT COALESCE(
    (SELECT substring(g.message from 'Status changed to "([A-Z_]+)"') FROM lead_logs g
     WHERE g.lead_id = p_lead AND g.created_at <= p_at AND g.message LIKE 'Status changed to "%'
     ORDER BY g.created_at DESC LIMIT 1),
    'NEW_LEAD') AS code) s
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION pg_temp.feedback_at(p_lead UUID, p_at TIMESTAMPTZ) RETURNS TEXT AS $$
  SELECT g.message FROM lead_logs g
  WHERE g.lead_id = p_lead AND g.created_at <= p_at AND g.message NOT LIKE 'Call feedback pending%'
  ORDER BY g.created_at DESC LIMIT 1
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION pg_temp.notes_at(p_lead UUID, p_at TIMESTAMPTZ) RETURNS TEXT AS $$
  SELECT substring(g.message from 7) FROM lead_logs g
  WHERE g.lead_id = p_lead AND g.created_at <= p_at AND g.message LIKE 'Note: %'
  ORDER BY g.created_at DESC LIMIT 1
$$ LANGUAGE sql STABLE;

-- Lead misses. The agent then = the current one, unless the lead was
-- reassigned after the miss (then its previous agent). A lead is flagged 20
-- minutes after it's assigned, so when a later reassignment has replaced
-- assigned_at, the assignment then (= its overdue Next Call Date) was the
-- miss time minus 20 minutes.
INSERT INTO missed_lead_records (
  miss_type, missed_at, lead_id, lead_name, lead_phone, lead_email, status_code, call_status, call_sub_status,
  next_call_at, agent_id, agent_name, manager_id, manager_name, property_id, property_name, campaign, source,
  sub_source, feedback, notes, lead_created_at, assigned_at, is_backfilled
)
SELECT 'LEAD', l.missed_notified_at, l.id, l.name, l.phone, l.email,
       pg_temp.status_at(l.id, l.missed_notified_at), l.call_status, l.call_sub_status,
       CASE WHEN l.reassigned_at > l.missed_notified_at THEN l.missed_notified_at - interval '20 minutes' ELSE COALESCE(l.assigned_at, l.created_at) END,
       a.id, COALESCE(a.first_name || COALESCE(' ' || a.last_name, ''), CASE WHEN l.reassigned_at > l.missed_notified_at THEN l.previous_agent_name END),
       m.id, m.first_name || COALESCE(' ' || m.last_name, ''),
       l.property_id, p.name, l.campaign, l.source, l.sub_source,
       pg_temp.feedback_at(l.id, l.missed_notified_at), pg_temp.notes_at(l.id, l.missed_notified_at),
       l.created_at, CASE WHEN l.reassigned_at > l.missed_notified_at THEN l.missed_notified_at - interval '20 minutes' ELSE l.assigned_at END, true
FROM leads l
LEFT JOIN users a ON a.id = CASE WHEN l.reassigned_at > l.missed_notified_at THEN l.previous_agent_id ELSE l.assigned_agent_id END
LEFT JOIN users m ON m.id = a.manager_id
LEFT JOIN properties p ON p.id = l.property_id
WHERE l.missed_notified_at IS NOT NULL
ON CONFLICT DO NOTHING;

-- Missed scheduled calls (violation_notified_at = when the SLA flagged it).
INSERT INTO missed_lead_records (
  miss_type, missed_at, lead_id, followup_call_id, lead_name, lead_phone, lead_email, status_code, call_status,
  call_sub_status, next_call_at, call_type, agent_id, agent_name, manager_id, manager_name, property_id,
  property_name, campaign, source, sub_source, feedback, notes, lead_created_at, assigned_at, is_backfilled
)
SELECT 'CALL', fc.violation_notified_at, fc.lead_id, fc.id, COALESCE(l.name, fc.lead_name), COALESCE(l.phone, fc.phone), l.email,
       CASE WHEN l.id IS NULL THEN NULL ELSE pg_temp.status_at(l.id, fc.violation_notified_at) END,
       l.call_status, l.call_sub_status, fc.scheduled_at, fc.call_type,
       a.id, a.first_name || COALESCE(' ' || a.last_name, ''), m.id, m.first_name || COALESCE(' ' || m.last_name, ''),
       l.property_id, p.name, l.campaign, l.source, l.sub_source,
       CASE WHEN l.id IS NULL THEN NULL ELSE pg_temp.feedback_at(l.id, fc.violation_notified_at) END,
       CASE WHEN l.id IS NULL THEN NULL ELSE pg_temp.notes_at(l.id, fc.violation_notified_at) END,
       l.created_at, l.assigned_at, true
FROM followup_calls fc
LEFT JOIN leads l ON l.id = fc.lead_id
LEFT JOIN users a ON a.id = fc.assigned_to_id
LEFT JOIN users m ON m.id = a.manager_id
LEFT JOIN properties p ON p.id = l.property_id
WHERE fc.violation_notified_at IS NOT NULL
ON CONFLICT DO NOTHING;
