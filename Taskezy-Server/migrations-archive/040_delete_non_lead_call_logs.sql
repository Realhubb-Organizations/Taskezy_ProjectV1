-- Privacy cleanup: device_call_log used to store every number a device
-- called or received a call from, not just calls to/from an actual CRM
-- lead — a device's personal call history had no business being stored (or
-- shown to an admin/manager) for any number that wasn't a lead. The sync
-- endpoint (call-log.routes.ts) now only inserts lead-matching numbers
-- going forward; this is the one-time cleanup of what was already stored
-- before that change.
--
-- Run as the table owner (taskezy_admin). Safe to re-run — the second run
-- deletes nothing further.

DELETE FROM device_call_log dcl
WHERE NOT EXISTS (
  SELECT 1 FROM leads l WHERE l.phone = dcl.phone_number
);
