-- Every successful web login (password+OTP or Google), not just ones the
-- user happened to check "trust this device" for (trusted_devices stays
-- as-is for its own actual purpose, the 30-day OTP-skip cookie) — Settings
-- > Manage Users' per-user device list needed a real picture of "has this
-- person logged in from the web," which trusted_devices alone couldn't give.
--
-- One row per login event; the devices list query (users.routes.ts)
-- groups by device_label and takes min/max(created_at) to collapse
-- repeated logins from the same browser into one "device" with a real
-- first-seen/last-active pair, same shape user_devices already has.
--
-- Run as the table owner (taskezy_admin). Safe to re-run.

CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_label TEXT,
  method TEXT NOT NULL CHECK (method IN ('PASSWORD', 'GOOGLE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_history_user_created ON login_history (user_id, created_at DESC);

-- The app connects as taskezy_app.
GRANT SELECT, INSERT ON login_history TO taskezy_app;
