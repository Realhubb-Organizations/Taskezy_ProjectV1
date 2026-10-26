-- Per-manager Access Control toggle (Settings > Manage Users, Super Admin
-- only): by default a Manager can only bulk-upload via Data Calling, not
-- the main CRM Leads page's own bulk upload — this column opts an
-- individual manager into the latter. Admins are unaffected (always
-- allowed, see leads.service.ts's assertBulkImportAllowed).

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_bulk_upload_crm_leads BOOLEAN NOT NULL DEFAULT false;
