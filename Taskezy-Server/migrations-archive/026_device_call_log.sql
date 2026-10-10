-- Each sales agent's phone keeps its own native Android call history, but
-- that history only exists on that one device — a Manager/Admin has no way
-- to see who an agent actually called from the office CRM, and the history
-- is gone the moment the agent uninstalls the app or switches phones. This
-- table is the sync target the native app pushes its device call log to
-- (read via Android's CallLog content provider, not something the web/API
-- side can ever observe directly), so that oversight works across every
-- agent's device rather than being trapped on each individual phone.
--
-- A call log entry is immutably identified by whose phone + which number +
-- when it happened — it never changes after the fact, so there's nothing to
-- UPDATE, only INSERT. The UNIQUE (user_id, phone_number, call_date)
-- constraint is what makes that safe to sync repeatedly: the native app
-- doesn't need to track "which entries have I already uploaded," it can
-- just re-upload its last N days of history on every sync and let
-- ON CONFLICT DO NOTHING silently skip whatever's already here.
--
-- Run as the table owner (taskezy_admin).

CREATE TABLE IF NOT EXISTS device_call_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  phone_number TEXT NOT NULL,
  call_type TEXT NOT NULL CHECK (call_type IN ('INCOMING', 'OUTGOING', 'MISSED', 'REJECTED', 'BLOCKED', 'UNKNOWN')),
  call_date TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone_number, call_date)
);

CREATE INDEX IF NOT EXISTS idx_device_call_log_user_date ON device_call_log (user_id, call_date DESC);

-- taskezy_app already has default INSERT/SELECT/UPDATE privileges on new
-- tables in this schema (see earlier migrations' notes); no explicit GRANT
-- needed.
