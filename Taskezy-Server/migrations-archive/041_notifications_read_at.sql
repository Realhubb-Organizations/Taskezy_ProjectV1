-- Read notifications used to vanish instantly (deleted on read) instead of
-- staying visible for a while — real complaint: "seen notifications are not
-- shown". read_at lets the app keep a read notification visible for 48h
-- (sorted below unread ones), then actually clean it up once that window
-- passes. See notifications.routes.ts and notificationCleanupScheduler.ts.
--
-- Run as the table owner (taskezy_admin). Safe to re-run.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ NULL;
