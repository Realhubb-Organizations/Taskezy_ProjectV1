-- Supports bulk-import's new archived-duplicate check (matching an
-- uploaded phone against previously-deleted leads) without a sequential
-- scan over lead_deletion_archive as it grows. Expression index on the
-- JSONB snapshot's phone field, the only way archived leads are looked up.

CREATE INDEX IF NOT EXISTS idx_lead_deletion_archive_phone
  ON lead_deletion_archive ((lead_snapshot->>'phone'));
