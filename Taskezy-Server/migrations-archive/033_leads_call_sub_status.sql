-- Data Calling Sub-status (Qualified / Unqualified) as its own field.
--
-- Until now Qualification was derived from call_status in app code
-- (Connected -> Qualified, Called -> Unqualified). The product rule is now:
-- a sub-status can be picked ONLY when the call status is Connected, it is
-- optional (never defaulted), and both Qualified and Unqualified are
-- possible for a Connected call. That
-- needs its own column. Called / Not Reachable / Wrong Number never carry
-- a sub-status (enforced below and in leads.service.ts's updateCallStatus).
--
-- Run as the table owner (taskezy_admin). Safe to re-run.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_sub_status TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_call_sub_status_check') THEN
    ALTER TABLE leads ADD CONSTRAINT leads_call_sub_status_check
      CHECK (call_sub_status IS NULL OR (call_sub_status IN ('Qualified', 'Unqualified') AND call_status = 'Connected'));
  END IF;
END $$;

-- No backfill: the sub-status is optional and never defaults. Existing
-- Connected leads start with none until an agent picks one.
