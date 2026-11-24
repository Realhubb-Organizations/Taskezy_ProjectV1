-- Data Calling properties stay in step with Leads properties (Bhavuk, 24 Nov).
--
-- Every Leads property has a Data Calling copy. Adding a property adds it to
-- both lists; editing the details in either list updates the other. Deleting
-- stays separate: deleting the Leads one leaves the Data Calling copy (the link
-- just clears), and deleting the Data Calling one leaves the Leads property.
-- properties.linked_property_id is set on the Data Calling copy and points at
-- its Leads property.
--
-- A Data Calling property never picks salespeople, so any team or round robin
-- set on one is removed.
--
-- Data Calling leads that only have a Leads property (uploaded before
-- migration 055) get its Data Calling copy as their Data Calling property.
-- leads.property_id is not touched.
--
-- Run as the table owner (taskezy_admin) after 055. Safe to re-run.

ALTER TABLE properties ADD COLUMN IF NOT EXISTS linked_property_id UUID
  REFERENCES properties(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_properties_linked_property
  ON properties (linked_property_id) WHERE linked_property_id IS NOT NULL;

-- 1. No team or round robin on Data Calling properties.
DELETE FROM property_team_members
 WHERE property_id IN (SELECT id FROM properties WHERE kind = 'DATA_CALLING');
UPDATE properties SET lead_assignment_mode = NULL
 WHERE kind = 'DATA_CALLING' AND lead_assignment_mode IS NOT NULL;

-- 2. Data Calling properties already added by hand with the same name as a
--    Leads property become that property's copy (one each), instead of a duplicate.
WITH pairs AS (
  SELECT DISTINCT ON (l.id) l.id AS leads_id, d.id AS dc_id
    FROM properties l
    JOIN properties d ON d.kind = 'DATA_CALLING' AND d.linked_property_id IS NULL
                     AND lower(btrim(d.name)) = lower(btrim(l.name))
   WHERE l.kind = 'LEADS'
     AND NOT EXISTS (SELECT 1 FROM properties x WHERE x.linked_property_id = l.id)
   ORDER BY l.id, d.created_at
), uniq AS (
  SELECT DISTINCT ON (dc_id) leads_id, dc_id FROM pairs ORDER BY dc_id, leads_id
)
UPDATE properties p SET linked_property_id = u.leads_id
  FROM uniq u
 WHERE p.id = u.dc_id;

-- 3. Every other Leads property gets its Data Calling copy.
INSERT INTO properties (
  name, developer, location, locality, zone, price_value, price_type, property_type, property_status,
  description, possession_date, land_parcel, towers, structure, amenities, contact_number, map_url,
  website_url, brochure_url, lead_registration_url, tags, media_file_names, kind, linked_property_id, created_at
)
SELECT name, developer, location, locality, zone, price_value, price_type, property_type, property_status,
       description, possession_date, land_parcel, towers, structure, amenities, contact_number, map_url,
       website_url, brochure_url, lead_registration_url, tags, media_file_names, 'DATA_CALLING', id, created_at
  FROM properties l
 WHERE l.kind = 'LEADS'
   AND NOT EXISTS (SELECT 1 FROM properties x WHERE x.linked_property_id = l.id);

-- 4. Older Data Calling leads: their Leads property's copy becomes their Data Calling property.
UPDATE leads ld SET data_calling_property_id = d.id
  FROM properties d
 WHERE d.kind = 'DATA_CALLING' AND d.linked_property_id = ld.property_id
   AND ld.sub_source IS NOT NULL
   AND ld.data_calling_property_id IS NULL;
