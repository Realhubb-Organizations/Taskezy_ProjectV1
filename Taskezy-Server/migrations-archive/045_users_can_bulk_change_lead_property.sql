-- Second per-manager Access Control toggle (Settings > Manage Users,
-- Super Admin only), alongside can_bulk_upload_crm_leads: whether this
-- manager may run the new bulk "change leads' property" action. Admins
-- are always allowed (see leads.service.ts's assertBulkPropertyChangeAllowed).

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_bulk_change_lead_property BOOLEAN NOT NULL DEFAULT false;
