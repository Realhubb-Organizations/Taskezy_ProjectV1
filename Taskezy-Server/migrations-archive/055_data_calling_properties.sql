-- Data Calling properties: a second, separate property list, managed on
-- the Properties page under its own "Data Calling Properties" toggle.
--
-- They live in the same properties table (same details: price, status,
-- possession, type, overview, media…) but carry kind = 'DATA_CALLING'.
-- Every existing property becomes kind = 'LEADS', so nothing changes for
-- them. A Data Calling property has no team, no round robin, and no
-- campaign or sheet links (the API refuses those), so it never picks an agent.
--
-- leads.data_calling_property_id is a lead's Data Calling property, kept
-- apart from leads.property_id (the main one, which drives the main
-- pipeline's assignment and property reports). A qualified lead keeps it,
-- and the Leads page shows it while the lead has no main property.
--
-- Run as the table owner (taskezy_admin). Safe to re-run.

ALTER TABLE properties ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'LEADS';
DO $$ BEGIN
  ALTER TABLE properties ADD CONSTRAINT properties_kind_check CHECK (kind IN ('LEADS', 'DATA_CALLING'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_properties_kind_created ON properties (kind, created_at DESC);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS data_calling_property_id UUID
  REFERENCES properties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_data_calling_property ON leads (data_calling_property_id)
  WHERE data_calling_property_id IS NOT NULL;
