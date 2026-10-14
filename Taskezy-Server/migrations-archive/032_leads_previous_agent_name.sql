-- "Reassigned From" used to be only a link (leads.previous_agent_id) to the
-- previous owner's user row, with the name looked up through it — so once
-- that user was deleted (e.g. leads handed over when an agent leaves), the
-- lead showed a blank "Reassigned From". This keeps the previous owner's NAME
-- on the lead itself, written at every reassignment, so the chain
-- (Rohan -> Neha -> Richa) stays readable after any of them is deleted.
--
-- Run as the table owner (taskezy_admin).

ALTER TABLE leads ADD COLUMN IF NOT EXISTS previous_agent_name TEXT;

-- Backfill 1: previous owners who still exist.
UPDATE leads l
SET previous_agent_name = u.first_name || COALESCE(' ' || u.last_name, '')
FROM users u
WHERE u.id = l.previous_agent_id AND l.previous_agent_name IS NULL;

-- Backfill 2: previous owners already deleted — recover the name from the
-- lead's latest handover history entry ("... (Rohan was removed)").
UPDATE leads l
SET previous_agent_name = h.removed_name
FROM (
  SELECT DISTINCT ON (lead_id) lead_id, substring(message FROM '\((.+) was removed\)') AS removed_name
  FROM lead_logs
  WHERE message ~ '\(.+ was removed\)'
  ORDER BY lead_id, created_at DESC
) h
WHERE h.lead_id = l.id AND l.previous_agent_name IS NULL AND h.removed_name IS NOT NULL;
