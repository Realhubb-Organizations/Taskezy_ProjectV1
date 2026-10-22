-- Email OTP as the second step of password login. After a correct password
-- on a device that isn't trusted, the server emails a 6-digit code and only
-- issues a session once that code is entered (auth/loginOtp.ts). Google
-- sign-in is unaffected.
--
-- login_otps: one row per code challenge. Only an HMAC of the code is
-- stored; attempts/resend_count cap guessing (5 tries per code, 3 resends).
--
-- trusted_devices: "Trust this device for 30 days". The device keeps a
-- random token in an httpOnly cookie; only its SHA-256 is stored here.
--
-- Run as the table owner (taskezy_admin). Safe to re-run.

CREATE TABLE IF NOT EXISTS login_otps (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  resend_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_otps_user_created ON login_otps (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device_label TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices (user_id);

-- The app connects as taskezy_app.
GRANT SELECT, INSERT, UPDATE, DELETE ON login_otps, trusted_devices TO taskezy_app;
