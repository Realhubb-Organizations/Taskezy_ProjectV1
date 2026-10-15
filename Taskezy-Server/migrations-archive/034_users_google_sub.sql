-- "Sign in with Google": remembers which Google account a Taskezy user
-- signed in with (Google's stable account id, the ID token's `sub`), so the
-- link survives an email rename on either side. Set on the user's first
-- Google sign-in; only existing, ACTIVE users whose @realhubb.in Google
-- email matches their login email or company email can sign in (see
-- auth.service.ts's loginWithGoogle). No self sign-up.
--
-- Run as the table owner (taskezy_admin). Safe to re-run.

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_uniq ON users (google_sub) WHERE google_sub IS NOT NULL;
