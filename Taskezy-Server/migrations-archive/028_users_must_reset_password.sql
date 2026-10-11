-- must_reset_password is already part of the base `users` table in
-- schema.sql, but no migration file ever tracked it — this is a defensive
-- idempotent add in case the live database predates that column. Wiring up
-- the forced-password-reset flow (login now selects this, a new
-- self-service PATCH /api/v1/auth/password clears it) needs it to exist.
--
-- Run as the table owner (taskezy_admin).

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN NOT NULL DEFAULT false;
