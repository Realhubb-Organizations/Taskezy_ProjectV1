-- 056: mark which Meta spend rows have the corrected lead count.
--
-- Meta reports each lead under several action types at once ("lead",
-- "onsite_conversion.lead_grouped", "leadgen_grouped"...). The old sync
-- added them all up, so every saved Meta lead count was ~5x too big.
-- extractLeadCount now counts each lead once; this flag tells the sync
-- which saved rows still hold the old number, so it re-reads those
-- campaigns/ads from Meta (a few per 6h cycle) and overwrites them with
-- the right count. Nothing is deleted.
--
-- Existing rows start as false (old count). Google rows are never checked.
-- Run as the table owner (taskezy_admin). Safe to re-run.

ALTER TABLE ad_spend_records ADD COLUMN IF NOT EXISTS lead_count_fixed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ad_level_spend_records ADD COLUMN IF NOT EXISTS lead_count_fixed BOOLEAN NOT NULL DEFAULT false;
