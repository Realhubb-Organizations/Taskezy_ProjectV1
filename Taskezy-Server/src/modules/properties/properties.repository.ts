import { pool, query } from "../../db/pool";

export interface PropertyRow {
  id: string;
  name: string;
  developer: string;
  location: string;
  locality: string | null;
  zone: string | null;
  price_value: string | null;
  price_type: string | null;
  property_type: string;
  property_status: string | null;
  description: string | null;
  possession_date: string | null;
  land_parcel: string | null;
  towers: string | null;
  structure: string | null;
  amenities: string[] | null;
  contact_number: string | null;
  map_url: string | null;
  website_url: string | null;
  brochure_url: string | null;
  lead_registration_url: string | null;
  tags: string[] | null;
  media_file_names: string[] | null;
  team_assignment_mode: string;
  lead_assignment_mode: string | null;
  created_at: string;
}

const SELECT = `
  SELECT id, name, developer, location, locality, zone, price_value, price_type, property_type,
         property_status, description, possession_date, land_parcel, towers, structure, amenities,
         contact_number, map_url, website_url, brochure_url, lead_registration_url, tags,
         media_file_names, team_assignment_mode, lead_assignment_mode, created_at
  FROM properties
`;

export async function findAll(): Promise<PropertyRow[]> {
  const { rows } = await query<PropertyRow>(`${SELECT} ORDER BY name`);
  return rows;
}

export async function findById(id: string): Promise<PropertyRow | undefined> {
  const { rows } = await query<PropertyRow>(`${SELECT} WHERE id = $1`, [id]);
  return rows[0];
}

export interface PropertyInput {
  name: string;
  developer: string;
  location: string;
  locality?: string;
  zone?: string;
  priceValue?: number;
  priceType?: string;
  propertyType: string;
  propertyStatus?: string;
  description?: string;
  possessionDate?: string;
  landParcel?: string;
  towers?: string;
  structure?: string;
  amenities?: string[];
  contactNumber?: string;
  mapUrl?: string;
  websiteUrl?: string;
  brochureUrl?: string;
  leadRegistrationUrl?: string;
  tags?: string[];
  mediaFileNames?: string[];
  teamAssignmentMode?: string;
  leadAssignmentMode?: string;
}

export async function create(input: PropertyInput): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO properties (
       name, developer, location, locality, zone, price_value, price_type, property_type, property_status,
       description, possession_date, land_parcel, towers, structure, amenities, contact_number, map_url,
       website_url, brochure_url, lead_registration_url, tags, media_file_names, team_assignment_mode, lead_assignment_mode
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,COALESCE($23,'ALL_MEMBERS')::team_assignment_mode,$24)
     RETURNING id`,
    [
      input.name, input.developer, input.location, input.locality ?? null, input.zone ?? null,
      input.priceValue ?? null, input.priceType ?? null, input.propertyType, input.propertyStatus ?? null,
      input.description ?? null, input.possessionDate ?? null, input.landParcel ?? null, input.towers ?? null,
      input.structure ?? null, input.amenities ?? null, input.contactNumber ?? null, input.mapUrl || null,
      input.websiteUrl || null, input.brochureUrl || null, input.leadRegistrationUrl || null,
      input.tags ?? null, input.mediaFileNames ?? null, input.teamAssignmentMode ?? null, input.leadAssignmentMode ?? null
    ]
  );
  return rows[0].id;
}

const FIELD_TO_COLUMN: Record<string, string> = {
  name: "name", developer: "developer", location: "location", locality: "locality", zone: "zone",
  priceValue: "price_value", priceType: "price_type", propertyType: "property_type",
  propertyStatus: "property_status", description: "description", possessionDate: "possession_date",
  landParcel: "land_parcel", towers: "towers", structure: "structure", amenities: "amenities",
  contactNumber: "contact_number", mapUrl: "map_url", websiteUrl: "website_url", brochureUrl: "brochure_url",
  leadRegistrationUrl: "lead_registration_url", tags: "tags", mediaFileNames: "media_file_names",
  teamAssignmentMode: "team_assignment_mode", leadAssignmentMode: "lead_assignment_mode"
};

export async function update(id: string, input: Partial<PropertyInput>): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];

  for (const [field, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const column = FIELD_TO_COLUMN[field];
    if (!column) continue;
    params.push(value === "" ? null : value);
    sets.push(`${column} = $${params.length}`);
  }

  if (sets.length === 0) return;
  // updated_at is auto-maintained by trg_properties_updated_at (schema.sql) — not set here.
  params.push(id);
  await pool.query(`UPDATE properties SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
}

export async function remove(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM properties WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
