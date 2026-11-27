-- 065: removing a qualified lead from Data Calling keeps it in Leads.
--
-- A Data Calling lead marked Connected + Qualified moves to Leads but stays
-- the same row, still listed in Data Calling. Deleting it from the Data
-- Calling page used to delete that row — so it vanished from Leads too.
-- Now Delete on the Data Calling page only hides such a lead from the Data
-- Calling list (this column); it stays in Leads with its history, and the
-- Data Calling reports keep counting it. Leads not in Leads are still
-- deleted as before. If the lead later goes back to Data Calling (its result
-- is no longer Connected + Qualified), the mark is cleared.
--
-- Run as the table owner (taskezy_admin) BEFORE deploying the server.
-- Safe to re-run.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS removed_from_data_calling_at TIMESTAMPTZ;
