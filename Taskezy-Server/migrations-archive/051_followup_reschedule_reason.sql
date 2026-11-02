-- Why a site visit was moved to a new date (Reports → Team Reports →
-- Salesperson Site Visit Report's "Reschedule Reason"). Filled in by the
-- scheduling popups when a lead that already had a site visit gets a new
-- one; NULL for every other follow-up.
--
-- Run as the table owner (taskezy_admin), not taskezy_app.
ALTER TABLE followup_calls ADD COLUMN IF NOT EXISTS reschedule_reason TEXT;
