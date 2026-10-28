import { PoolClient } from "pg";
import { pool, query, withTransaction } from "../../db/pool";
import { BUSINESS_TIMEZONE } from "../../utils/businessDate";

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
  /** Agent the lead was last reassigned away from (null if never reassigned). */
  previous_agent_name: string | null;
  reassigned_at: string | null;
  notes: string | null;
  notes_updated_at: string | null;
  notes_updated_by_name: string | null;
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
  // Which admin ran the bulk upload (migration 036) — null for every
  // other ingestion path, and for leads uploaded before this column
  // existed (no audit trail to recover that retroactively).
  uploaded_by_name: string | null;
  // Data Calling's own, independent field (migration 030) — Connected /
  // Called / Not Reachable / Wrong Number, completely separate from
  // status_code. null until the lead has been called at least once.
  call_status: string | null;
  // Qualified / Unqualified — only ever set while call_status is Connected
  // (migration 033).
  call_sub_status: string | null;
  // Distinct business-calendar days this lead has a real phone call logged
  // (call_attempts, channel = 'CALL') — lets the frontend disable the Dead
  // Lead status option until leadStatusTransitions.ts's
  // DEAD_LEAD_MIN_CALL_DAYS threshold is met, instead of only finding out
  // on a rejected save.
  dead_lead_call_days: string;
  // Permanent counter (migration 047), incremented by the SLA scheduler
  // (jobs/followupScheduler.ts) every time a follow-up tied to this lead
  // is flagged MISSED — survives that follow-up row later being
  // superseded/completed, unlike reading status='MISSED' live. The
  // controller strips this for Agent/Member callers (manager/admin-only).
  missed_task_count: number;
  logs: { message: string; timestamp: string; user: string }[];
}

/** Filter fields shared by findMany (the paginated list) and getStats (the dashboard aggregate) — kept as one interface so the two can never silently drift onto different WHERE clauses for "the same filters". */
export interface LeadFilterConditions {
  /** Multi-select — admin CRM lets admins check multiple statuses at once. */
  statusCodes?: string[];
  /** Multi-select, ANDed with scopedToAgentIds when both are set (see findMany). */
  assignedAgentId?: string[];
  /** Matches lead.campaign || lead.source, mirroring the frontend's client-side filter. */
  campaign?: string[];
  /** Not exposed on GET /leads or /leads/stats today — only the Leads Analytics tab's aggregate (getAnalyticsStatsByAgent) takes this, to mirror that tab's Property toolbar filter. */
  propertyId?: string[];
  /** Also match leads with no property (the "Not set" filter option) — ORed with propertyId. */
  noProperty?: boolean;
  /** Inclusive calendar-date bounds (YYYY-MM-DD) on created_at. */
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  /** Leave out Data Calling leads (source "Bulk Upload"). */
  excludeBulkUpload?: boolean;
  /** When set (a sales Member or Manager caller — see leads.service.ts's scopeForCaller), results are hard-restricted to these agent ids: just the caller for a Member, the caller plus their direct reports for a Manager. Always ANDed with assignedAgentId, never overridden by it — this is a security boundary, the client's own filter choice is not allowed to widen it. */
  scopedToAgentIds?: string[];
  /** Live-clock SLA check — same predicate getAgentReportStats's missed_leads FILTER already uses, applied as a row filter instead of a conditional count. Requires slaMinutes below when true. */
  missedOnly?: boolean;
  /** Required when missedOnly is true — reuse leads.service.ts's REPORT_SLA_MINUTES, don't invent a second source of truth. */
  slaMinutes?: number;
}

export interface LeadListFilter extends LeadFilterConditions {
  page: number;
  pageSize: number;
}

/** Builds the `WHERE ...` clause (or "" if no filters apply) plus its positional params, shared by findMany and getStats so "pass the same filters to both endpoints" actually means the same SQL predicate both times. */
function buildLeadWhereClause(filter: LeadFilterConditions): { whereClause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.scopedToAgentIds && filter.scopedToAgentIds.length > 0) {
    params.push(filter.scopedToAgentIds);
    conditions.push(`l.assigned_agent_id = ANY($${params.length}::uuid[])`);
  }

  if (filter.assignedAgentId && filter.assignedAgentId.length > 0) {
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

  if (filter.excludeBulkUpload) {
    conditions.push(`l.source IS DISTINCT FROM 'Bulk Upload'`);
  }

  if (filter.campaign && filter.campaign.length > 0) {
    params.push(filter.campaign);
    conditions.push(`COALESCE(l.campaign, l.source) = ANY($${params.length}::text[])`);
  }

  const hasPropertyIds = !!filter.propertyId && filter.propertyId.length > 0;
  if (hasPropertyIds) {
    params.push(filter.propertyId);
    conditions.push(filter.noProperty
      ? `(l.property_id = ANY($${params.length}::uuid[]) OR l.property_id IS NULL)`
      : `l.property_id = ANY($${params.length}::uuid[])`);
  } else if (filter.noProperty) {
    conditions.push(`l.property_id IS NULL`);
  }

  // dateFrom/dateTo are business-calendar days, so each bound is midnight in
  // BUSINESS_TIMEZONE, not midnight UTC (05:30 IST).
  if (filter.dateFrom) {
    params.push(filter.dateFrom, BUSINESS_TIMEZONE);
    conditions.push(`l.created_at >= ($${params.length - 1}::date::timestamp AT TIME ZONE $${params.length})`);
  }

  if (filter.dateTo) {
    params.push(filter.dateTo, BUSINESS_TIMEZONE);
    conditions.push(`l.created_at < (($${params.length - 1}::date + 1)::timestamp AT TIME ZONE $${params.length})`);
  }

  if (filter.search) {
    params.push(`%${filter.search}%`);
    conditions.push(`(l.name ILIKE $${params.length} OR l.phone ILIKE $${params.length})`);
  }

  if (filter.missedOnly) {
    params.push(filter.slaMinutes);
    const slaParam = params.length;
    conditions.push(`l.source <> 'Bulk Upload' AND l.assigned_at IS NOT NULL AND (
      (l.first_response_at IS NOT NULL AND EXTRACT(EPOCH FROM (l.first_response_at - l.assigned_at)) / 60 > $${slaParam}::numeric)
      OR (l.first_response_at IS NULL AND EXTRACT(EPOCH FROM (now() - l.assigned_at)) / 60 > $${slaParam}::numeric)
    )`);
  }

  return { whereClause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

const LIST_SELECT = `
  SELECT
    l.id, l.name, l.phone, l.email, l.status_code, ls.label AS status_label,
    l.deal_value, l.lead_score, l.assigned_agent_id,
    u.first_name || COALESCE(' ' || u.last_name, '') AS assigned_agent_name,
    COALESCE(pu.first_name || COALESCE(' ' || pu.last_name, ''), l.previous_agent_name) AS previous_agent_name, l.reassigned_at,
    l.notes, l.notes_updated_at,
    nu.first_name || COALESCE(' ' || nu.last_name, '') AS notes_updated_by_name,
    bu.first_name || COALESCE(' ' || bu.last_name, '') AS uploaded_by_name,
    l.property_id, p.name AS property_name,
    l.assigned_at, l.first_response_at, l.created_at,
    l.source, l.sub_source, l.call_status, l.call_sub_status, l.campaign, l.meta_page_name, l.meta_form_id, l.meta_ad_id,
    (SELECT count(DISTINCT (ca.created_at AT TIME ZONE '${BUSINESS_TIMEZONE}')::date)
     FROM call_attempts ca WHERE ca.lead_id = l.id AND ca.channel = 'CALL') AS dead_lead_call_days,
    l.missed_task_count,
    COALESCE(
      (SELECT json_agg(json_build_object('message', ll.message, 'timestamp', ll.created_at, 'user', ll.user_name_snapshot) ORDER BY ll.created_at)
       FROM lead_logs ll
       WHERE ll.lead_id = l.id),
      '[]'
    ) AS logs
  FROM leads l
  JOIN users u ON u.id = l.assigned_agent_id
  LEFT JOIN users pu ON pu.id = l.previous_agent_id
  LEFT JOIN users nu ON nu.id = l.notes_updated_by
  LEFT JOIN users bu ON bu.id = l.uploaded_by_user_id
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

/**
 * Distinct campaign names for a drill-down panel's Campaign filter dropdown
 * — same COALESCE(campaign, source) key buildLeadWhereClause's own campaign
 * filter already matches against, scoped by whatever filter the caller
 * passes (same scopedToAgentIds boundary as every other leads query).
 */
export async function getDistinctCampaigns(filter: LeadFilterConditions): Promise<string[]> {
  const { whereClause, params } = buildLeadWhereClause(filter);
  const conditions = whereClause ? `${whereClause} AND COALESCE(l.campaign, l.source) IS NOT NULL` : `WHERE COALESCE(l.campaign, l.source) IS NOT NULL`;
  const { rows } = await query<{ campaign: string }>(
    `SELECT DISTINCT COALESCE(l.campaign, l.source) AS campaign FROM leads l ${conditions} ORDER BY 1`,
    params
  );
  return rows.map(r => r.campaign);
}

export interface AgentAnalyticsRow {
  assigned_agent_id: string;
  total: string;
  unqualified: string;
  site_visits: string;
}

/**
 * Backend aggregate for the Leads Analytics tab (LeadDashboard.tsx's
 * computeLeadStats/adminManagerRows) — one row per agent instead of the
 * full lead list, same buildLeadWhereClause as findMany/getStats so this
 * tab's Property/Campaign/Date filters produce numbers consistent with the
 * plain Leads tab's. `unqualified`/`siteVisits` use Postgres's FILTER
 * clause rather than two separate GROUP BY buckets, since a Site Visit
 * Done lead must count toward both `total` and `siteVisits` at once (it's
 * never "unqualified" — the two sets don't overlap, see unqualifiedCodes/
 * siteVisitCodes in leads.service.ts). qualified = total - unqualified is
 * computed in the service layer, matching the frontend's own computeLeadStats.
 */
export async function getAnalyticsStatsByAgent(
  filter: LeadFilterConditions,
  unqualifiedCodes: string[],
  siteVisitCodes: string[]
): Promise<AgentAnalyticsRow[]> {
  const { whereClause, params } = buildLeadWhereClause(filter);
  params.push(unqualifiedCodes, siteVisitCodes);
  const unqualifiedParam = params.length - 1;
  const siteVisitParam = params.length;
  const { rows } = await query<AgentAnalyticsRow>(
    `SELECT l.assigned_agent_id,
            count(*) AS total,
            count(*) FILTER (WHERE l.status_code = ANY($${unqualifiedParam}::text[])) AS unqualified,
            count(*) FILTER (WHERE l.status_code = ANY($${siteVisitParam}::text[])) AS site_visits
     FROM leads l
     ${whereClause}
     GROUP BY l.assigned_agent_id`,
    params
  );
  return rows;
}

export interface AgentReportRow {
  assigned: string;
  contacted: string;
  qualified: string;
  site_visits: string;
  booking_value: string;
  booking_count: string;
  allocated_spend: string;
  missed_leads: string;
}

/**
 * Backend aggregate for the Agent report tab (AgentReports.tsx's
 * computeAgentFunnel/computeBookingValue/computeBookingCount/
 * computeCampaignAttributedSpend/isMissedLead) — a single aggregate row
 * (the caller passes one agent's id via filter.assignedAgentId, same
 * scopedToAgentIds security boundary as every other leads endpoint; a
 * Member/Manager requesting another agent's id gets zero rows, not that
 * agent's data, since scopedToAgentIds is always ANDed in). No GROUP BY
 * needed — unlike getAnalyticsStatsByAgent, this never returns more than
 * one agent's numbers per call.
 *
 * allocated_spend mirrors computeCampaignAttributedSpend's exact
 * same-string campaign match (l.campaign = ad_spend_records.account_name,
 * case-sensitive, no COALESCE-to-source fallback) — a deliberately
 * stricter rule than campaign-lead-stats' LOWER(COALESCE(...)) join,
 * since that's what the frontend function it replaces always did.
 *
 * missed_leads is computed at query time (now() for a lead with no
 * response yet), not cached — a still-unanswered lead becomes "missed"
 * purely by time passing, same live-clock rule reportMetrics.ts's
 * getMissedInfo always used client-side.
 */
export async function getAgentReportStats(
  filter: LeadFilterConditions,
  qualifiedCodes: string[],
  siteVisitCodes: string[],
  slaMinutes: number
): Promise<AgentReportRow> {
  const { whereClause, params } = buildLeadWhereClause(filter);
  params.push(qualifiedCodes, siteVisitCodes, filter.dateFrom ?? null, filter.dateTo ?? null, slaMinutes);
  const qualifiedParam = params.length - 4;
  const siteVisitParam = params.length - 3;
  const dateFromParam = params.length - 2;
  const dateToParam = params.length - 1;
  const slaParam = params.length;
  const { rows } = await query<AgentReportRow>(
    `WITH campaign_cpl AS (
       SELECT account_name, SUM(spend) / NULLIF(SUM(leads_generated), 0) AS spend_per_lead
       FROM ad_spend_records
       WHERE ($${dateFromParam}::date IS NULL OR spend_date >= $${dateFromParam}::date)
         AND ($${dateToParam}::date IS NULL OR spend_date <= $${dateToParam}::date)
       GROUP BY account_name
     )
     SELECT count(*) AS assigned,
            count(*) FILTER (WHERE l.status_code != 'NEW_LEAD') AS contacted,
            count(*) FILTER (WHERE l.status_code = ANY($${qualifiedParam}::text[])) AS qualified,
            count(*) FILTER (WHERE l.status_code = ANY($${siteVisitParam}::text[])) AS site_visits,
            COALESCE(SUM(l.deal_value) FILTER (WHERE l.status_code = 'BOOKED'), 0) AS booking_value,
            count(*) FILTER (WHERE l.status_code = 'BOOKED') AS booking_count,
            COALESCE(SUM(c.spend_per_lead), 0) AS allocated_spend,
            count(*) FILTER (
              WHERE l.source <> 'Bulk Upload' AND l.assigned_at IS NOT NULL AND (
                (l.first_response_at IS NOT NULL AND EXTRACT(EPOCH FROM (l.first_response_at - l.assigned_at)) / 60 > $${slaParam}::numeric)
                OR (l.first_response_at IS NULL AND EXTRACT(EPOCH FROM (now() - l.assigned_at)) / 60 > $${slaParam}::numeric)
              )
            ) AS missed_leads
     FROM leads l
     LEFT JOIN campaign_cpl c ON c.account_name = l.campaign
     ${whereClause}`,
    params
  );
  return rows[0];
}

/**
 * The Agent report's "Missed Follow-ups" KPI count — follow_up_calls isn't
 * otherwise part of this repository, but this stat is tightly coupled to
 * getAgentReportStats above (same report, same one-agent/date-range shape),
 * so it lives here rather than a one-function followups.repository.ts.
 * Mirrors reportMetrics.ts's filterFollowupsByRange + `f.status === "Missed"`
 * — scheduled_at is the same date field FollowupCall.date maps from.
 *
 * scopedToAgentIds is the same hard security boundary buildLeadWhereClause
 * applies to the leads side — ANDed with assignedToId, never overridden by
 * it, so a Member/Manager requesting an id outside their own scope gets 0,
 * not that agent's real count.
 */
export async function getMissedFollowupCount(
  assignedToId: string | undefined,
  scopedToAgentIds: string[] | undefined,
  dateFrom?: string,
  dateTo?: string
): Promise<number> {
  const conditions: string[] = [`fc.status = 'MISSED'`];
  const params: unknown[] = [];
  if (assignedToId) {
    params.push(assignedToId);
    conditions.push(`fc.assigned_to_id = $${params.length}`);
  }
  if (scopedToAgentIds) {
    params.push(scopedToAgentIds);
    conditions.push(`fc.assigned_to_id = ANY($${params.length}::uuid[])`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`fc.scheduled_at >= $${params.length}::date`);
  }
  if (dateTo) {
    params.push(dateTo);
    conditions.push(`fc.scheduled_at < ($${params.length}::date + 1)`);
  }
  const { rows } = await query<{ count: string }>(
    `SELECT count(*) FROM followup_calls fc WHERE ${conditions.join(" AND ")}`,
    params
  );
  return Number(rows[0]?.count ?? 0);
}

export interface ManagerReportRow {
  assigned_agent_id: string;
  leads_count: string;
  spend: string;
  booking_value: string;
  missed_count: string;
  missed_followups: string;
}

/**
 * Backend aggregate for the Manager report tab (ManagerReports.tsx) — one
 * row per agent (manager or direct report alike), same shape precedent as
 * getAnalyticsStatsByAgent: the Individual/Team/Combined split and the
 * per-member breakdown both stay client-side, summing each manager's own
 * row with their direct reports' rows (same "sum small per-agent rows"
 * pattern LeadDashboard.tsx's adminManagerRows already uses) — only the
 * per-agent numbers themselves move here. spend/missed_count mirror
 * getAgentReportStats' own campaign_cpl join and live-clock missed rule;
 * missed_followups is a separate grouped query against follow-up_calls
 * (different table, different scope column) left-joined on by agent id.
 */
export async function getManagerReportStatsByAgent(
  filter: LeadFilterConditions,
  slaMinutes: number
): Promise<ManagerReportRow[]> {
  const { whereClause, params } = buildLeadWhereClause(filter);
  params.push(filter.dateFrom ?? null, filter.dateTo ?? null, slaMinutes);
  const dateFromParam = params.length - 2;
  const dateToParam = params.length - 1;
  const slaParam = params.length;

  // Continues the SAME params array (not a fresh one) — this subquery's
  // placeholders are interpolated into the one query string below, so
  // they must count on from where the leads-side params left off.
  let followupScopeClause = "";
  if (filter.scopedToAgentIds) {
    params.push(filter.scopedToAgentIds);
    followupScopeClause = `AND fc.assigned_to_id = ANY($${params.length}::uuid[])`;
  }
  let followupDateClause = "";
  if (filter.dateFrom) {
    params.push(filter.dateFrom);
    followupDateClause += ` AND fc.scheduled_at >= $${params.length}::date`;
  }
  if (filter.dateTo) {
    params.push(filter.dateTo);
    followupDateClause += ` AND fc.scheduled_at < ($${params.length}::date + 1)`;
  }

  const { rows } = await query<ManagerReportRow>(
    `WITH campaign_cpl AS (
       SELECT account_name, SUM(spend) / NULLIF(SUM(leads_generated), 0) AS spend_per_lead
       FROM ad_spend_records
       WHERE ($${dateFromParam}::date IS NULL OR spend_date >= $${dateFromParam}::date)
         AND ($${dateToParam}::date IS NULL OR spend_date <= $${dateToParam}::date)
       GROUP BY account_name
     ),
     followup_stats AS (
       SELECT fc.assigned_to_id, count(*) FILTER (WHERE fc.status = 'MISSED') AS missed_followups
       FROM followup_calls fc
       WHERE fc.status = 'MISSED' ${followupScopeClause} ${followupDateClause}
       GROUP BY fc.assigned_to_id
     )
     SELECT l.assigned_agent_id,
            count(*) AS leads_count,
            COALESCE(SUM(c.spend_per_lead), 0) AS spend,
            COALESCE(SUM(l.deal_value) FILTER (WHERE l.status_code = 'BOOKED'), 0) AS booking_value,
            count(*) FILTER (
              WHERE l.source <> 'Bulk Upload' AND l.assigned_at IS NOT NULL AND (
                (l.first_response_at IS NOT NULL AND EXTRACT(EPOCH FROM (l.first_response_at - l.assigned_at)) / 60 > $${slaParam}::numeric)
                OR (l.first_response_at IS NULL AND EXTRACT(EPOCH FROM (now() - l.assigned_at)) / 60 > $${slaParam}::numeric)
              )
            ) AS missed_count,
            COALESCE(MAX(fs.missed_followups), 0) AS missed_followups
     FROM leads l
     LEFT JOIN campaign_cpl c ON c.account_name = l.campaign
     LEFT JOIN followup_stats fs ON fs.assigned_to_id = l.assigned_agent_id
     ${whereClause}
     GROUP BY l.assigned_agent_id`,
    params
  );
  return rows;
}

export async function findById(id: string, scopedToAgentIds?: string[]): Promise<LeadListRow | undefined> {
  const params: unknown[] = [id];
  let whereExtra = "";
  if (scopedToAgentIds && scopedToAgentIds.length > 0) {
    params.push(scopedToAgentIds);
    whereExtra = `AND l.assigned_agent_id = ANY($2::uuid[])`;
  }
  const { rows } = await query<LeadListRow>(`${LIST_SELECT} WHERE l.id = $1 ${whereExtra}`, params);
  return rows[0];
}

/** Exact-match bulk lookup (Admin-only Leads page feature: paste/upload many phone numbers at once) — not routed through buildLeadWhereClause's paginated filter machinery since this always wants every match in one shot, not a page. */
export async function findManyByPhones(phones: string[]): Promise<LeadListRow[]> {
  if (phones.length === 0) return [];
  const { rows } = await query<LeadListRow>(
    `${LIST_SELECT} WHERE l.phone = ANY($1::text[]) ORDER BY l.assigned_at DESC NULLS LAST`,
    [phones]
  );
  return rows;
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
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'NEW_LEAD', $8)
     RETURNING id`,
    [input.name, input.phone, input.email ?? null, input.source ?? null, input.campaign ?? null, input.propertyId ?? null, input.assignedAgentId, now]
  );
  const created = await findById(rows[0].id);
  return created!;
}

export interface BulkCreateLeadRow {
  name: string;
  phone: string;
  email: string | null;
  assignedAgentId: string;
  /** Unlike create() (always 'NEW_LEAD'), bulk import's Property-wise mode can fall
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
  common: { source: string; subSource: string | null; propertyId: string | null; uploadedByUserId: string }
): Promise<Map<string, string>> {
  if (rows.length === 0) return new Map();
  const names = rows.map(r => r.name);
  const phones = rows.map(r => r.phone);
  const emails = rows.map(r => r.email);
  const agentIds = rows.map(r => r.assignedAgentId);
  const statusCodes = rows.map(r => r.statusCode);

  const { rows: inserted } = await pool.query<{ id: string; phone: string }>(
    `INSERT INTO leads (name, phone, email, source, sub_source, property_id, assigned_agent_id, status_code, assigned_at, uploaded_by_user_id)
     SELECT n, p, e, $1, $2, $3, a, s, now(), $9
     FROM unnest($4::text[], $5::text[], $6::text[], $7::uuid[], $8::text[]) AS t(n, p, e, a, s)
     ON CONFLICT (phone) DO NOTHING
     RETURNING id, phone`,
    [common.source, common.subSource, common.propertyId, names, phones, emails, agentIds, statusCodes, common.uploadedByUserId]
  );
  return new Map(inserted.map(r => [r.phone, r.id]));
}

/** How many of the given phones already belong to an active lead — informational count for bulk-import's precheck, never gates the real import. */
export async function countLeadsByPhones(phones: string[]): Promise<number> {
  if (phones.length === 0) return 0;
  const { rows } = await pool.query<{ count: string }>(`SELECT count(*) FROM leads WHERE phone = ANY($1::text[])`, [phones]);
  return Number(rows[0]?.count ?? 0);
}

export interface ArchivedLeadMatch {
  name: string;
  deletedAt: string;
  deletedByName: string;
  logs: unknown[];
}

/**
 * Most-recent `lead_deletion_archive` row per phone, for the given list —
 * used by bulk-import's "this phone was previously deleted" check (see
 * leads.service.ts's precheckBulkImportLeads/bulkImportLeads). Reads only
 * (the archive table deliberately has no UPDATE/DELETE grant for the app
 * role — see migration 020/021's comments) — nothing here ever marks or
 * mutates an archive row, it's purely a lookup.
 */
export async function findArchivedMatchesByPhones(phones: string[]): Promise<Map<string, ArchivedLeadMatch>> {
  if (phones.length === 0) return new Map();
  const { rows } = await pool.query<{ phone: string; name: string; deleted_at: string; deleted_by_name_snapshot: string; logs_snapshot: unknown[] }>(
    `SELECT DISTINCT ON (lead_snapshot->>'phone')
       lead_snapshot->>'phone' AS phone, lead_snapshot->>'name' AS name,
       deleted_at, deleted_by_name_snapshot, logs_snapshot
     FROM lead_deletion_archive
     WHERE lead_snapshot->>'phone' = ANY($1::text[])
     ORDER BY lead_snapshot->>'phone', deleted_at DESC`,
    [phones]
  );
  return new Map(
    rows.map(r => [r.phone, { name: r.name, deletedAt: r.deleted_at, deletedByName: r.deleted_by_name_snapshot, logs: r.logs_snapshot }])
  );
}

/**
 * Re-attaches archived call/note history onto newly (re-)created leads —
 * one unnest-backed multi-row INSERT for every log line across every lead
 * in this chunk, same pattern as scripts/importMigration4050.ts's own
 * bulk note-history insert. Each log's real original user_id/
 * user_name_snapshot/created_at come straight from the archived snapshot
 * (to_jsonb of the real lead_logs row), not substituted.
 */
export async function insertRestoredLeadLogsChunk(rows: { newLeadId: string; logs: unknown[] }[]): Promise<void> {
  const leadIds: string[] = [];
  const userIds: string[] = [];
  const userNames: string[] = [];
  const messages: string[] = [];
  const timestamps: string[] = [];
  for (const row of rows) {
    for (const log of row.logs as { user_id: string; user_name_snapshot: string; message: string; created_at: string }[]) {
      leadIds.push(row.newLeadId);
      userIds.push(log.user_id);
      userNames.push(log.user_name_snapshot);
      messages.push(log.message);
      timestamps.push(log.created_at);
    }
  }
  if (leadIds.length === 0) return;
  await pool.query(
    `INSERT INTO lead_logs (lead_id, user_id, user_name_snapshot, message, created_at)
     SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::timestamptz[])`,
    [leadIds, userIds, userNames, messages, timestamps]
  );
}

/** Must run inside the same transaction as insertLeadLog (see leads.service.ts). */
export async function updateStatus(
  client: PoolClient,
  leadId: string,
  statusCode: string,
  dealValue: number | undefined,
  stampFirstResponse: boolean
): Promise<void> {
  await client.query(
    `UPDATE leads
     SET status_code = $1,
         deal_value = COALESCE($2, deal_value),
         first_response_at = CASE WHEN $3 AND first_response_at IS NULL THEN now() ELSE first_response_at END
     WHERE id = $4`,
    [statusCode, dealValue ?? null, stampFirstResponse, leadId]
  );
}

/**
 * Data Calling's own field (migration 030) — independent of status_code.
 * Must run inside the same transaction as insertLeadLog (see
 * leads.service.ts's updateCallStatus).
 */
export async function updateCallStatus(
  client: PoolClient,
  leadId: string,
  callStatus: string,
  callSubStatus: string | null,
  // Set only when this exact update is the Connected promotion — flips
  // source off "Bulk Upload" (graduating the lead out of Data Calling into
  // the main CRM leads list, see AppContext.tsx's leads/dataCallingLeads
  // split) and resets status_code to NEW_LEAD (entering the real pipeline
  // fresh). Left undefined for every ordinary call-status update, which
  // leaves both columns untouched.
  promotion: { source: string; statusCode: string } | undefined
): Promise<void> {
  await client.query(
    `UPDATE leads
     SET call_status = $1,
         call_sub_status = $5,
         source = COALESCE($2, source),
         status_code = COALESCE($3, status_code)
     WHERE id = $4`,
    [callStatus, promotion?.source ?? null, promotion?.statusCode ?? null, leadId, callSubStatus]
  );
}

/** Must run inside the same transaction as insertLeadLog. */
export async function setNote(client: PoolClient, leadId: string, note: string, userId: string): Promise<void> {
  await client.query(
    `UPDATE leads SET notes = $1, notes_updated_at = now(), notes_updated_by = $2 WHERE id = $3`,
    [note, userId, leadId]
  );
}

export async function setPropertyId(client: PoolClient, leadId: string, propertyId: string | null): Promise<void> {
  await client.query(`UPDATE leads SET property_id = $1 WHERE id = $2`, [propertyId, leadId]);
}

/** Locks and returns every lead held by `agentId`, oldest first (for handing them over before the agent is deleted). */
export async function lockLeadIdsForAgent(client: PoolClient, agentId: string): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM leads WHERE assigned_agent_id = $1 ORDER BY created_at, id FOR UPDATE`,
    [agentId]
  );
  return rows.map(r => r.id);
}

/**
 * Moves follow-ups assigned to `fromUserId` to the current owner of their
 * lead (run after that user's leads were handed over). Returns how many
 * follow-ups are still assigned to them (e.g. ones with no lead).
 */
export async function moveFollowupsToLeadOwners(client: PoolClient, fromUserId: string): Promise<number> {
  await client.query(
    `UPDATE followup_calls fc SET assigned_to_id = l.assigned_agent_id
     FROM leads l
     WHERE fc.lead_id = l.id AND fc.assigned_to_id = $1 AND l.assigned_agent_id IS NOT NULL AND l.assigned_agent_id <> $1`,
    [fromUserId]
  );
  const { rows } = await client.query<{ count: string }>(`SELECT count(*) FROM followup_calls WHERE assigned_to_id = $1`, [fromUserId]);
  return Number(rows[0]?.count ?? 0);
}

/** Leads currently held by `agentId`. */
export async function countLeadsForAgent(agentId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(`SELECT count(*) FROM leads WHERE assigned_agent_id = $1`, [agentId]);
  return Number(rows[0]?.count ?? 0);
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
  await pool.query(`UPDATE leads SET status_code = 'NEW_LEAD' WHERE id = $1 AND status_code = 'UNASSIGNED'`, [leadId]);
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
    // previous_agent_name keeps the previous owner's name on the lead, so
    // "Reassigned From" survives that user being deleted (migration 032).
    `UPDATE leads
     SET previous_agent_id = $1,
         previous_agent_name = (SELECT first_name || COALESCE(' ' || last_name, '') FROM users WHERE id = $1),
         assigned_agent_id = $2, reassigned_at = now(), assigned_at = now(), first_response_at = NULL
     WHERE id = $3`,
    [previousAgentId, newAgentId, leadId]
  );
}

/**
 * Before a user is deleted: leads that list them as "Reassigned From" keep
 * their name (previous_agent_name) and drop the link to the soon-deleted
 * user row, so the delete can't fail on it and the history stays readable.
 */
export async function detachPreviousAgent(client: PoolClient, userId: string, userName: string): Promise<void> {
  await client.query(
    `UPDATE leads SET previous_agent_name = COALESCE(previous_agent_name, $2), previous_agent_id = NULL WHERE previous_agent_id = $1`,
    [userId, userName]
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

export interface ArchiveAndRemoveChunkResult {
  deleted: string[];
  notFound: string[];
  blocked: { id: string; reason: string }[];
}

/**
 * Batched version of archiveAndRemove for bulk delete — same archive-then-
 * delete guarantee, but one chunk (not one lead) per transaction and one
 * set-based query per step instead of 4 queries × N leads.
 *
 * A lead with an invoice can't be deleted (FK restrict) — archiveAndRemove
 * catches that per-row via a thrown exception, which a single batched
 * DELETE can't offer (one bad row fails the whole statement). This instead
 * excludes blocked ids from the chunk up front via one query, so the rest
 * of the chunk is unaffected — same per-lead isolation guarantee, just
 * resolved before the delete instead of after.
 */
export async function archiveAndRemoveChunk(ids: string[], actor: { userId: string; name: string }): Promise<ArchiveAndRemoveChunkResult> {
  if (ids.length === 0) return { deleted: [], notFound: [], blocked: [] };

  return withTransaction(async (client) => {
    const { rows: blockedRows } = await client.query<{ lead_id: string }>(
      `SELECT DISTINCT lead_id FROM invoices WHERE lead_id = ANY($1::uuid[])`,
      [ids]
    );
    const blockedIds = new Set(blockedRows.map(r => r.lead_id));
    const blocked = blockedRows.map(r => ({ id: r.lead_id, reason: "Has an associated invoice; delete the invoice first" }));
    const candidateIds = ids.filter(id => !blockedIds.has(id));
    if (candidateIds.length === 0) return { deleted: [], notFound: ids.filter(id => !blockedIds.has(id)), blocked };

    const { rows: leadRows } = await client.query<{ id: string; lead: unknown }>(
      `SELECT l.id, to_jsonb(l) AS lead FROM leads l WHERE l.id = ANY($1::uuid[]) FOR UPDATE`,
      [candidateIds]
    );
    const foundIds = leadRows.map(r => r.id);
    const notFound = candidateIds.filter(id => !foundIds.includes(id));
    if (foundIds.length === 0) return { deleted: [], notFound, blocked };

    const { rows: logRows } = await client.query<{ lead_id: string; logs: unknown }>(
      `SELECT lg.lead_id, coalesce(jsonb_agg(to_jsonb(lg) ORDER BY lg.created_at), '[]'::jsonb) AS logs
       FROM lead_logs lg WHERE lg.lead_id = ANY($1::uuid[]) GROUP BY lg.lead_id`,
      [foundIds]
    );
    const logsByLeadId = new Map(logRows.map(r => [r.lead_id, r.logs]));

    const leadSnapshots = leadRows.map(r => JSON.stringify(r.lead));
    const logSnapshots = leadRows.map(r => JSON.stringify(logsByLeadId.get(r.id) ?? []));
    const deletedByUserIds = leadRows.map(() => actor.userId);
    const deletedByNames = leadRows.map(() => actor.name);

    await client.query(
      `INSERT INTO lead_deletion_archive (lead_id, lead_snapshot, logs_snapshot, deleted_by_user_id, deleted_by_name_snapshot)
       SELECT * FROM unnest($1::uuid[], $2::jsonb[], $3::jsonb[], $4::uuid[], $5::text[])`,
      [foundIds, leadSnapshots, logSnapshots, deletedByUserIds, deletedByNames]
    );

    await client.query(`DELETE FROM leads WHERE id = ANY($1::uuid[])`, [foundIds]);

    return { deleted: foundIds, notFound, blocked };
  });
}

export async function setKycVerified(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`UPDATE leads SET kyc_verified = true WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
