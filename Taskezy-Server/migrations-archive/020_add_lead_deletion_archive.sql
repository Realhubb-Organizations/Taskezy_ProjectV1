-- Archive-before-delete for leads. lead_logs.lead_id is ON DELETE CASCADE, so
-- deleting a lead used to permanently erase its history. Before a lead is
-- deleted, the app copies the leads row and all its lead_logs rows into this
-- table, together with who deleted it and when.
--
-- Append-only by design: rows are written once and never changed. The grant
-- lines at the bottom restrict the app role to SELECT and INSERT, so the app
-- cannot alter or erase archived evidence.
--
-- No foreign keys on purpose: the lead row is being deleted and the archive
-- must outlive it, and deleting a user later must not touch the archive.

CREATE TABLE IF NOT EXISTS lead_deletion_archive (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                  UUID NOT NULL,
  lead_snapshot            JSONB NOT NULL,
  logs_snapshot           JSONB NOT NULL DEFAULT '[]',
  deleted_by_user_id       UUID,
  deleted_by_name_snapshot TEXT NOT NULL,
  deleted_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_deletion_archive_lead ON lead_deletion_archive(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_deletion_archive_deleted_at ON lead_deletion_archive(deleted_at);

-- Grants must be run by the table owner (taskezy_admin), not by the app role.
-- UPDATE and DELETE are intentionally NOT granted, so the app cannot alter or
-- erase archived evidence.
-- GRANT SELECT, INSERT ON lead_deletion_archive TO taskezy_app;
