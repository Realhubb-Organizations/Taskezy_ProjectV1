import { PoolClient } from "pg";
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
  /** LEADS (main list) or DATA_CALLING (Data Calling's own list — no team, campaigns or sheets). */
  kind: PropertyKind;
  created_at: string;
  team_members: PropertyTeamMemberRow[];
}

export type PropertyKind = "LEADS" | "DATA_CALLING";

export interface PropertyTeamMemberRow {
  userId: string;
  name: string;
  percentage: number | null;
}

const SELECT = `
  SELECT p.id, p.name, p.developer, p.location, p.locality, p.zone, p.price_value, p.price_type, p.property_type,
         p.property_status, p.description, p.possession_date, p.land_parcel, p.towers, p.structure, p.amenities,
         p.contact_number, p.map_url, p.website_url, p.brochure_url, p.lead_registration_url, p.tags,
         p.media_file_names, p.team_assignment_mode, p.lead_assignment_mode, p.kind, p.created_at,
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

/** Filters for the paginated admin list (findMany) — kept as its own interface in case other callers need the predicate without page/pageSize later, same convention as leads.repository.ts's LeadFilterConditions/LeadListFilter split. */
export interface PropertyFilterConditions {
  /** Matches name/developer/location, or a salesperson assigned to the property. */
  search?: string;
  /** Multi-select; matches if ANY selected type is one of a property's own (comma-joined) types. */
  propertyType?: string[];
  /** Which list — LEADS or DATA_CALLING. */
  kind: PropertyKind;
}

export interface PropertyListFilter extends PropertyFilterConditions {
  page: number;
  pageSize: number;
  /** Sort direction on created_at — defaults to DESC (newest first), matching the admin table's own default. */
  sortDir?: "asc" | "desc";
}

function buildPropertyWhereClause(filter: PropertyFilterConditions): { whereClause: string; params: unknown[] } {
  const params: unknown[] = [filter.kind];
  const conditions: string[] = [`p.kind = $1`];

  if (filter.search) {
    params.push(`%${filter.search}%`);
    // Also matches a salesperson's name: properties they're on as a custom
    // team member, and "All Members" properties (every active sales user is
    // on those) whenever the name belongs to such a user.
    const n = params.length;
    conditions.push(`(p.name ILIKE $${n} OR p.developer ILIKE $${n} OR p.location ILIKE $${n}
      OR EXISTS (
        SELECT 1 FROM property_team_members ptm JOIN users u ON u.id = ptm.user_id
        WHERE ptm.property_id = p.id AND (u.first_name || COALESCE(' ' || u.last_name, '')) ILIKE $${n}
      )
      OR (p.team_assignment_mode = 'ALL_MEMBERS' AND EXISTS (
        SELECT 1 FROM users u
        WHERE u.department = 'SALES' AND u.role <> 'ADMIN' AND u.status IS DISTINCT FROM 'INACTIVE'
          AND (u.first_name || COALESCE(' ' || u.last_name, '')) ILIKE $${n}
      )))`);
  }

  if (filter.propertyType && filter.propertyType.length > 0) {
    const orConditions = filter.propertyType.map((t) => {
      params.push(`%${t}%`);
      return `p.property_type ILIKE $${params.length}`;
    });
    conditions.push(`(${orConditions.join(" OR ")})`);
  }

  return { whereClause: `WHERE ${conditions.join(" AND ")}`, params };
}

export async function findMany(filter: PropertyListFilter): Promise<{ rows: PropertyRow[]; totalCount: number }> {
  const { whereClause, params } = buildPropertyWhereClause(filter);

  const countResult = await query<{ count: string }>(`SELECT count(*) FROM properties p ${whereClause}`, params);

  const offset = (filter.page - 1) * filter.pageSize;
  const orderDir = filter.sortDir === "asc" ? "ASC" : "DESC";
  params.push(filter.pageSize, offset);
  const dataResult = await query<PropertyRow>(
    `${SELECT} ${whereClause} ORDER BY p.created_at ${orderDir} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { rows: dataResult.rows, totalCount: Number(countResult.rows[0]?.count ?? 0) };
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
  kind?: PropertyKind;
}

async function insertProperty(client: PoolClient, input: PropertyInput, kind: PropertyKind, linkedPropertyId: string | null): Promise<string> {
  // A Data Calling property never picks salespeople, so it gets no team mode of its own.
  const teamMode = kind === "DATA_CALLING" ? null : input.teamAssignmentMode ?? null;
  const leadMode = kind === "DATA_CALLING" ? null : input.leadAssignmentMode ?? null;
  const { rows } = await client.query(
    `INSERT INTO properties (
       name, developer, location, locality, zone, price_value, price_type, property_type, property_status,
       description, possession_date, land_parcel, towers, structure, amenities, contact_number, map_url,
       website_url, brochure_url, lead_registration_url, tags, media_file_names, team_assignment_mode, lead_assignment_mode, kind,
       linked_property_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,COALESCE($23,'ALL_MEMBERS')::team_assignment_mode,$24,$25,$26)
     RETURNING id`,
    [
      input.name, input.developer, input.location, input.locality ?? null, input.zone ?? null,
      input.priceValue ?? null, input.priceType ?? null, input.propertyType, input.propertyStatus ?? null,
      input.description ?? null, input.possessionDate ?? null, input.landParcel ?? null, input.towers ?? null,
      input.structure ?? null, input.amenities ?? null, input.contactNumber || null, input.mapUrl || null,
      input.websiteUrl || null, input.brochureUrl || null, input.leadRegistrationUrl || null,
      input.tags ?? null, input.mediaFileNames ?? null, teamMode, leadMode,
      kind, linkedPropertyId
    ]
  );
  return rows[0].id;
}

/**
 * One Add Property adds the property to both lists: the Leads property and
 * its Data Calling copy (linked_property_id, migration 063). Returns the id
 * of the one in the list it was added from (`input.kind`).
 */
export async function create(input: PropertyInput): Promise<string> {
  return withTransaction(async (client) => {
    const leadsId = await insertProperty(client, input, "LEADS", null);
    const dataCallingId = await insertProperty(client, input, "DATA_CALLING", leadsId);
    return input.kind === "DATA_CALLING" ? dataCallingId : leadsId;
  });
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

// The details both lists share — everything except the Leads-only team settings.
const LEADS_ONLY_FIELDS = new Set(["teamAssignmentMode", "leadAssignmentMode"]);

function setClause(input: Partial<PropertyInput>, fields: (field: string) => boolean): { sets: string[]; params: unknown[] } {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [field, value] of Object.entries(input)) {
    if (value === undefined || !fields(field)) continue;
    const column = FIELD_TO_COLUMN[field];
    if (!column) continue;
    params.push(value === "" ? null : value);
    sets.push(`${column} = $${params.length}`);
  }
  return { sets, params };
}

/**
 * Edits a property. Its details are copied to its twin in the other list
 * (a Leads property's Data Calling copy, or a Data Calling copy's Leads
 * property), so an edit in either list shows in both.
 */
export async function update(id: string, input: Partial<PropertyInput>): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ kind: PropertyKind; linked_property_id: string | null }>(
      `SELECT kind, linked_property_id FROM properties WHERE id = $1`,
      [id]
    );
    const row = rows[0];
    if (!row) return;
    const isDataCalling = row.kind === "DATA_CALLING";

    // A Data Calling property has no team settings to change.
    const own = setClause(input, field => !(isDataCalling && LEADS_ONLY_FIELDS.has(field)));
    if (own.sets.length === 0) return;
    // updated_at is auto-maintained by trg_properties_updated_at (schema.sql) — not set here.
    await client.query(`UPDATE properties SET ${own.sets.join(", ")} WHERE id = $${own.params.length + 1}`, [...own.params, id]);

    const shared = setClause(input, field => !LEADS_ONLY_FIELDS.has(field));
    if (shared.sets.length === 0) return;
    const twin = isDataCalling ? `id = $${shared.params.length + 1}` : `linked_property_id = $${shared.params.length + 1}`;
    const twinKey = isDataCalling ? row.linked_property_id : id;
    if (!twinKey) return;
    await client.query(`UPDATE properties SET ${shared.sets.join(", ")} WHERE ${twin}`, [...shared.params, twinKey]);
  });
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
      // Inactive members stay on the list but get no new leads (percentages re-weight over the rest).
      // Fixed order (by name) so Round Robin rotates through the team the same way every time.
      `SELECT ptm.user_id, ptm.percentage FROM property_team_members ptm
       JOIN users u ON u.id = ptm.user_id
       WHERE ptm.property_id = $1 AND u.status = 'ACTIVE'
       ORDER BY u.first_name, u.last_name, u.id`,
      [propertyId]
    );
    return {
      teamAssignmentMode: property.team_assignment_mode,
      leadAssignmentMode: property.lead_assignment_mode,
      pool: members.map(m => ({ userId: m.user_id, percentage: m.percentage }))
    };
  }

  const { rows: allMembers } = await query<{ id: string }>(
    `SELECT id FROM users WHERE status = 'ACTIVE' AND department = 'SALES' AND role != 'ADMIN'
     ORDER BY first_name, last_name, id`
  );
  return {
    teamAssignmentMode: property.team_assignment_mode,
    leadAssignmentMode: property.lead_assignment_mode,
    pool: allMembers.map(u => ({ userId: u.id, percentage: null }))
  };
}

/** Whoever comes after `last` in the team's fixed order (the first person if `last` isn't on it). */
export function nextInRotation(pool: string[], last: string | null): string {
  const i = last ? pool.indexOf(last) : -1;
  return pool[(i + 1) % pool.length];
}

/**
 * Round Robin's next person for a property, and records them as the last
 * one — atomically: the property's row is locked while picking, so leads
 * arriving at the same moment still go to different people.
 */
export async function takeNextInRotation(propertyId: string, pool: string[]): Promise<string> {
  return withTransaction(async (client) => {
    await client.query(`INSERT INTO property_round_robin (property_id) VALUES ($1) ON CONFLICT DO NOTHING`, [propertyId]);
    const { rows } = await client.query<{ last_user_id: string | null }>(
      `SELECT last_user_id FROM property_round_robin WHERE property_id = $1 FOR UPDATE`,
      [propertyId]
    );
    const next = nextInRotation(pool, rows[0]?.last_user_id ?? null);
    await client.query(`UPDATE property_round_robin SET last_user_id = $2, updated_at = now() WHERE property_id = $1`, [propertyId, next]);
    return next;
  });
}

/** Who got the last Round Robin lead for this property (null = nobody yet). */
export async function getLastInRotation(propertyId: string): Promise<string | null> {
  const { rows } = await query<{ last_user_id: string | null }>(
    `SELECT last_user_id FROM property_round_robin WHERE property_id = $1`,
    [propertyId]
  );
  return rows[0]?.last_user_id ?? null;
}

/** Saves who got the last Round Robin lead (after a bulk upload rotated through the team in memory). */
export async function setLastInRotation(propertyId: string, userId: string): Promise<void> {
  await query(
    `INSERT INTO property_round_robin (property_id, last_user_id) VALUES ($1, $2)
     ON CONFLICT (property_id) DO UPDATE SET last_user_id = EXCLUDED.last_user_id, updated_at = now()`,
    [propertyId, userId]
  );
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
 * Campaign names for the property page's Meta campaign picker: every campaign
 * the Meta sync currently sees as ACTIVE, plus any name a real Meta lead has
 * arrived with that isn't synced yet. Listing synced campaigns is what lets
 * an admin link a new campaign BEFORE its first lead — otherwise that first
 * lead has no property to route to and lands on the fallback admin. Paused
 * or ended campaigns are left out.
 */
export async function listDistinctMetaCampaignNames(): Promise<string[]> {
  const { rows } = await query<{ campaign: string }>(
    `SELECT name AS campaign FROM meta_campaigns WHERE status = 'ACTIVE'
     UNION
     SELECT l.campaign
     FROM leads l
     LEFT JOIN meta_campaigns mc ON mc.name = l.campaign
     WHERE l.source = 'Meta Ads' AND l.campaign IS NOT NULL AND (mc.status = 'ACTIVE' OR mc.id IS NULL)
     ORDER BY campaign`
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

/**
 * Suggestion list for the "Connected Lead-Form Sheets" picker: sheet-source
 * names already seen on an incoming lead, PLUS every property's own name —
 * both filtered to ones not already linked to any property. The seen-names
 * half only ever grows reactively, after a property's campaign has already
 * sent a lead through the sync; including every property's own name lets an
 * admin proactively link a property's expected sheet tab name ahead of
 * time, whether or not its campaign has sent (or is currently sending) any
 * leads yet — a property name is still only a starting suggestion, not a
 * forced value: the sheet tab's real name may differ, and the existing
 * custom-name input next to this list still covers that case either way.
 */
export async function listUnlinkedSheetSourceNames(): Promise<string[]> {
  const { rows } = await query<{ name: string }>(
    `SELECT DISTINCT name FROM (
       SELECT s.name FROM sheet_source_names_seen s
       LEFT JOIN property_sheet_sources pss ON pss.sheet_source_name = s.name
       WHERE pss.id IS NULL
       UNION
       SELECT p.name FROM properties p
       LEFT JOIN property_sheet_sources pss ON pss.sheet_source_name = p.name
       WHERE pss.id IS NULL
     ) combined
     ORDER BY name`
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

/** Used by the Google sheet import to route a lead by its Google campaign name (exact), before falling back to the sheet tab. */
export async function findPropertyIdByGoogleCampaignName(campaignName: string): Promise<string | undefined> {
  const { rows } = await query<{ property_id: string }>(
    `SELECT property_id FROM property_google_campaigns WHERE campaign_name = $1`,
    [campaignName]
  );
  return rows[0]?.property_id;
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
