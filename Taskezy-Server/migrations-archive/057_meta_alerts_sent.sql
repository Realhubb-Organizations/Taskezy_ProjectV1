-- 057: remember which Meta lead-loss alerts were already sent.
--
-- The daily Meta health checks (metaHealthAlerts.ts) used to repeat
-- "Meta leads missing" and "Campaign on an unconnected Page" every day while
-- a problem lasted, and the weekly Page reminders were only remembered in
-- memory, so every deploy sent them again early. Now each alert is sent once,
-- then one reminder every 7 days while it's still broken. Once it's fixed its
-- row is deleted, so a new problem later alerts straight away.
--
-- alert_key is the alert type plus the campaign or Page id, e.g.
-- 'leads-missing:120212345678'. Nothing else reads this table.
--
-- Run as the table owner (taskezy_admin) BEFORE deploying the code. Safe to re-run.

CREATE TABLE IF NOT EXISTS meta_alerts_sent (
  alert_key TEXT PRIMARY KEY,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON meta_alerts_sent TO taskezy_app;
