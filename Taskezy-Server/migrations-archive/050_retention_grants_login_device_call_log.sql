-- Extends the daily retention job (src/jobs/dataRetentionJob.ts) to also
-- clean up login_history (> 180 days) and device_call_log (> 90 days) --
-- same pattern as migration 023's notifications/refresh_tokens cleanup.
--
-- Run as the table owner (taskezy_admin), not taskezy_app.

-- GRANT DELETE ON login_history, device_call_log TO taskezy_app;
-- The app role needs DELETE on both tables. Without it the API still
-- works, but the daily job logs a warning and skips them.
