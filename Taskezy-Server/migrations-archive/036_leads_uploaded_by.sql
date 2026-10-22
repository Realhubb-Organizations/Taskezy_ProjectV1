-- Which admin ran a Data Calling bulk upload — leads.source/sub_source
-- record the channel/batch-label, never the acting admin, so there was
-- previously no way to answer "who uploaded this batch." Nullable (every
-- non-bulk-upload lead has no uploader); ON DELETE SET NULL, not RESTRICT,
-- since losing historical attribution when an admin account is later
-- deleted is fine, matching leads.previous_agent_id's existing FK style.
--
-- Run as the table owner (taskezy_admin). Safe to re-run.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS uploaded_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL;
