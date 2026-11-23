-- leads.deal_value is no longer used: marking a lead Booked doesn't ask for
-- a deal value any more (it only starts the Sales PNL approval), and the
-- reports' Booking Value comes from the Sales PNL booking's agreement value.
-- The values left in it were never real (₹1 typed to get past the old
-- prompt, or the old automatic ₹5,00,000 default), so nothing is moved.
--
-- Run ONLY after the code that stopped reading it is deployed, and after an
-- RDS snapshot. Run as the table owner (taskezy_admin). Safe to re-run.

ALTER TABLE leads DROP COLUMN IF EXISTS deal_value;
