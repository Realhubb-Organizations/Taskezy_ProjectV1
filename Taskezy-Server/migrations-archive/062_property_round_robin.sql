-- Real Round Robin for property lead assignment.
--
-- Before: each new lead went to whoever held the FEWEST leads for the
-- property (all time). A new team member, or one whose leads were moved
-- away, then got every new lead until they caught up, and leads arriving
-- at the same moment all went to the same person.
--
-- Now leads rotate through the property's team in a fixed order (by name),
-- one each in turn. This table remembers, per property, who got the last
-- lead; the row is locked while the next person is picked, so leads
-- arriving together still go to different people.
--
-- Run as the table owner (taskezy_admin). Safe to re-run.

CREATE TABLE IF NOT EXISTS property_round_robin (
  property_id UUID PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  last_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON property_round_robin TO taskezy_app;
