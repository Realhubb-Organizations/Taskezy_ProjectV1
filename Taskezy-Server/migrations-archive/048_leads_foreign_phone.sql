-- Lets a lead's phone be a foreign number as well as an Indian mobile.
-- Indian numbers are unchanged (10 bare digits, e.g. 9876543210); foreign
-- numbers are stored with their country code, e.g. +971554223805 (see
-- normalizeForeignPhone in src/utils/validation.ts). Every existing row
-- already satisfies the new rule, so nothing is rewritten.
--
-- The old check was created inline without a name, so it's dropped by
-- looking it up rather than assuming Postgres' default name — paste-ready
-- for TablePlus.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'leads'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%phone%'
  LOOP
    EXECUTE format('ALTER TABLE leads DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE leads ADD CONSTRAINT leads_phone_check
  CHECK (phone ~ '^([6-9][0-9]{9}|\+[1-9][0-9]{7,14})$');
