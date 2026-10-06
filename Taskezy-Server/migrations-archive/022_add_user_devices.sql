-- Stores each logged-in phone's push token so the server can send notifications
-- when the app is closed. One row per device token; rows cascade with the user.
--
-- Run as the table owner (taskezy_admin), not taskezy_app.

CREATE TABLE IF NOT EXISTS user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'android',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id);

-- GRANT SELECT, INSERT, UPDATE, DELETE ON user_devices TO taskezy_app;
-- The app role needs these four rights to register and remove push tokens.
