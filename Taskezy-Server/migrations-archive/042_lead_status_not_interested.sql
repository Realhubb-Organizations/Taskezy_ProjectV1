-- Adds "Not Interested" as a 15th Lead Status, alongside the existing
-- NON_BUYER-category statuses (RNR, Low Budget, Other requirement,
-- Broker, Cancelled, Different Location, Dead Lead) — see migration
-- 030_lead_status_segregation.sql for the original 14-value list this
-- extends. sort_order 150 places it right after Dead Lead (140), the
-- current last entry.
--
-- Run as the table owner (taskezy_admin). Safe to re-run.

INSERT INTO lead_statuses (code, label, category, sort_order, is_active) VALUES
  ('NOT_INTERESTED', 'Not Interested', 'NON_BUYER', 150, true)
ON CONFLICT (code) DO NOTHING;
