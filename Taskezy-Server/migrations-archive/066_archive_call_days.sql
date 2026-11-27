-- 066: Data Calling analytics don't change when leads are deleted.
--
-- Deleting a lead removes its call records (call_attempts, ON DELETE
-- CASCADE), so the Data Calling page's Calls Made dropped, and its counts
-- (Total, Connected, Qualified, RNR…) dropped with the lead. The lead itself
-- is already kept in lead_deletion_archive; this keeps its call days there
-- too — the same [caller, day] pairs the Calls Made numbers use — so the
-- Data Calling analytics can keep counting deleted leads. Filled on every
-- delete from now on; leads deleted before this have no call days saved.
--
-- Run as the table owner (taskezy_admin) BEFORE deploying the server.
-- Safe to re-run.

ALTER TABLE lead_deletion_archive ADD COLUMN IF NOT EXISTS call_days_snapshot JSONB;
