-- One-shot marker so stuckCallScheduler.ts's proactive "agent stuck on the
-- call-feedback gate" alert fires exactly once per call_attempts row, not
-- every poll cycle for as long as it stays unresolved — mirrors
-- followup_calls.due_notified_at / leads.missed_notified_at's existing
-- pattern in this codebase.
--
-- Run as the table owner (taskezy_admin).

ALTER TABLE call_attempts ADD COLUMN IF NOT EXISTS stuck_notified_at TIMESTAMPTZ NULL;
