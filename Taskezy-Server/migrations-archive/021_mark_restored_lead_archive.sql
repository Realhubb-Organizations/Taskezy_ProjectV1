-- Restoring a lead from the archive keeps its archive row, marked as restored,
-- so the record that the lead was deleted and later restored is not lost.
-- Rows with restored_at set are no longer "currently deleted" leads.
--
-- Run as the table owner (taskezy_admin). The app role has no UPDATE on this
-- table, so marking a restore is an admin action only.

ALTER TABLE lead_deletion_archive ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;

CREATE OR REPLACE VIEW lead_deletion_archive_active AS
  SELECT * FROM lead_deletion_archive WHERE restored_at IS NULL;
