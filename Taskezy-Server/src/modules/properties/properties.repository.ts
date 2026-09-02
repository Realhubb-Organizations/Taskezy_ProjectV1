import { pool, query, withTransaction } from "../../db/pool";

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
  team_members: PropertyTeamMemberRow[];
}

export interface PropertyTeamMemberRow {
  userId: string;
  name: string;
  percentage: number | null;
}

const SELECT = `
  SELECT p.id, p.name, p.developer, p.location, p.locality, p.zone, p.price_value, p.price_type, p.property_type,
         p.property_status, p.description, p.possession_date, p.land_parcel, p.towers, p.structure, p.amenities,
         p.contact_number, p.map_url, p.website_url, p.brochure_url, p.lead_registration_url, p.tags,
         p.media_file_names, p.team_assignment_mode, p.lead_assignment_mode, p.created_at,
         COALESCE(
           (SELECT json_agg(json_build_object(
              'userId', ptm.user_id,
              'name', u.first_name || COALESCE(' ' || u.last_name, ''),
              'percentage', ptm.percentage
            ))
            FROM property_team_members ptm
            JOIN users u ON u.id = ptm.user_id
            WHERE ptm.property_id = p.id),
           '[]'
         ) AS team_members
  FROM properties p
`;

export async function findAll(): Promise<PropertyRow[]> {
  const { rows } = await query<PropertyRow>(`${SELECT} ORDER BY p.name`);
  return rows;
}

export async function findById(id: string): Promise<PropertyRow | undefined> {
  const { rows } = await query<PropertyRow>(`${SELECT} WHERE p.id = $1`, [id]);
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

// --- Team assignment (property_team_members) ---

export interface TeamMemberInput {
  userId: string;
  percentage?: number;
}

/** Atomically replaces the full team-member set for a property. Throws a foreign-key violation (23503) if a userId doesn't exist. */
export async function replaceTeamMembersForProperty(propertyId: string, members: TeamMemberInput[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM property_team_members WHERE property_id = $1`, [propertyId]);
    for (const member of members) {
      await client.query(
        `INSERT INTO property_team_members (property_id, user_id, percentage) VALUES ($1, $2, $3)`,
        [propertyId, member.userId, member.percentage ?? null]
      );
    }
  });
}

export interface AssignmentPoolMember {
  userId: string;
  percentage: number | null;
}

/** The pool of agents eligible for this property's auto-assignment — CUSTOM_MEMBERS uses the configured list, ALL_MEMBERS uses every active SALES non-admin user. */
export async function getAssignmentPool(propertyId: string): Promise<{ teamAssignmentMode: string; leadAssignmentMode: string | null; pool: AssignmentPoolMember[] } | undefined> {
  const { rows } = await query<{ team_assignment_mode: string; lead_assignment_mode: string | null }>(
    `SELECT team_assignment_mode, lead_assignment_mode FROM properties WHERE id = $1`,
    [propertyId]
  );
  const property = rows[0];
  if (!property) return undefined;

  if (property.team_assignment_mode === "CUSTOM_MEMBERS") {
    const { rows: members } = await query<{ user_id: string; percentage: number | null }>(
      `SELECT user_id, percentage FROM property_team_members WHERE property_id = $1`,
      [propertyId]
    );
    return {
      teamAssignmentMode: property.team_assignment_mode,
      leadAssignmentMode: property.lead_assignment_mode,
      pool: members.map(m => ({ userId: m.user_id, percentage: m.percentage }))
    };
  }

  const { rows: allMembers } = await query<{ id: string }>(
    `SELECT id FROM users WHERE status = 'ACTIVE' AND department = 'SALES' AND role != 'ADMIN'`
  );
  return {
    teamAssignmentMode: property.team_assignment_mode,
    leadAssignmentMode: property.lead_assignment_mode,
    pool: allMembers.map(u => ({ userId: u.id, percentage: null }))
  };
}

/** How many leads each candidate currently holds for this property — the tiebreaker Round Robin picks the minimum of. */
export async function countLeadsPerAgentForProperty(propertyId: string, agentIds: string[]): Promise<Record<string, number>> {
  if (agentIds.length === 0) return {};
  const { rows } = await query<{ assigned_agent_id: string; count: string }>(
    `SELECT assigned_agent_id, count(*) FROM leads WHERE property_id = $1 AND assigned_agent_id = ANY($2) GROUP BY assigned_agent_id`,
    [propertyId, agentIds]
  );
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.assigned_agent_id] = Number(row.count);
  return counts;
}

// --- Meta campaign linking (see Taskezy_DB/migrations/005_*.sql) ---

export async function listCampaignNamesForProperty(propertyId: string): Promise<string[]> {
  const { rows } = await query<{ campaign_name: string }>(
    `SELECT campaign_name FROM property_meta_campaigns WHERE property_id = $1 ORDER BY campaign_name`,
    [propertyId]
  );
  return rows.map(r => r.campaign_name);
}

/**
 * Distinct campaign names a real Meta lead has arrived with, restricted to
 * campaigns the spend sync currently sees as ACTIVE — a paused/ended
 * campaign a lead once came from is still a valid historical value but not
 * worth surfacing in the picker going forward. Falls back to including a
 * name if it hasn't been synced yet (not in meta_campaigns at all), so a
 * brand-new campaign isn't hidden before its first sync cycle.
 */
export async function listDistinctMetaCampaignNames(): Promise<string[]> {
  const { rows } = await query<{ campaign: string }>(
    `SELECT DISTINCT l.campaign
     FROM leads l
     LEFT JOIN meta_campaigns mc ON mc.name = l.campaign
     WHERE l.source = 'Meta Ads' AND l.campaign IS NOT NULL AND (mc.status = 'ACTIVE' OR mc.id IS NULL)
     ORDER BY l.campaign`
  );
  return rows.map(r => r.campaign);
}

/** Atomically replaces the full campaign-name set for a property. Throws a unique-violation (23505) if a name is already linked to a different property. */
export async function replaceCampaignsForProperty(propertyId: string, campaignNames: string[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM property_meta_campaigns WHERE property_id = $1`, [propertyId]);
    for (const name of campaignNames) {
      await client.query(
        `INSERT INTO property_meta_campaigns (property_id, campaign_name) VALUES ($1, $2)`,
        [propertyId, name]
      );
    }
  });
}

/** Used by the Meta webhook to auto-fill leads.property_id when a lead's campaign name matches a linked campaign. */
export async function findPropertyIdByCampaignName(campaignName: string): Promise<string | undefined> {
  const { rows } = await query<{ property_id: string }>(
    `SELECT property_id FROM property_meta_campaigns WHERE campaign_name = $1`,
    [campaignName]
  );
  return rows[0]?.property_id;
}

// --- Google Ads lead-form sheet linking (see Taskezy_DB/migrations/013_*.sql) ---
// Same shape as Meta/Google campaign linking above, except there's no sync
// job auto-discovering sheet sources the way one exists for ad campaigns —
// recordSheetSourceSeen is what populates the "unlinked" suggestions instead,
// called every time a lead arrives from a sheet source regardless of whether
// it's linked yet.

export async function listSheetSourceNamesForProperty(propertyId: string): Promise<string[]> {
  const { rows } = await query<{ sheet_source_name: string }>(
    `SELECT sheet_source_name FROM property_sheet_sources WHERE property_id = $1 ORDER BY sheet_source_name`,
    [propertyId]
  );
  return rows.map(r => r.sheet_source_name);
}

/** Sheet source names seen on at least one incoming lead that aren't linked to any property yet. */
export async function listUnlinkedSheetSourceNames(): Promise<string[]> {
  const { rows } = await query<{ name: string }>(
    `SELECT s.name FROM sheet_source_names_seen s
     LEFT JOIN property_sheet_sources pss ON pss.sheet_source_name = s.name
     WHERE pss.id IS NULL
     ORDER BY s.name`
  );
  return rows.map(r => r.name);
}

/** Atomically replaces the full sheet-source-name set for a property. Throws a unique-violation (23505) if a name is already linked to a different property. */
export async function replaceSheetSourcesForProperty(propertyId: string, sheetSourceNames: string[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM property_sheet_sources WHERE property_id = $1`, [propertyId]);
    for (const name of sheetSourceNames) {
      await client.query(
        `INSERT INTO property_sheet_sources (property_id, sheet_source_name) VALUES ($1, $2)`,
        [propertyId, name]
      );
    }
  });
}

/** Used by the Google Ads sheet-lead importer to auto-fill leads.property_id when a lead's sheet source name matches a linked sheet source. */
export async function findPropertyIdBySheetSource(sheetSourceName: string): Promise<string | undefined> {
  const { rows } = await query<{ property_id: string }>(
    `SELECT property_id FROM property_sheet_sources WHERE sheet_source_name = $1`,
    [sheetSourceName]
  );
  return rows[0]?.property_id;
}

/** Records that a lead arrived tagged with this sheet source name, whether or not it's linked to a property yet — see listUnlinkedSheetSourceNames. */
export async function recordSheetSourceSeen(sheetSourceName: string): Promise<void> {
  await pool.query(
    `INSERT INTO sheet_source_names_seen (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET last_seen_at = now()`,
    [sheetSourceName]
  );
}

// --- Google Ads campaign linking (see Taskezy_DB/migrations/009_*.sql) ---
// No lead-ingest webhook for Google (spend-sync only, per scoping decision),
// so suggestions come from the synced google_ads_campaigns cache rather than
// from leads.campaign the way Meta's suggestions do.

export async function listGoogleCampaignNamesForProperty(propertyId: string): Promise<string[]> {
  const { rows } = await query<{ campaign_name: string }>(
    `SELECT campaign_name FROM property_google_campaigns WHERE property_id = $1 ORDER BY campaign_name`,
    [propertyId]
  );
  return rows.map(r => r.campaign_name);
}

export async function listDistinctGoogleCampaignNames(): Promise<string[]> {
  const { rows } = await query<{ name: string }>(
    `SELECT DISTINCT name FROM google_ads_campaigns WHERE status = 'ACTIVE' ORDER BY name`
  );
  return rows.map(r => r.name);
}

/** Atomically replaces the full campaign-name set for a property. Throws a unique-violation (23505) if a name is already linked to a different property. */
export async function replaceGoogleCampaignsForProperty(propertyId: string, campaignNames: string[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM property_google_campaigns WHERE property_id = $1`, [propertyId]);
    for (const name of campaignNames) {
      await client.query(
        `INSERT INTO property_google_campaigns (property_id, campaign_name) VALUES ($1, $2)`,
        [propertyId, name]
      );
    }
  });
}
