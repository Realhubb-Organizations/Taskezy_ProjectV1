import { PoolClient } from "pg";
import { pool, query, withTransaction } from "../../db/pool";

/** leads.phone is CHECK'd to a bare 10-digit Indian mobile — strip formatting/country code before insert. Shared by every external lead-ingest source (Meta webhook, sheet import). */
export function normalizeIndianMobile(raw: string): string | undefined {
  const last10 = raw.replace(/\D/g, "").slice(-10);
  return /^[6-9][0-9]{9}$/.test(last10) ? last10 : undefined;
}

export interface LeadListRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status_code: string;
  status_label: string;
  deal_value: string | null;
  lead_score: number | null;
  assigned_agent_id: string;
  assigned_agent_name: string;
  property_id: string | null;
  property_name: string | null;
  assigned_at: string | null;
  first_response_at: string | null;
  created_at: string;
  source: string | null;
  campaign: string | null;
  meta_page_name: string | null;
  meta_form_id: string | null;
  // Real Meta ad id this lead's Lead Ad submission came from (written on
  // ingest, see meta/meta.lead-ingest.ts) — exposed here so the frontend
  // can compute real Qualified Leads per ad set/ad creative for Campaign
  // Deep Dive by matching against meta_ads.id, the same way it already
  // computes Qualified Leads per campaign, instead of duplicating that
  // "what counts as qualified" status logic in backend SQL too.
  meta_ad_id: string | null;
  // Free-text batch label an admin types at bulk-upload time (e.g. "Kashmiri
  // Data") — distinct from `source`, which is fixed to "Bulk Upload" for
  // every lead created that way. Lets one upload batch be filtered,
  // reassigned, and reshuffled as a group later. null for every other
  // ingestion path (Meta, sheet import, manual Add Lead).
  sub_source: string | null;
  // Data Calling's Connected leads carry Qualified/Not Qualified alongside
  // status_code — a second, narrower dimension, not a lead_statuses value.
  // null for every lead that was never a Data Calling Connected lead.
  sub_status: string | null;
  logs: { message: string; timestamp: string; user: string }[];
}

/** Filter fields shared by findMany (the paginated list) and getStats (the dashboard aggregate) — kept as one interface so the two can never silently drift onto different WHERE clauses for "the same filters". */
export interface LeadFilterConditions {
  /** Multi-select — admin CRM lets admins check multiple statuses at once. */
  statusCodes?: string[];
  /** Multi-select, ignored when scopedToAgentId is set (see findMany). */
  assignedAgentId?: string[];
  /** Matches lead.campaign || lead.source, mirroring the frontend's client-side filter. */
  campaign?: string[];
  /** Inclusive calendar-date bounds (YYYY-MM-DD) on created_at. */
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  /** When set (non-admin/manager caller), results are hard-restricted to this agent's own leads. */
  scopedToAgentId?: string;
}

export interface LeadListFilter extends LeadFilterConditions {
  page: number;
  pageSize: number;
}

/** Builds the `WHERE ...` clause (or "" if no filters apply) plus its positional params, shared by findMany and getStats so "pass the same filters to both endpoints" actually means the same SQL predicate both times. */
function buildLeadWhereClause(filter: LeadFilterConditions): { whereClause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.scopedToAgentId) {
    params.push(filter.scopedToAgentId);
    conditions.push(`l.assigned_agent_id = $${params.length}`);
  } else if (filter.assignedAgentId && filter.assignedAgentId.length > 0) {
    if (filter.assignedAgentId.length === 1) {
      params.push(filter.assignedAgentId[0]);
      conditions.push(`l.assigned_agent_id = $${params.length}`);
    } else {
      params.push(filter.assignedAgentId);
      conditions.push(`l.assigned_agent_id = ANY($${params.length}::uuid[])`);
    }
  }

  if (filter.statusCodes && filter.statusCodes.length > 0) {
    if (filter.statusCodes.length === 1) {
      params.push(filter.statusCodes[0]);
      conditions.push(`l.status_code = $${params.length}`);
    } else {
      params.push(filter.statusCodes);
      conditions.push(`l.status_code = ANY($${params.length}::text[])`);
    }
  }

  if (filter.campaign && filter.campaign.length > 0) {
    params.push(filter.campaign);
    conditions.push(`COALESCE(l.campaign, l.source) = ANY($${params.length}::text[])`);
  }

  if (filter.dateFrom) {
    params.push(filter.dateFrom);
    conditions.push(`l.created_at >= $${params.length}::date`);
  }

  if (filter.dateTo) {
    params.push(filter.dateTo);
    conditions.push(`l.created_at < $${params.length}::date + interval '1 day'`);
  }

  if (filter.search) {
    params.push(`%${filter.search}%`);
    conditions.push(`(l.name ILIKE $${params.length} OR l.phone ILIKE $${params.length})`);
  }

  return { whereClause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

const LIST_SELECT = `
  SELECT
    l.id, l.name, l.phone, l.email, l.status_code, ls.label AS status_label,
    l.deal_value, l.lead_score, l.assigned_agent_id,
    u.first_name || COALESCE(' ' || u.last_name, '') AS assigned_agent_name,
    l.property_id, p.name AS property_name,
    l.assigned_at, l.first_response_at, l.created_at,
    l.source, l.sub_source, l.sub_status, l.campaign, l.meta_page_name, l.meta_form_id, l.meta_ad_id,
    COALESCE(
      (SELECT json_agg(json_build_object('message', ll.message, 'timestamp', ll.created_at, 'user', ll.user_name_snapshot) ORDER BY ll.created_at)
       FROM lead_logs ll
       WHERE ll.lead_id = l.id),
      '[]'
    ) AS logs
  FROM leads l
  JOIN users u ON u.id = l.assigned_agent_id
  JOIN lead_statuses ls ON ls.code = l.status_code
  LEFT JOIN properties p ON p.id = l.property_id
`;

export async function findMany(filter: LeadListFilter): Promise<{ rows: LeadListRow[]; totalCount: number }> {
  const { whereClause, params } = buildLeadWhereClause(filter);

  const countResult = await query<{ count: string }>(
    `SELECT count(*) FROM leads l ${whereClause}`,
    params
  );

  const offset = (filter.page - 1) * filter.pageSize;
  params.push(filter.pageSize, offset);
  const dataResult = await query<LeadListRow>(
    `${LIST_SELECT} ${whereClause} ORDER BY l.assigned_at DESC NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { rows: dataResult.rows, totalCount: Number(countResult.rows[0]?.count ?? 0) };
}

export interface StatusCodeCount {
  status_code: string;
  count: string;
}

/**
 * Backend aggregate for the admin CRM Leads tab's 7 stat cards (Total,
 * New, RNR, Call Backs, Follow Ups, Site Visit Scheduled, Site Visit
 * Done) — a dedicated `GROUP BY status_code` instead of fetching any
 * actual lead rows, since the paginated list (findMany) only ever holds
 * one page in memory now. Uses the exact same WHERE-building as findMany
 * (via buildLeadWhereClause) so a caller passing identical filter query
 * params to GET /leads and GET /leads/stats gets numbers that agree with
 * each other. The service layer sums/picks specific status_codes out of
 * the grouped result into the 7 named buckets.
 */
export async function getStats(filter: LeadFilterConditions): Promise<StatusCodeCount[]> {
  const { whereClause, params } = buildLeadWhereClause(filter);
  const { rows } = await query<StatusCodeCount>(
    `SELECT l.status_code, count(*) FROM leads l ${whereClause} GROUP BY l.status_code`,
    params
  );
  return rows;
}

export async function findById(id: string, scopedToAgentId?: string): Promise<LeadListRow | undefined> {
  const params: unknown[] = [id];
  let whereExtra = "";
  if (scopedToAgentId) {
    params.push(scopedToAgentId);
    whereExtra = `AND l.assigned_agent_id = $2`;
  }
  const { rows } = await query<LeadListRow>(`${LIST_SELECT} WHERE l.id = $1 ${whereExtra}`, params);
  return rows[0];
}

export async function findByPhone(phone: string): Promise<{ id: string } | undefined> {
  const { rows } = await query<{ id: string }>(`SELECT id FROM leads WHERE phone = $1`, [phone]);
  return rows[0];
}

export interface CreateLeadInput {
  name: string;
  phone: string;
  email?: string;
  source?: string;
  campaign?: string;
  propertyId?: string;
  assignedAgentId: string;
}

export async function create(input: CreateLeadInput): Promise<LeadListRow> {
  const now = new Date();
  const { rows } = await pool.query(
    `INSERT INTO leads (name, phone, email, source, campaign, property_id, assigned_agent_id, status_code, assigned_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'NEW', $8)
     RETURNING id`,
    [input.name, input.phone, input.email ?? null, input.source ?? null, input.campaign ?? null, input.propertyId ?? null, input.assignedAgentId, now]
  );
  const created = await findById(rows[0].id);
  return created!;
}

export interface BulkCreateLeadRow {
  name: string;
  phone: string;
  assignedAgentId: string;
  /** Unlike create() (always 'NEW'), bulk import's Property-wise mode can fall
   * back to 'UNASSIGNED' when the property has no assignable team, same
   * convention as sheet-import. */
  statusCode: string;
}

/**
 * Inserts up to a few thousand rows in ONE round trip via an unnest-backed
 * multi-row INSERT, instead of one INSERT per row — a 100k-row bulk upload
 * at one query per row would mean 100k sequential round trips to RDS (many
 * minutes, almost certainly past any reasonable request timeout); chunked
 * this way it's ~100k/chunkSize round trips. source/subSource/propertyId
 * are the same for every row in one upload batch, passed once rather than
 * repeated per row. The statement itself is atomic (Postgres guarantees
 * this for any single SQL statement) and ON CONFLICT (phone) DO NOTHING
 * skips both rows that already exist in the table AND duplicate phones
 * within the same chunk in one pass — the caller diffs the returned phones
 * against the attempted ones to know what didn't make it in, rather than
 * needing a try/catch per row.
 */
export async function createBulkLeadsChunk(
  rows: BulkCreateLeadRow[],
  common: { source: string; subSource: string; propertyId: string | null }
): Promise<Set<string>> {
  if (rows.length === 0) return new Set();
  const names = rows.map(r => r.name);
  const phones = rows.map(r => r.phone);
  const agentIds = rows.map(r => r.assignedAgentId);
  const statusCodes = rows.map(r => r.statusCode);

  const { rows: inserted } = await pool.query<{ phone: string }>(
    `INSERT INTO leads (name, phone, source, sub_source, property_id, assigned_agent_id, status_code, assigned_at)
     SELECT n, p, $1, $2, $3, a, s, now()
     FROM unnest($4::text[], $5::text[], $6::uuid[], $7::text[]) AS t(n, p, a, s)
     ON CONFLICT (phone) DO NOTHING
     RETURNING phone`,
    [common.source, common.subSource, common.propertyId, names, phones, agentIds, statusCodes]
  );
  return new Set(inserted.map(r => r.phone));
}

/** Must run inside the same transaction as insertLeadLog (see leads.service.ts). */
export async function updateStatus(
  client: PoolClient,
  leadId: string,
  statusCode: string,
  dealValue: number | undefined,
  stampFirstResponse: boolean,
  // Data Calling's Connected sub-status (Qualified/Not Qualified) — always
  // written alongside status_code (null when statusCode isn't CONNECTED,
  // see leads.service.ts) so a lead can never be left with a stale
  // sub-status from a status it's no longer in.
  subStatus: string | null,
  // Set only when this exact update is the Connected+Qualified promotion —
  // flips source off "Bulk Upload" so the lead starts showing in the main
  // CRM's leads list instead of Data Calling (see AppContext.tsx's
  // leads/dataCallingLeads split). Left undefined for every ordinary status
  // update, which leaves source untouched.
  promotedSource: string | undefined
): Promise<void> {
  await client.query(
    `UPDATE leads
     SET status_code = $1,
         deal_value = COALESCE($2, deal_value),
         first_response_at = CASE WHEN $3 AND first_response_at IS NULL THEN now() ELSE first_response_at END,
         sub_status = $4,
         source = COALESCE($5, source)
     WHERE id = $6`,
    [statusCode, dealValue ?? null, stampFirstResponse, subStatus, promotedSource ?? null, leadId]
  );
}

export async function insertLeadLog(client: PoolClient, leadId: string, userId: string, userName: string, message: string): Promise<void> {
  await client.query(
    `INSERT INTO lead_logs (lead_id, user_id, user_name_snapshot, message) VALUES ($1, $2, $3, $4)`,
    [leadId, userId, userName, message]
  );
}

export interface UnassignedSheetLead {
  id: string;
  property_id: string | null;
  assigned_agent_id: string;
}

/** Sheet-imported leads that fell back to an admin at ingest time — see modules/sheet-import — because no property match and/or no configured team pool was found yet. Re-checked by reassignUnassignedSheetLeads once that's fixed. */
export async function findUnassignedSheetLeads(): Promise<UnassignedSheetLead[]> {
  const { rows } = await query<UnassignedSheetLead>(
    `SELECT id, property_id, assigned_agent_id FROM leads WHERE sheet_lead_key IS NOT NULL AND status_code = 'UNASSIGNED'`
  );
  return rows;
}

const IMPORTED_SHEET_NAME_RE = /^Imported from Google Ads lead-form sheet \(([^)]+)\)/;

/** Recovers the sheet's per-project tab name from a lead's own first import log entry, for leads that had no property_id set at ingest time (name didn't match a property yet). */
export async function findImportedSourceSheetName(leadId: string): Promise<string | undefined> {
  const { rows } = await query<{ message: string }>(
    `SELECT message FROM lead_logs WHERE lead_id = $1 AND message LIKE 'Imported from Google Ads lead-form sheet (%' ORDER BY created_at ASC LIMIT 1`,
    [leadId]
  );
  const match = rows[0]?.message.match(IMPORTED_SHEET_NAME_RE);
  const name = match?.[1];
  return name && name !== "unknown project" ? name : undefined;
}

export async function setLeadPropertyId(leadId: string, propertyId: string): Promise<void> {
  await pool.query(`UPDATE leads SET property_id = $1 WHERE id = $2`, [propertyId, leadId]);
}

/** Flips UNASSIGNED -> NEW once a real agent has actually been resolved for a previously-fallback-assigned lead — matches the status a successful auto-assignment would have set at ingest time. */
export async function markLeadNewIfUnassigned(leadId: string): Promise<void> {
  await pool.query(`UPDATE leads SET status_code = 'NEW' WHERE id = $1 AND status_code = 'UNASSIGNED'`, [leadId]);
}

export interface SheetLeadForTimestampFix {
  id: string;
  created_at: string;
}

/** Every sheet-imported lead, for the one-time created_at backfill (see leads.service.fixSheetLeadTimestamps) — this INSERT started setting created_at correctly itself, so this is only relevant for leads imported before that fix shipped. */
export async function findAllSheetLeads(): Promise<SheetLeadForTimestampFix[]> {
  const { rows } = await query<SheetLeadForTimestampFix>(
    `SELECT id, created_at FROM leads WHERE sheet_lead_key IS NOT NULL`
  );
  return rows;
}

const IMPORTED_TIMESTAMP_RE = /Original sheet timestamp: (.+)$/;

/** Recovers the sheet's own Timestamp column value from a lead's first import log entry — leads imported before ingestSheetLead started setting created_at directly had it silently default to whenever the sync happened to run. */
export async function findImportedOriginalTimestamp(leadId: string): Promise<Date | undefined> {
  const { rows } = await query<{ message: string }>(
    `SELECT message FROM lead_logs WHERE lead_id = $1 AND message LIKE 'Imported from Google Ads lead-form sheet (%' ORDER BY created_at ASC LIMIT 1`,
    [leadId]
  );
  const match = rows[0]?.message.match(IMPORTED_TIMESTAMP_RE);
  if (!match) return undefined;
  const parsed = new Date(match[1].trim());
  return isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function setLeadCreatedAt(leadId: string, createdAt: Date): Promise<void> {
  await pool.query(`UPDATE leads SET created_at = $1 WHERE id = $2`, [createdAt, leadId]);
}

export interface EditLeadInput {
  name?: string;
  email?: string;
  source?: string;
  campaign?: string;
  propertyId?: string | null;
  leadScore?: number;
}

// Only touches columns actually present in the input — COALESCE would wrongly
// keep the old value when someone deliberately clears a field to empty/null,
// so this builds the SET list dynamically instead.
export async function update(id: string, input: EditLeadInput): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.name !== undefined) { params.push(input.name); sets.push(`name = $${params.length}`); }
  if (input.email !== undefined) { params.push(input.email || null); sets.push(`email = $${params.length}`); }
  if (input.source !== undefined) { params.push(input.source); sets.push(`source = $${params.length}`); }
  if (input.campaign !== undefined) { params.push(input.campaign); sets.push(`campaign = $${params.length}`); }
  if (input.propertyId !== undefined) { params.push(input.propertyId); sets.push(`property_id = $${params.length}`); }
  if (input.leadScore !== undefined) { params.push(input.leadScore); sets.push(`lead_score = $${params.length}`); }

  if (sets.length === 0) return;
  params.push(id);
  await pool.query(`UPDATE leads SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
}

export async function getAssignedAgentId(id: string): Promise<string | undefined> {
  const { rows } = await query<{ assigned_agent_id: string }>(`SELECT assigned_agent_id FROM leads WHERE id = $1`, [id]);
  return rows[0]?.assigned_agent_id;
}

/** Must run inside the same transaction as insertLeadLog. Restarts the SLA clock, matching the frontend's reassignLead. */
export async function reassign(client: PoolClient, leadId: string, previousAgentId: string, newAgentId: string): Promise<void> {
  await client.query(
    `UPDATE leads
     SET previous_agent_id = $1, assigned_agent_id = $2, reassigned_at = now(), assigned_at = now(), first_response_at = NULL
     WHERE id = $3`,
    [previousAgentId, newAgentId, leadId]
  );
}

/**
 * Snapshots the lead and its lead_logs into lead_deletion_archive, then deletes
 * the lead — all in one transaction (withTransaction rolls back on any error,
 * so a failed step leaves both the lead and the archive untouched). Returns
 * false if the lead no longer exists. Errors are rethrown unchanged so the
 * service's FK-violation mapping still applies.
 */
export async function archiveAndRemove(id: string, actor: { userId: string; name: string }): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rows: leadRows } = await client.query<{ lead: unknown }>(
      `SELECT to_jsonb(l) AS lead FROM leads l WHERE l.id = $1 FOR UPDATE`,
      [id]
    );
    if (leadRows.length === 0) return false;

    const { rows: logRows } = await client.query<{ logs: unknown }>(
      `SELECT coalesce(jsonb_agg(to_jsonb(lg) ORDER BY lg.created_at), '[]'::jsonb) AS logs
       FROM lead_logs lg WHERE lg.lead_id = $1`,
      [id]
    );

    // Stringified explicitly: node-pg would turn a JS array param into a Postgres array literal, not JSON.
    await client.query(
      `INSERT INTO lead_deletion_archive (lead_id, lead_snapshot, logs_snapshot, deleted_by_user_id, deleted_by_name_snapshot)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, JSON.stringify(leadRows[0].lead), JSON.stringify(logRows[0].logs), actor.userId, actor.name]
    );

    const { rowCount } = await client.query(`DELETE FROM leads WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  });
}

export async function setKycVerified(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`UPDATE leads SET kyc_verified = true WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
