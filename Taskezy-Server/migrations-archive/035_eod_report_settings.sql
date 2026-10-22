-- End-of-day call-count report notifications (Sales Agent Reports tab):
-- a company-wide default fire time (Admin-set, tenant_settings), a
-- per-manager override for their own team's time (users.eod_report_time,
-- NULL = inherit the tenant default), and a one-shot-per-day marker so a
-- user isn't re-notified on every poll cycle after their time has passed.
--
-- Run as the table owner (taskezy_admin). Safe to re-run.

ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS eod_report_time TIME NOT NULL DEFAULT '21:00:00';
ALTER TABLE users ADD COLUMN IF NOT EXISTS eod_report_time TIME NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS eod_notified_date DATE NULL;
