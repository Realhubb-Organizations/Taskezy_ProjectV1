-- 058: when each connected Meta Page was last confirmed by a Sync or Connect.
--
-- The Meta Ads settings page showed "Last synced" as the date the newest Page
-- was first connected (07 Aug), because nothing recorded a real sync. The new
-- "Sync now" button (and Connect) set this for every Page they confirm, and
-- the page shows the latest one. Existing rows start empty ("not synced yet").
--
-- Run as the table owner (taskezy_admin) BEFORE deploying the code. Safe to re-run.
-- No new grant: taskezy_app already has UPDATE on meta_connections.

ALTER TABLE meta_connections ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
