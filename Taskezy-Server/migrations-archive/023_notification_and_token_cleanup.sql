-- Supports deleting old data instead of keeping it forever:
--   * notifications are deleted when read (informational ones), when their
--     lead is acted on (lead activity alerts), via "Clear all", and by a daily
--     job after 7 days (src/jobs/dataRetentionJob.ts);
--   * refresh tokens are deleted by the same daily job 7 days after they
--     expire or are revoked.
--
-- Run as the table owner (taskezy_admin), not taskezy_app.

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_lead ON notifications(lead_id) WHERE lead_id IS NOT NULL;

-- GRANT DELETE ON notifications, refresh_tokens TO taskezy_app;
-- The app role needs DELETE on both tables. Without it the API still works,
-- but every delete above fails: the daily job logs a warning and skips.
