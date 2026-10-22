-- Real device name (e.g. "samsung SM-G991B") for Settings > Manage Users'
-- per-user registered-device list — user_devices previously only stored
-- token/platform, nothing human-readable. Nullable: devices registered
-- before this ships simply show no name, same as any other "can't
-- retroactively recover it" column added after the fact.
--
-- Run as the table owner (taskezy_admin). Safe to re-run.

ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS device_name TEXT NULL;
