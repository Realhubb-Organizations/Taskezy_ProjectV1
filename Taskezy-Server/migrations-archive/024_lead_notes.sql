-- A lead's current note, written by people (not system events). Edited from
-- the Notes column pencil, the lead drawer, and required when assigning,
-- reshuffling or reassigning a lead. Every save is also written to lead_logs
-- so earlier notes stay visible in Activity History.
--
-- Run as the table owner (taskezy_admin).

ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes_updated_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes_updated_by UUID;

-- taskezy_app already has SELECT/UPDATE on leads; no new grant needed.
