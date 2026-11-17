-- Adds "Revived Lead" as a 16th Lead Status.
--
-- A repeat Meta / Google Ads Sheet enquiry that matches an existing cold or
-- closed lead (Dead Lead, Not Interested, Cancelled, Low Budget, Different
-- Location, Other requirement, Broker, RNR), or a lead still in Data Calling,
-- now sets it to REVIVED with a fresh response clock, like a new lead
-- (modules/leads/leadRevival.ts). Leads already being worked keep their
-- status. Set only by the system, never picked by hand.
--
-- Category PENDING, same as New Lead: neither qualified nor unqualified.
-- sort_order 15 places it right after New Lead (10).
--
-- revived_at:    when the lead was last revived. The "no going back to RNR /
--                Call Back / Dead Lead" rule only counts Followup / Site
--                Visit history after this, so a revived lead starts fresh.
-- revival_count: how many times the lead has been revived.
--
-- Existing leads are not changed (no backfill of past revivals).
--
-- Run as the table owner (taskezy_admin). Safe to re-run.

INSERT INTO lead_statuses (code, label, category, sort_order, is_active) VALUES
  ('REVIVED', 'Revived Lead', 'PENDING', 15, true)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS revived_at TIMESTAMPTZ NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS revival_count INTEGER NOT NULL DEFAULT 0;
