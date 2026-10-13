-- Collapses the 27-code `lead_statuses` lookup table (which had
-- accumulated real duplicates across different screens built at different
-- times — "New"/"New Lead", "Booking Done"/"Booking Approved"/"Completed"
-- all meaning roughly the same thing) down to a clean, fixed 14-value Lead
-- Status list, used only by the main Leads page from here on. Every
-- existing lead's status_code is remapped to the closest new value in the
-- same pass — see WORK log/plan for the full old->new mapping table and
-- which rows were a judgment call rather than a direct match.
--
-- Also adds `leads.call_status`, a brand new, fully independent field for
-- Data Calling (Connected/Called/Not Reachable/Wrong Number) — previously
-- Data Calling reused this same `status`/`sub_status` pair, restricted to
-- 3 options client-side, which is exactly the conflict this migration
-- removes. Qualification Status is derived from call_status in
-- application code (Connected->Qualified, Called->Unqualified), not
-- stored here — same "derive, don't duplicate" convention the rest of
-- this schema already follows.
--
-- Unlike this archive's usual single-CREATE-TABLE migrations, this one
-- wraps a real data remap (insert-new-codes -> remap every lead ->
-- delete-old-codes, strictly in that order so the status_code FK is never
-- left pointing at a row that doesn't exist yet) in an explicit
-- transaction — a deliberate deviation from the no-BEGIN/COMMIT norm,
-- since a partial failure partway through this one would be a real
-- problem in a way it isn't for a plain CREATE TABLE IF NOT EXISTS.
--
-- Run as the table owner (taskezy_admin).

BEGIN;

-- Step 1: insert the new 14 codes ALONGSIDE the existing 27 (nothing
-- removed yet) — so every lead can be remapped onto a code that already
-- exists before any old code is deleted.
INSERT INTO lead_statuses (code, label, category, sort_order, is_active) VALUES
  ('NEW_LEAD', 'New Lead', 'PENDING', 10, true),
  ('RNR', 'RNR', 'NON_BUYER', 20, true),
  ('CALL_BACK', 'Call Back', 'BUYER_INTENT', 30, true),
  ('FOLLOWUP', 'Followup', 'BUYER_INTENT', 40, true),
  ('EOI', 'EOI', 'BUYER_INTENT', 50, true),
  ('SITE_VISIT_SCHEDULED', 'Site Visit Scheduled', 'BUYER_INTENT', 60, true),
  ('SITE_VISIT_DONE', 'Site Visit Done', 'BUYER_INTENT', 70, true),
  ('LOW_BUDGET', 'Low Budget', 'NON_BUYER', 80, true),
  ('OTHER_REQUIREMENT', 'Other requirement', 'NON_BUYER', 90, true),
  ('BROKER', 'Broker', 'NON_BUYER', 100, true),
  ('BOOKED', 'Booked', 'BOOKED', 110, true),
  ('CANCELLED', 'Cancelled', 'NON_BUYER', 120, true),
  ('DIFFERENT_LOCATION', 'Different Location', 'NON_BUYER', 130, true),
  ('DEAD_LEAD', 'Dead Lead', 'NON_BUYER', 140, true)
ON CONFLICT (code) DO NOTHING;

-- Step 2: add the new Data Calling field before the backfill below reads
-- leads' pre-migration status/sub_status to populate it.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_status TEXT
  CHECK (call_status IN ('Connected', 'Called', 'Not Reachable', 'Wrong Number'));

-- Step 3: one pass per lead — every SET expression below reads the ROW'S
-- PRE-UPDATE status_code/sub_status/source (standard SQL UPDATE
-- semantics), so call_status and status_code are both computed from the
-- same snapshot of the old data, not from each other.
UPDATE leads SET
  call_status = CASE
    WHEN source = 'Bulk Upload' AND status_code = 'CONNECTED' AND sub_status = 'Qualified' THEN 'Connected'
    WHEN source = 'Bulk Upload' AND status_code = 'CONNECTED' AND sub_status = 'Not Qualified' THEN 'Called'
    WHEN source = 'Bulk Upload' AND status_code = 'RNR' THEN 'Not Reachable'
    ELSE NULL
  END,
  -- Data Calling leads' main Lead Status was never meaningful on its own
  -- (it only existed because the field was shared) — every Data Calling
  -- lead lands on NEW_LEAD regardless of its old status, with call_status
  -- above carrying the real history of how far it got.
  status_code = CASE
    WHEN source = 'Bulk Upload' THEN 'NEW_LEAD'
    -- UNASSIGNED is NOT remapped — it's kept as a live system sentinel
    -- (see leads.service.ts/leads.repository.ts: a lead with no agent yet
    -- is deliberately excluded from the user-facing 14-value list and
    -- auto-promotes to NEW_LEAD once an agent is assigned, same as before
    -- this migration). Its lead_statuses row is kept below for the same
    -- reason.
    WHEN status_code = 'UNASSIGNED' THEN 'UNASSIGNED'
    ELSE (CASE status_code
      WHEN 'NEW' THEN 'NEW_LEAD'
      WHEN 'ASSIGNED' THEN 'NEW_LEAD'
      WHEN 'LEAD_POOL' THEN 'NEW_LEAD'
      WHEN 'AFTER_RERA' THEN 'NEW_LEAD'
      WHEN 'CONNECTED' THEN 'FOLLOWUP'
      WHEN 'INTERESTED' THEN 'FOLLOWUP'
      WHEN 'FOLLOW_UP' THEN 'FOLLOWUP'
      WHEN 'IN_NEGOTIATION' THEN 'FOLLOWUP'
      WHEN 'REVIVED' THEN 'FOLLOWUP'
      WHEN 'CALL_BACK' THEN 'CALL_BACK'
      WHEN 'MEETING_SCHEDULED' THEN 'SITE_VISIT_SCHEDULED'
      WHEN 'SITE_VISIT_SCHEDULED' THEN 'SITE_VISIT_SCHEDULED'
      WHEN 'MEETING_DONE' THEN 'SITE_VISIT_DONE'
      WHEN 'SITE_VISIT_DONE' THEN 'SITE_VISIT_DONE'
      WHEN 'EOI' THEN 'EOI'
      WHEN 'BOOKING_DONE' THEN 'BOOKED'
      WHEN 'FINANCE_REVIEW' THEN 'BOOKED'
      WHEN 'BOOKING_APPROVED' THEN 'BOOKED'
      WHEN 'COMPLETED' THEN 'BOOKED'
      WHEN 'FINANCE_REJECTED' THEN 'CANCELLED'
      WHEN 'NOT_INTERESTED' THEN 'DEAD_LEAD'
      WHEN 'INVALID' THEN 'DEAD_LEAD'
      WHEN 'DEAD' THEN 'DEAD_LEAD'
      WHEN 'LOW_BUDGET' THEN 'LOW_BUDGET'
      WHEN 'RNR' THEN 'RNR'
      WHEN 'SWITCH_OFF' THEN 'RNR'
      ELSE 'NEW_LEAD' -- safety net: any code not in this list (there should be none) lands on New Lead rather than failing the FK below
    END)
  END;

-- Step 4: now that no lead references an old code (other than the kept
-- UNASSIGNED sentinel), it's safe to drop the rest. UNASSIGNED is kept
-- alive deliberately — see the comment above.
DELETE FROM lead_statuses WHERE code NOT IN (
  'NEW_LEAD', 'RNR', 'CALL_BACK', 'FOLLOWUP', 'EOI', 'SITE_VISIT_SCHEDULED',
  'SITE_VISIT_DONE', 'LOW_BUDGET', 'OTHER_REQUIREMENT', 'BROKER', 'BOOKED',
  'CANCELLED', 'DIFFERENT_LOCATION', 'DEAD_LEAD', 'UNASSIGNED'
);

COMMIT;

-- taskezy_app already has default privileges on existing tables/columns in
-- this schema; no explicit GRANT needed for the new column.
