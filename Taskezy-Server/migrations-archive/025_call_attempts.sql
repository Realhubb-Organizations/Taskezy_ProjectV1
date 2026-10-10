-- One row per outgoing contact (phone call or WhatsApp message) a
-- Manager/sales agent initiates toward a lead — two channels sharing one
-- table/gate since the shape (who, which lead, what happened, a durable
-- "still needs feedback" state) is identical:
--   CALL — native Android app only (web calling is disabled for those
--   roles — see CallStatePlugin / triggerLeadCall on the frontend).
--   Created the instant the native call-state listener detects the call
--   ended (status PENDING_FEEDBACK, duration_seconds set).
--   WHATSAPP — web AND app. There is no API (native or otherwise) that can
--   detect a WhatsApp message actually being sent, so this is created the
--   instant the agent returns to Taskezy after the WhatsApp button opened
--   wa.me (status PENDING_FEEDBACK, duration_seconds null) — outcome/notes
--   then capture their own Yes/No ("Sent"/"Not Sent") + reason-if-no.
-- Either way, closed out when the agent submits feedback (status
-- COMPLETED). This is what makes the mandatory-feedback gate durable across
-- a force-quit/relaunch: the frontend checks for an outstanding
-- PENDING_FEEDBACK row on every session restore, not just in-memory state.
--
-- Run as the table owner (taskezy_admin).

CREATE TABLE IF NOT EXISTS call_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  caller_user_id UUID NOT NULL REFERENCES users(id),
  channel TEXT NOT NULL DEFAULT 'CALL' CHECK (channel IN ('CALL', 'WHATSAPP')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING_FEEDBACK' CHECK (status IN ('PENDING_FEEDBACK', 'COMPLETED')),
  outcome TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One caller should only ever have at most one outstanding PENDING_FEEDBACK
-- row at a time (the gate blocks the whole app, so a second call can't start
-- until the first is resolved) — this index also makes the "do I have a
-- pending one?" session-restore check a cheap lookup.
CREATE INDEX IF NOT EXISTS idx_call_attempts_pending_by_caller
  ON call_attempts (caller_user_id)
  WHERE status = 'PENDING_FEEDBACK';

CREATE INDEX IF NOT EXISTS idx_call_attempts_lead_id ON call_attempts (lead_id);

-- taskezy_app already has default INSERT/SELECT/UPDATE privileges on new
-- tables in this schema (see earlier migrations' notes); no explicit GRANT
-- needed.
