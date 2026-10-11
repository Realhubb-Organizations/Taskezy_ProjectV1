-- resale_units never had a phone/contact column — the Resale page's
-- "Contact" button was hardcoded to one phone number for every listing
-- because there was no real per-listing number to use. This adds it.
--
-- Run as the table owner (taskezy_admin).

ALTER TABLE resale_units ADD COLUMN IF NOT EXISTS contact_number TEXT;
