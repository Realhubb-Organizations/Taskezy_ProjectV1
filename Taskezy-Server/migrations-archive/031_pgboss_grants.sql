-- pg-boss (the new job queue — bulk-import/bulk-delete/call-log-sync move
-- onto it) manages its OWN schema lifecycle via its bundled CLI, not a
-- plain .sql file like this repo's other migrations — its schema
-- (partitioned job tables, scheduler, dead-letter queues, etc.) is
-- versioned internally and upgraded by running the CLI again on a future
-- pg-boss version bump, so hand-copying its DDL here would just go stale.
--
-- Setup order (both steps are one-time, run as taskezy_admin / the RDS
-- master user — taskezy_app cannot run DDL, same reason every other
-- migration in this archive needs the master user):
--   1. From Taskezy-Server: npx pg-boss migrate --connection-string "<taskezy_admin connection string>"
--      (creates the `pgboss` schema and every table/index/partition it needs)
--   2. Run this file, also as taskezy_admin.
--
-- What this file actually does: taskezy_app needs real DML on pgboss's
-- tables to enqueue/process jobs, AND needs to be able to create the
-- partitions pg-boss rotates in on its own as jobs accumulate (that's real
-- DDL, but scoped entirely inside pg-boss's own sandboxed schema — it
-- never touches leads/users/or any other real business table, so this is
-- a deliberate, contained exception to "taskezy_app never gets DDL", not
-- a blanket privilege escalation). The app's own pg-boss client
-- (src/jobs/queue.ts) is configured with `migrate: false` — it only ever
-- expects this schema to already exist, never attempts to create it
-- itself with its own (deliberately less-privileged) connection.
--
-- Run as the table owner (taskezy_admin).

GRANT USAGE, CREATE ON SCHEMA pgboss TO taskezy_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA pgboss TO taskezy_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA pgboss TO taskezy_app;

-- Covers every partition pg-boss creates after this point too (it creates
-- new job/queue_stats partitions over time as part of normal operation),
-- so this grant never needs re-running after a routine partition rotation
-- — only after an actual `pg-boss migrate` schema version upgrade, same
-- as step 1 above.
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT ALL PRIVILEGES ON TABLES TO taskezy_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT ALL PRIVILEGES ON SEQUENCES TO taskezy_app;
