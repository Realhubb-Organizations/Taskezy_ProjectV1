-- Daily impressions and link clicks per Meta campaign, next to spend/leads,
-- so the Campaigns page can show real Impressions, Clicks and CTR
-- (CTR = clicks / impressions). NULL means the platform didn't report it
-- (e.g. Google rows, or days synced before this migration) and shows as "—".
-- Filled by the next Meta sync (jobs/metaAdSpendSync.ts), which re-fetches
-- its whole look-back window.
--
-- Run as the table owner (taskezy_admin).

ALTER TABLE ad_spend_records ADD COLUMN IF NOT EXISTS impressions BIGINT;
ALTER TABLE ad_spend_records ADD COLUMN IF NOT EXISTS clicks BIGINT;
