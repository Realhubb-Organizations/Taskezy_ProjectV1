import type { PoolClient } from "pg";
import { QUALIFIED_STATUS_CODES } from "./qualifiedLeads";
import { query, withTransaction } from "../../db/pool";
import { AccessTokenPayload } from "../../utils/tokens";
import { ApiError } from "../../utils/ApiError";
import * as repo from "./leads.repository";
import { CreateLeadInput } from "./leads.repository";
import * as usersRepo from "../users/users.repository";
import { createNotification, deleteLeadActivityNotifications } from "../notifications/notifications.service";
import { leadIdsLink } from "../notifications/notificationLinks";
import { findPropertyIdBySheetSource, findPropertyIdByGoogleCampaignName, findById as findPropertyById, getAssignmentPool } from "../properties/properties.repository";
import { pickAgentForProperty, createPropertyAgentPicker } from "../properties/properties.assignment";
import { broadcastLeadChanged, broadcastManyLeadsChanged } from "./leads.realtime";
import { HANDOVER_NOTE_PREFIX } from "./leads.handover";
import { normalizeTypedLeadPhone } from "../../utils/validation";
import { logger } from "../../utils/logger";
import { SALES_TRACKER_EMAILS } from "../../config/salesTracker";
import { assertTransitionAllowed, LeadStatusCode, REVIVED_CODE } from "./leadStatusTransitions";

/**
 * Mirrors the frontend's role-based lead-scoping convention (see the
 * project_crm_role_based_lead_scoping memory / AppContext.tsx /
 * LeadDashboard.tsx): a sales "Member" only ever sees their own leads; a
 * "Manager" sees themself plus their own direct reports' leads — never the
 * whole company; Finance and Admin see everything. This is the server-side
 * enforcement of that rule — the frontend's version is only ever a UI
 * filter, trivially bypassable by calling the API directly, which is
 * exactly why this needs to be re-checked here, not trusted from the
 * client. Returns the list of agent ids the caller's leads are restricted
 * to, or undefined for "no restriction" (Finance/Admin).
 */
export async function scopeForCaller(caller: AccessTokenPayload): Promise<string[] | undefined> {
  if (caller.role !== "AGENT") return undefined;
  if (caller.roleType === "MEMBER") return [caller.sub];
  if (caller.roleType === "MANAGER") {
    const reportIds = await usersRepo.findDirectReportIds(caller.sub);
    return [caller.sub, ...reportIds];
  }
  return undefined;
}

export async function listLeads(caller: AccessTokenPayload, filter: {
  page: number;
  pageSize: number;
  status?: string[];
  assignedAgentId?: string[];
  campaign?: string[];
  propertyId?: string[];
  noProperty?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  excludeBulkUpload?: boolean;
  campaignLeadsOnly?: boolean;
  missedOnly?: boolean;
  missedOn?: string;
  missedUntil?: string;
  missedFrom?: string;
  overdueOnly?: boolean;
  leadIds?: string[];
  sortDir?: "asc" | "desc";
  sortField?: "created" | "assigned";
  sourceBucket?: string[];
  campaignIgnoreCase?: boolean;
  dataCallingOnly?: boolean;
  assignedOnly?: boolean;
  subSource?: string[];
  callStatus?: string[];
  callSubStatus?: string[];
  calledBy?: string[];
  calledFrom?: string;
  calledTo?: string;
  resultFrom?: string;
  resultTo?: string;
  callNotQualified?: boolean;
  qualifiedOnly?: boolean;
  unqualifiedOnly?: boolean;
}) {
  const scopedToAgentIds = await scopeForCaller(caller);
  const { rows, totalCount } = await repo.findMany({
    page: filter.page,
    pageSize: filter.pageSize,
    statusCodes: filter.status,
    assignedAgentId: filter.assignedAgentId,
    campaign: filter.campaign,
    propertyId: filter.propertyId,
    noProperty: filter.noProperty,
    dateFrom: filter.dateFrom,
    dateTo: filter.dateTo,
    search: filter.search,
    excludeBulkUpload: filter.excludeBulkUpload,
    campaignLeadsOnly: filter.campaignLeadsOnly,
    missedOnly: filter.missedOnly,
    slaMinutes: filter.missedOnly ? REPORT_SLA_MINUTES : undefined,
    missedOn: filter.missedOn,
    missedUntil: filter.missedUntil,
    missedFrom: filter.missedFrom,
    overdueOnly: filter.overdueOnly,
    leadIds: filter.leadIds,
    sortDir: filter.sortDir,
    sortField: filter.sortField,
    sourceBucket: filter.sourceBucket,
    campaignIgnoreCase: filter.campaignIgnoreCase,
    dataCallingOnly: filter.dataCallingOnly,
    assignedOnly: filter.assignedOnly,
    subSource: filter.subSource,
    callStatus: filter.callStatus,
    callSubStatus: filter.callSubStatus,
    calledBy: filter.calledBy,
    calledFrom: filter.calledFrom,
    calledTo: filter.calledTo,
    resultFrom: filter.resultFrom,
    resultTo: filter.resultTo,
    callNotQualified: filter.callNotQualified,
    qualifiedOnly: filter.qualifiedOnly,
    unqualifiedOnly: filter.unqualifiedOnly,
    scopedToAgentIds
  });
  return {
    rows,
    meta: {
      page: filter.page,
      pageSize: filter.pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / filter.pageSize))
    }
  };
}

export interface SearchLeadsByPhonesResult {
  rows: repo.LeadListRow[];
  notFound: string[];
  meta: { page: number; pageSize: number; totalCount: number; totalPages: number };
}

/**
 * Super-Admin-only Leads page feature (every other admin is blocked, per
 * explicit product decision — route-gated ADMIN broadly, this is the fine
 * check): paste or upload a list of phone numbers (a recruiter's export, a
 * purchased list, etc.) and the Leads table filters down to exactly those
 * that already exist as leads — a real filter, not a separate popup list,
 * so every other table feature (status editing, row click, pagination)
 * keeps working unchanged against `rows`. The full match set is bounded by
 * the <=2000-phone input, so pagination here is an in-memory slice, not a
 * second SQL query. `notFound` is built from the caller's own original
 * strings (not the normalized form) and is NOT paginated — it's
 * independent of which page is showing.
 */
export async function searchLeadsByPhones(caller: AccessTokenPayload, rawPhones: string[], page: number, pageSize: number): Promise<SearchLeadsByPhonesResult> {
  if (!(await usersRepo.isSuperAdmin(caller.sub))) {
    throw ApiError.forbidden("Only the Super Admin can search leads by phone number.");
  }
  const trimmed = Array.from(new Set(rawPhones.map(p => p.trim()).filter(Boolean)));
  const normalizedSet = new Set<string>();
  for (const raw of trimmed) {
    const n = normalizeTypedLeadPhone(raw);
    if (n) normalizedSet.add(n);
  }

  const allMatched = await repo.findManyByPhones(Array.from(normalizedSet));
  const matchedPhones = new Set(allMatched.map(m => m.phone));

  const notFound = trimmed.filter(raw => {
    const n = normalizeTypedLeadPhone(raw);
    return !n || !matchedPhones.has(n);
  });

  const totalCount = allMatched.length;
  const offset = (page - 1) * pageSize;
  const rows = allMatched.slice(offset, offset + pageSize);

  return { rows, notFound, meta: { page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) } };
}

// Maps lead_statuses.code -> the 7 admin CRM stat-card buckets. Mirrors
// frontend/src/lib/leadStatusMapping.ts's DB_CODE_TO_FRONTEND_STATUS combined
// with frontend/src/lib/leadSummaryStats.ts's computeLeadSummaryStats, i.e.
// "New Lead" -> NEW, "RNR" -> RNR, "Call Back" -> CALL_BACK,
// "Follow-ups" -> FOLLOW_UP, "Visit Schedule" -> SITE_VISIT_SCHEDULED,
// "Site Visit" -> SITE_VISIT_DONE. Kept here (not imported from the frontend)
// since this is backend code operating on DB codes, not frontend display
// strings, but the bucket names/semantics must stay in lockstep with that file.
const NEW_LEADS_CODE = "NEW_LEAD";
const RNR_CODE = "RNR";
const CALL_BACKS_CODE = "CALL_BACK";
const FOLLOW_UPS_CODE = "FOLLOWUP";
const SITE_VISIT_SCHEDULED_CODE = "SITE_VISIT_SCHEDULED";
const SITE_VISIT_DONE_CODE = "SITE_VISIT_DONE";
const LOW_BUDGET_CODE = "LOW_BUDGET";
const OTHER_REQUIREMENT_CODE = "OTHER_REQUIREMENT";

export interface LeadSummaryStats {
  totalLeads: number;
  newLeads: number;
  rnr: number;
  callBacks: number;
  followUps: number;
  siteVisitScheduled: number;
  siteVisitDone: number;
  lowBudget: number;
  otherRequirement: number;
}

/**
 * Backend counterpart to the frontend's computeLeadSummaryStats — the admin
 * CRM Leads tab's 7 stat cards, computed as a single grouped aggregate query
 * instead of over the full in-memory leads array (which stops being
 * available once the leads list is properly paginated). Accepts the exact
 * same filters as listLeads (minus page/pageSize) so a caller applying a
 * campaign/date-range/status filter sees the list and the stat cards agree.
 * `totalLeads` sums every group — i.e. "every lead matching the current
 * filters", not literally every lead in the table — matching how the
 * frontend's adminStats is already scoped by campaign/date range before the
 * 7 numbers are computed from it.
 */
export async function getLeadStats(caller: AccessTokenPayload, filter: {
  status?: string[];
  assignedAgentId?: string[];
  campaign?: string[];
  propertyId?: string[];
  noProperty?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  excludeBulkUpload?: boolean;
  campaignLeadsOnly?: boolean;
  missedOnly?: boolean;
  missedOn?: string;
  missedUntil?: string;
  missedFrom?: string;
  overdueOnly?: boolean;
  leadIds?: string[];
}): Promise<LeadSummaryStats> {
  const scopedToAgentIds = await scopeForCaller(caller);
  const grouped = await repo.getStats({
    statusCodes: filter.status,
    assignedAgentId: filter.assignedAgentId,
    campaign: filter.campaign,
    propertyId: filter.propertyId,
    noProperty: filter.noProperty,
    dateFrom: filter.dateFrom,
    dateTo: filter.dateTo,
    search: filter.search,
    excludeBulkUpload: filter.excludeBulkUpload,
    campaignLeadsOnly: filter.campaignLeadsOnly,
    missedOnly: filter.missedOnly,
    slaMinutes: filter.missedOnly ? REPORT_SLA_MINUTES : undefined,
    missedOn: filter.missedOn,
    missedUntil: filter.missedUntil,
    missedFrom: filter.missedFrom,
    overdueOnly: filter.overdueOnly,
    leadIds: filter.leadIds,
    scopedToAgentIds
  });

  const countFor = (code: string): number =>
    grouped.filter(g => g.status_code === code).reduce((sum, g) => sum + Number(g.count), 0);
  const totalLeads = grouped.reduce((sum, g) => sum + Number(g.count), 0);

  return {
    totalLeads,
    // Waiting UNASSIGNED leads display as "New Lead", so the card counts them too.
    newLeads: countFor(NEW_LEADS_CODE) + countFor("UNASSIGNED"),
    rnr: countFor(RNR_CODE),
    callBacks: countFor(CALL_BACKS_CODE),
    followUps: countFor(FOLLOW_UPS_CODE),
    siteVisitScheduled: countFor(SITE_VISIT_SCHEDULED_CODE),
    siteVisitDone: countFor(SITE_VISIT_DONE_CODE),
    lowBudget: countFor(LOW_BUDGET_CODE),
    otherRequirement: countFor(OTHER_REQUIREMENT_CODE)
  };
}

/**
 * Distinct campaign names for a drill-down panel's Campaign filter dropdown
 * — same filter shape as getLeadStats (minus search, which has no bearing
 * on "what campaigns exist"), so the dropdown's options reflect the same
 * category/date-range scope the panel is already showing.
 */
export async function getDistinctCampaigns(caller: AccessTokenPayload, filter: {
  status?: string[];
  assignedAgentId?: string[];
  propertyId?: string[];
  noProperty?: boolean;
  dateFrom?: string;
  dateTo?: string;
  excludeBulkUpload?: boolean;
  campaignLeadsOnly?: boolean;
  missedOnly?: boolean;
  missedOn?: string;
  missedUntil?: string;
  missedFrom?: string;
  overdueOnly?: boolean;
  leadIds?: string[];
}): Promise<string[]> {
  const scopedToAgentIds = await scopeForCaller(caller);
  return repo.getDistinctCampaigns({
    statusCodes: filter.status,
    assignedAgentId: filter.assignedAgentId,
    propertyId: filter.propertyId,
    noProperty: filter.noProperty,
    dateFrom: filter.dateFrom,
    dateTo: filter.dateTo,
    excludeBulkUpload: filter.excludeBulkUpload,
    campaignLeadsOnly: filter.campaignLeadsOnly,
    missedOnly: filter.missedOnly,
    slaMinutes: filter.missedOnly ? REPORT_SLA_MINUTES : undefined,
    missedOn: filter.missedOn,
    missedUntil: filter.missedUntil,
    missedFrom: filter.missedFrom,
    overdueOnly: filter.overdueOnly,
    leadIds: filter.leadIds,
    scopedToAgentIds
  });
}

// Mirrors LeadDashboard.tsx's UNQUALIFIED_STATUSES/SITE_VISIT_STATUSES —
// kept here (DB codes, not frontend display strings) for the same reason
// the 7-stat-card codes above are, but must stay in lockstep with that
// file if either list ever changes.
// (Qualified / unqualified now come from the one rule in qualifiedLeads.ts.)
const SITE_VISIT_CODES = ["SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE"];

export interface AgentAnalyticsStats {
  assignedAgentId: string;
  total: number;
  qualified: number;
  unqualified: number;
  siteVisits: number;
}

/**
 * Backend counterpart to the Leads Analytics tab's computeLeadStats/
 * adminManagerRows (LeadDashboard.tsx) — one row per agent instead of
 * scanning the full in-memory leads array. Manager roll-up (an agent's own
 * numbers plus their direct reports') and the "No manager assigned"
 * fallback bucket stay client-side, same as getLeadStats's 7 buckets:
 * this just replaces where the per-agent counts themselves come from.
 */
export async function getLeadAnalyticsStats(caller: AccessTokenPayload, filter: {
  propertyId?: string[];
  campaign?: string[];
  dateFrom?: string;
  dateTo?: string;
  excludeBulkUpload?: boolean;
}): Promise<AgentAnalyticsStats[]> {
  const scopedToAgentIds = await scopeForCaller(caller);
  const rows = await repo.getAnalyticsStatsByAgent(
    {
      propertyId: filter.propertyId,
      campaign: filter.campaign,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
      excludeBulkUpload: filter.excludeBulkUpload,
      scopedToAgentIds
    },
    SITE_VISIT_CODES
  );
  return rows.map(r => {
    const total = Number(r.total);
    const unqualified = Number(r.unqualified);
    return {
      assignedAgentId: r.assigned_agent_id,
      total,
      qualified: Number(r.qualified),
      unqualified,
      siteVisits: Number(r.site_visits)
    };
  });
}

export interface PropertyAnalyticsStats {
  propertyId: string | null;
  total: number;
  qualified: number;
  unqualified: number;
  siteVisits: number;
}

type AnalyticsFilter = { propertyId?: string[]; campaign?: string[]; dateFrom?: string; dateTo?: string; assignedAgentId?: string[]; excludeBulkUpload?: boolean };

/** Leads Analytics' property card — same filters as getLeadAnalyticsStats, plus the Member filter. */
export async function getLeadAnalyticsStatsByProperty(caller: AccessTokenPayload, filter: AnalyticsFilter): Promise<PropertyAnalyticsStats[]> {
  const scopedToAgentIds = await scopeForCaller(caller);
  const rows = await repo.getAnalyticsStatsByProperty({ ...filter, scopedToAgentIds }, SITE_VISIT_CODES);
  return rows.map(r => ({
    propertyId: r.property_id,
    total: Number(r.total),
    qualified: Number(r.qualified),
    unqualified: Number(r.unqualified),
    siteVisits: Number(r.site_visits)
  }));
}

/** Leads Analytics' RNR Analysis averages (Call button records), same filters as the property card. */
export async function getRnrCallAverages(caller: AccessTokenPayload, filter: AnalyticsFilter) {
  const scopedToAgentIds = await scopeForCaller(caller);
  const r = await repo.getRnrCallAverages({ ...filter, scopedToAgentIds });
  return { callsPerLeadPerDay: r.per_lead_day, callsBeforeDead: r.before_dead };
}

// Mirrors frontend/src/lib/reportMetrics.ts's BUYER_STATUSES (the Agent
// report's "Qualified" bucket) and VISIT_OR_MEETING_STATUSES — same
// lockstep requirement as the other code-list constants above.
// Statuses that are always qualified — plus RNR picked up (qualifiedLeads.ts), added in the query.
const REPORT_QUALIFIED_CODES = QUALIFIED_STATUS_CODES;
const REPORT_SITE_VISIT_CODES = ["SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE"];

export interface AgentReportStats {
  assigned: number;
  contacted: number;
  qualified: number;
  siteVisits: number;
  bookingValue: number;
  bookingCount: number;
  allocatedSpend: number;
  missedLeads: number;
  missedFollowups: number;
  // Manager/Admin-only (migration 047) — undefined for a Member viewing
  // their own report, same boundary as leadForCaller's missed_task_count
  // stripping on individual leads.
  totalMissedTasks?: number;
}

// Mirrors reportMetrics.ts's SLA_MINUTES — the response-time window a lead
// is given before isMissedLead/getMissedInfo calls it missed.
const REPORT_SLA_MINUTES = 20;

/**
 * Backend counterpart to AgentReports.tsx's computeAgentFunnel/
 * computeBookingValue/computeBookingCount/computeCampaignAttributedSpend/
 * isMissedLead (leads + follow-ups) — the Agent report's 4 funnel KPI
 * cards, booking value/count, campaign-attributed spend, and missed-lead/
 * missed-follow-up counts, for the one agent named in
 * filter.assignedAgentId. ROI itself stays client-side (one division of
 * bookingValue/allocatedSpend, both already here). Each KPI card's own
 * drill-down popup still reads the bulk leads/followupCalls arrays to
 * list the real rows a number represents — only the numbers themselves
 * moved here.
 */
export async function getAgentReportStats(caller: AccessTokenPayload, filter: {
  assignedAgentId?: string[];
  dateFrom?: string;
  dateTo?: string;
}): Promise<AgentReportStats> {
  const scopedToAgentIds = await scopeForCaller(caller);
  const [row, missedFollowups] = await Promise.all([
    repo.getAgentReportStats(
      {
        assignedAgentId: filter.assignedAgentId,
        dateFrom: filter.dateFrom,
        dateTo: filter.dateTo,
        scopedToAgentIds
      },
      REPORT_QUALIFIED_CODES,
      REPORT_SITE_VISIT_CODES,
      REPORT_SLA_MINUTES
    ),
    repo.getMissedFollowupCount(filter.assignedAgentId?.[0], scopedToAgentIds, filter.dateFrom, filter.dateTo)
  ]);
  return {
    assigned: Number(row.assigned),
    contacted: Number(row.contacted),
    qualified: Number(row.qualified),
    siteVisits: Number(row.site_visits),
    bookingValue: Number(row.booking_value),
    bookingCount: Number(row.booking_count),
    allocatedSpend: Number(row.allocated_spend),
    missedLeads: Number(row.missed_leads),
    missedFollowups,
    totalMissedTasks: (caller.role === "ADMIN" || caller.roleType === "MANAGER") ? Number(row.total_missed_tasks) : undefined
  };
}

export interface ManagerReportAgentStats {
  assignedAgentId: string;
  leadsCount: number;
  spend: number;
  bookingValue: number;
  missedCount: number;
  missedFollowups: number;
}

/**
 * Backend counterpart to ManagerReports.tsx's per-manager Individual/Team/
 * Combined rollup — one row per agent (manager or direct report alike).
 * The Individual/Team/Combined split and the per-member breakdown both
 * stay client-side, summing each manager's own row with their direct
 * reports' — same "sum small per-agent rows" pattern LeadDashboard.tsx's
 * adminManagerRows already uses for the Leads Analytics tab. No extra
 * role gate: scopeForCaller already makes a Manager's own call return
 * exactly themself + direct reports (their real Individual+Team scope),
 * and a Member's call return just their own row — both harmless, same
 * precedent as getLeadStats/getAgentReportStats.
 */
export async function getManagerReportStats(caller: AccessTokenPayload, filter: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<ManagerReportAgentStats[]> {
  const scopedToAgentIds = await scopeForCaller(caller);
  const rows = await repo.getManagerReportStatsByAgent(
    // Leads count = the same leads as the Leads page (no Data Calling pool).
    { dateFrom: filter.dateFrom, dateTo: filter.dateTo, scopedToAgentIds, excludeBulkUpload: true },
    REPORT_SLA_MINUTES
  );
  return rows.map(r => ({
    assignedAgentId: r.assigned_agent_id,
    leadsCount: Number(r.leads_count),
    spend: Number(r.spend),
    bookingValue: Number(r.booking_value),
    missedCount: Number(r.missed_count),
    missedFollowups: Number(r.missed_followups)
  }));
}

export async function getLead(caller: AccessTokenPayload, id: string) {
  const scopedToAgentIds = await scopeForCaller(caller);
  const lead = await repo.findById(id, scopedToAgentIds);
  if (!lead) throw ApiError.notFound("Lead not found");
  return lead;
}

export async function createLead(caller: AccessTokenPayload, input: CreateLeadInput) {
  // A manager adds leads for themselves or their own direct reports only.
  if (caller.role !== "ADMIN") await assertUploadAssigneeAllowed(caller, input.assignedAgentId);
  await assertActiveAssignees([input.assignedAgentId]);
  // Mirrors addLead()'s duplicate-phone rule in AppContext.tsx — the leads.phone
  // UNIQUE constraint would also catch this, but checking first gives a clean
  // 409 with a useful message instead of a raw constraint-violation error.
  const existing = await repo.findByPhone(input.phone);
  if (existing) {
    throw ApiError.conflict(`A lead with phone number ${input.phone} already exists.`);
  }
  let created;
  try {
    created = await repo.create(input);
  } catch (err) {
    // assigned_agent_id references users(id) — a well-formed but nonexistent
    // UUID passes Zod's uuid() check and only fails at the DB as an FK violation.
    if (isForeignKeyViolation(err)) {
      throw ApiError.badRequest("Assigned agent not found.");
    }
    throw err;
  }

  // Meta leads get this via meta.lead-ingest.ts's own notification; every
  // other creation path (manual Add Lead, future Google Sheets ingestion,
  // any direct API caller) goes through here, so this is the one place that
  // needs to fire it for everything that isn't already covered.
  await createNotification({
    system: "CRM",
    category: "NEW_LEAD",
    title: "New Lead Assigned",
    message: `${created.name} — ${created.property_name || "Unassigned Project"} • via ${created.source || created.campaign || "Manual Entry"}`,
    recipientUserId: created.assigned_agent_id,
    leadId: created.id,
    link: "/dashboard/crm"
  });

  // Admin gets visibility into every lead creation too, not just the person
  // it lands on — matters most when one agent creates a lead and assigns it
  // to a teammate (Admin previously had no way to know that happened at
  // all). Excludes the assignee (already notified above) and the creator
  // themself (an admin creating a lead doesn't need to be told they just did).
  const adminIds = await usersRepo.listActiveAdminIds();
  const adminRecipients = adminIds.filter(id => id !== created.assigned_agent_id && id !== caller.sub);
  await Promise.all(
    adminRecipients.map(id => createNotification({
      system: "CRM",
      category: "NEW_LEAD",
      title: "New Lead Created",
      message: `${caller.name} added a new lead "${created.name}" and assigned it to ${created.assigned_agent_name}.`,
      recipientUserId: id,
      leadId: created.id,
      link: "/dashboard/crm"
    }))
  );

  broadcastLeadChanged(created.id);
  return created;
}

export interface BulkImportLeadRow {
  name: string;
  phone: string;
  email: string;
}

export interface BulkImportLeadsInput {
  subSource?: string;
  // Omitted (Data Calling's own upload) defaults to "Bulk Upload" below,
  // same as before this field existed. A real caller (e.g. the main CRM
  // Leads page's bulk upload) passes the lead's actual channel instead.
  source?: string;
  // One batch-level choice, surfaced by the precheck endpoint below — when
  // true, a row whose phone matches a previously-deleted lead gets its old
  // notes/call history re-attached after being created; when
  // false/omitted it's just created fresh, same as any other row.
  restoreArchivedMatches?: boolean;
  assignmentMode: "PROPERTY" | "AGENT";
  propertyId?: string;
  /** Data Calling's own property tag for the batch — stored only, never drives assignment. */
  dataCallingPropertyId?: string;
  agentIds?: string[];
  leads: BulkImportLeadRow[];
  actor: { userId: string; name: string };
}

export interface BulkImportSkippedRow {
  row: number; // 1-based spreadsheet row, header counted as row 1 so the first data row is row 2 — matches what the admin sees in Excel
  reason: string;
}

export interface BulkImportLeadsResult {
  created: number;
  duplicates: number;
  skipped: BulkImportSkippedRow[];
  restored: number;
}

// How many rows go into one INSERT statement. Postgres/node-pg handle far
// more than this per statement, but keeping chunks at this size bounds how
// much a single query's parameter arrays/working memory grow, while still
// cutting a 100k-row upload down to on the order of 100 round trips instead
// of 100k.
const BULK_IMPORT_CHUNK_SIZE = 1000;

/**
 * Admin CRM Data Calling's bulk Excel upload — built for real scale (tens
 * of thousands of rows, not a handful):
 *  - Property mode's Round Robin/Percentage picker is set up ONCE (one or
 *    two queries total, see createPropertyAgentPicker) instead of
 *    re-querying every agent's current lead count on every row, which was
 *    the previous per-row implementation. Agent mode's round-robin is
 *    already pure in-memory index math, no DB calls either way.
 *  - Every row's assignment is resolved in memory first; only the actual
 *    inserts touch the database, batched BULK_IMPORT_CHUNK_SIZE rows at a
 *    time via one multi-row INSERT per chunk (see
 *    leads.repository.createBulkLeadsChunk) rather than one INSERT per
 *    row — the difference between ~100 queries and 100,000 for a 100k-row
 *    file.
 *  - Each chunk's INSERT is a single SQL statement, which Postgres
 *    executes atomically — either the whole chunk lands or (on a genuine
 *    DB error, not an expected duplicate) none of it does. Whole-batch
 *    atomicity is deliberately NOT used here: an admin's real spreadsheet
 *    always has a few bad rows, and requiring the entire 100k-row file to
 *    be perfect to import any of it would be worse, not more correct.
 *  - ON CONFLICT (phone) DO NOTHING makes duplicate detection (both
 *    against existing leads AND repeats within the same file) a single
 *    set-based check instead of a per-row existence query, and the unique
 *    constraint on leads.phone is what actually rules out redundant rows
 *    at the source of truth, not application-side bookkeeping.
 * A bad row (missing name, unparseable phone, duplicate phone) is skipped
 * and reported by its real spreadsheet row number, not a whole-batch
 * failure.
 */
/**
 * Managers picking agents by hand may only pick their own team (by
 * property, the admin-defined property team decides). Called by the
 * request handler before the import is queued, since the queued worker
 * runs bulkImportLeads without a caller.
 *
 * Also the one place Data Calling's bulk upload and the main CRM Leads
 * page's bulk upload (built later, same endpoint — see
 * BulkImportLeadsInput's `source`) actually diverge for a Manager: Data
 * Calling (no `source`) stays open to every manager as before; the Leads
 * page's own upload (a real `source`) needs the per-manager Access
 * Control toggle (Settings > Manage Users, Super Admin only) — off by
 * default, so this narrows access rather than the reverse.
 */
export async function assertBulkImportAllowed(caller: AccessTokenPayload, input: Omit<BulkImportLeadsInput, "actor">): Promise<void> {
  if (caller.role === "ADMIN") return;
  if (input.source) {
    const allowed = await usersRepo.isBulkUploadCrmLeadsEnabled(caller.sub);
    if (!allowed) {
      throw ApiError.forbidden("You don't have access to bulk-upload leads from the Leads page — ask an admin to enable it for you in Manage Users.");
    }
  }
  if (input.assignmentMode !== "AGENT") return;
  for (const agentId of input.agentIds ?? []) await assertUploadAssigneeAllowed(caller, agentId);
}

export async function bulkImportLeads(input: BulkImportLeadsInput): Promise<BulkImportLeadsResult> {
  const fallbackAdminId = (await usersRepo.listActiveAdminIds())[0];

  // Property mode: a Data Calling upload hands rows to its Data Calling
  // property's team; any other upload to its main property's team.
  const isDataCallingUpload = !!input.subSource;
  const assignmentPropertyId = input.assignmentMode !== "PROPERTY"
    ? undefined
    : isDataCallingUpload ? input.dataCallingPropertyId : input.propertyId;
  if (assignmentPropertyId && !(await findPropertyName(assignmentPropertyId, isDataCallingUpload ? "DATA_CALLING" : "MAIN"))) {
    throw ApiError.badRequest("That property no longer exists.");
  }
  // Set up once, outside the per-row loop — see createPropertyAgentPicker.
  const pickPropertyAgent = assignmentPropertyId ? await createPropertyAgentPicker(assignmentPropertyId) : undefined;
  const agentIds = input.assignmentMode === "AGENT" ? input.agentIds ?? [] : [];
  await assertActiveAssignees(agentIds);
  if (input.dataCallingPropertyId && !(await findPropertyName(input.dataCallingPropertyId, "DATA_CALLING"))) {
    throw ApiError.badRequest("That Data Calling property no longer exists.");
  }

  const skipped: BulkImportSkippedRow[] = [];
  let duplicates = 0;
  const seenPhones = new Set<string>();

  interface Candidate {
    row: number;
    name: string;
    phone: string;
    email: string | null;
    assignedAgentId: string;
    statusCode: string;
  }
  const candidates: Candidate[] = [];
  let agentCursor = 0; // only advances on rows that reach assignment, so earlier skips don't skew the round-robin

  for (let i = 0; i < input.leads.length; i++) {
    const row = i + 2; // header is row 1
    const name = input.leads[i].name?.trim();
    // Typed/uploaded numbers use the strict rule: an 11-digit typo is reported
    // as skipped instead of being cut down to a different, valid-looking number.
    const phone = normalizeTypedLeadPhone(input.leads[i].phone ?? "");
    // Lenient on purpose (unlike createLeadSchema's strict email()) — a bad
    // email in one cell of a 100k-row sheet shouldn't skip an otherwise
    // valid name+phone row, it just leaves email blank for that lead.
    const rawEmail = input.leads[i].email?.trim();
    const email = rawEmail && /^\S+@\S+\.\S+$/.test(rawEmail) ? rawEmail : null;

    if (!name) {
      skipped.push({ row, reason: "Name is required" });
      continue;
    }
    if (!phone) {
      skipped.push({ row, reason: "Phone is not a valid 10-digit mobile number or +country-code number" });
      continue;
    }
    if (seenPhones.has(phone)) {
      duplicates++;
      continue;
    }

    let assignedAgentId: string | undefined;
    let statusCode: string;
    if (input.assignmentMode === "AGENT") {
      assignedAgentId = agentIds.length > 0 ? agentIds[agentCursor % agentIds.length] : undefined;
      agentCursor++;
      statusCode = "NEW_LEAD";
    } else {
      const autoAssignedAgentId = pickPropertyAgent?.();
      assignedAgentId = autoAssignedAgentId ?? fallbackAdminId;
      statusCode = autoAssignedAgentId ? "NEW_LEAD" : "UNASSIGNED";
    }
    if (!assignedAgentId) {
      skipped.push({
        row,
        reason: input.assignmentMode === "AGENT"
          ? "No agent selected to assign this row to"
          : "No assignable agent for this property and no active admin to fall back to"
      });
      continue;
    }

    seenPhones.add(phone);
    candidates.push({ row, name, phone, email, assignedAgentId, statusCode });
  }

  let created = 0;
  let restored = 0;
  const notifyCounts = new Map<string, number>();
  const common = {
    source: input.source?.trim() || "Bulk Upload",
    subSource: input.subSource?.trim() || null,
    // PROPERTY mode's propertyId is required by the schema (used both for
    // round-robin target selection above and stored here); AGENT mode has
    // no required property, but a caller may still tag the batch with one
    // (e.g. the main CRM Leads page's "Property" field) — passed through
    // as-is rather than always nulled out.
    propertyId: input.propertyId ?? null,
    dataCallingPropertyId: input.dataCallingPropertyId ?? null,
    uploadedByUserId: input.actor.userId
  };

  // Only looked up when the caller actually asked to restore — an ordinary
  // import that never sets this flag pays zero extra query cost.
  const archiveMatches = input.restoreArchivedMatches
    ? await repo.findArchivedMatchesByPhones(candidates.map(c => c.phone))
    : new Map<string, repo.ArchivedLeadMatch>();

  for (let i = 0; i < candidates.length; i += BULK_IMPORT_CHUNK_SIZE) {
    const chunk = candidates.slice(i, i + BULK_IMPORT_CHUNK_SIZE);
    let insertedLeadIds: Map<string, string>;
    try {
      insertedLeadIds = await repo.createBulkLeadsChunk(
        chunk.map(c => ({ name: c.name, phone: c.phone, email: c.email, assignedAgentId: c.assignedAgentId, statusCode: c.statusCode })),
        common
      );
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw ApiError.badRequest("Selected property or agent not found.");
      }
      throw err;
    }

    // Collected per chunk, inserted once below — so a restore failure for
    // this chunk can't undo the leads this chunk already successfully
    // created (see the try/catch around insertRestoredLeadLogsChunk).
    const restoreTargets: { newLeadId: string; logs: unknown[] }[] = [];

    for (const c of chunk) {
      const newLeadId = insertedLeadIds.get(c.phone);
      if (newLeadId) {
        created++;
        notifyCounts.set(c.assignedAgentId, (notifyCounts.get(c.assignedAgentId) ?? 0) + 1);
        const archived = archiveMatches.get(c.phone);
        if (archived) {
          restored++;
          restoreTargets.push({
            newLeadId,
            logs: [
              ...archived.logs,
              {
                user_id: input.actor.userId,
                user_name_snapshot: input.actor.name,
                message: `Restored from an archived lead deleted on ${new Date(archived.deletedAt).toLocaleDateString("en-IN")} by ${archived.deletedByName}; ${archived.logs.length} historical note(s) re-attached.`,
                created_at: new Date().toISOString()
              }
            ]
          });
        }
      } else {
        // Only reachable if this exact phone already existed on another
        // lead before this upload started — in-file repeats were already
        // counted above via seenPhones.
        duplicates++;
      }
    }

    if (restoreTargets.length > 0) {
      try {
        await repo.insertRestoredLeadLogsChunk(restoreTargets);
      } catch (err) {
        // The leads themselves are already safely created above — losing
        // restored history for this one chunk (e.g. a stale user_id FK on
        // very old archived history) shouldn't fail an otherwise-successful
        // import, so this degrades instead of throwing.
        console.warn("Could not re-attach archived history for a bulk-import chunk:", err);
        restored -= restoreTargets.length;
      }
    }
  }

  // This endpoint is shared with the main CRM Leads page's own bulk upload
  // (a real `source` means it's not Data Calling, see BulkImportLeadsInput)
  // — notification wording/links below point wherever the batch actually
  // landed, instead of always saying "data calling".
  const isDataCalling = common.source === "Bulk Upload";
  const destinationLink = isDataCalling ? "/dashboard/crm/data-calling" : "/dashboard/crm";

  // One summary notification per agent rather than one per lead — a
  // 100,000-row batch shouldn't flood an agent's notification feed the way
  // a single real-time Meta/sheet lead does.
  await Promise.all(
    [...notifyCounts.entries()].map(([agentId, count]) =>
      createNotification({
        system: "CRM",
        category: "NEW_LEAD",
        title: "New Bulk Leads",
        message: isDataCalling
          ? `${count} bulk data calling lead${count > 1 ? "s" : ""} assigned to you by ${input.actor.name}.`
          : `${count} new lead${count > 1 ? "s" : ""} assigned to you by ${input.actor.name}.`,
        recipientUserId: agentId,
        link: destinationLink
      })
    )
  );

  // One completion summary to whoever ran the upload — this was missing
  // entirely before; the admin had no confirmation beyond the upload
  // modal's own progress UI closing.
  await createNotification({
    system: "CRM",
    category: "GENERAL",
    title: "Bulk Upload Complete",
    message:
      `${created} lead${created === 1 ? "" : "s"} uploaded successfully.` +
      (duplicates > 0 ? ` ${duplicates} duplicate${duplicates === 1 ? "" : "s"}.` : "") +
      (skipped.length > 0 ? ` ${skipped.length} failed.` : "") +
      (restored > 0 ? ` ${restored} restored from previously-deleted leads.` : ""),
    recipientUserId: input.actor.userId,
    link: destinationLink
  });

  if (created > 0 || restored > 0) broadcastManyLeadsChanged();
  return { created, duplicates, skipped, restored };
}

export interface BulkImportPrecheckResult {
  totalRows: number;
  activeDuplicateCount: number;
  archivedMatchCount: number;
  archivedMatchesPreview: { name: string; phone: string; deletedAt: string; deletedByName: string }[];
}

/**
 * Run before the real bulk-import request so the upload modal can ask,
 * once for the whole batch, whether to restore archived history onto rows
 * that match a previously-deleted lead — see bulkImportLeads above for
 * what "restore" actually does. `activeDuplicateCount` is informational
 * only (today's silent duplicate-skip behavior is unchanged either way).
 */
export async function precheckBulkImportLeads(leads: { name: string; phone: string }[]): Promise<BulkImportPrecheckResult> {
  const phones = Array.from(
    new Set(leads.map(l => normalizeTypedLeadPhone(l.phone ?? "")).filter((p): p is string => !!p))
  );

  const [activeDuplicateCount, archiveMatches] = await Promise.all([
    repo.countLeadsByPhones(phones),
    repo.findArchivedMatchesByPhones(phones)
  ]);

  const archivedMatchesPreview = Array.from(archiveMatches.entries())
    .slice(0, 20)
    .map(([phone, m]) => ({ name: m.name, phone, deletedAt: m.deletedAt, deletedByName: m.deletedByName }));

  return {
    totalRows: leads.length,
    activeDuplicateCount,
    archivedMatchCount: archiveMatches.size,
    archivedMatchesPreview
  };
}

// Statuses that still have a next call (frontend leadScheduler.ts
// SCHEDULER_REQUIRED_STATUSES) — a status change to one of these keeps the
// lead's future scheduled call (see updateLeadStatus).
const STATUSES_THAT_KEEP_A_SCHEDULE: LeadStatusCode[] = ["RNR", "CALL_BACK", "FOLLOWUP", "EOI", "SITE_VISIT_SCHEDULED"];

/** A lead's status can be changed by the agent it's assigned to, that agent's manager, or an admin. */
async function assertStatusChangeAllowed(caller: AccessTokenPayload, assignedAgentId: string, action = "change its status"): Promise<void> {
  if (caller.role === "ADMIN" || assignedAgentId === caller.sub) return;
  const owner = await usersRepo.findById(assignedAgentId);
  if (owner?.manager_id === caller.sub) return;
  throw ApiError.forbidden(`Only the lead's owner, their manager or an admin can ${action}.`);
}

export async function updateLeadStatus(
  caller: AccessTokenPayload,
  leadId: string,
  statusCode: LeadStatusCode,
  keepSchedule = false
) {
  const scopedToAgentIds = await scopeForCaller(caller);
  const existing = await repo.findById(leadId, scopedToAgentIds);
  if (!existing) throw ApiError.notFound("Lead not found");
  await assertStatusChangeAllowed(caller, existing.assigned_agent_id);
  // The one and only enforcement point for the Lead Status transition
  // matrix — every other code path that writes status_code is either
  // system-driven (markLeadNewIfUnassigned) or an initial INSERT, neither
  // of which is a user-initiated transition.
  await assertTransitionAllowed(existing.status_code, statusCode, leadId, caller.role === "ADMIN");

  // First status change since the lead arrived — or since it was revived,
  // which restarts the response clock (leadRevival.ts).
  const stampFirstResponse = existing.status_code === "NEW_LEAD" || existing.status_code === REVIVED_CODE;

  try {
    await withTransaction(async (client) => {
      await repo.updateStatus(client, leadId, statusCode, stampFirstResponse);
      await repo.insertLeadLog(client, leadId, caller.sub, caller.name, `Status changed to "${statusCode}"`);
      // The agent responded in time — this is what the follow-up SLA
      // scheduler (jobs/followupScheduler.ts) checks for before escalating
      // a missed reminder to admins, so it needs to land in the same
      // transaction as the status change itself.
      // A status that ends the follow-ups (Not Interested, Booked, …) closes
      // every scheduled call. A status that still needs a next call keeps
      // the future one — the status picker never books a new time, so
      // closing it left the lead with no Next Call Date. Overdue calls are
      // still closed, so an old time can't keep the lead under Missed Tasks
      // after its status moved on, and a site visit is closed once the lead
      // leaves Site Visit Scheduled. After a WhatsApp message (keepSchedule)
      // every open call is kept.
      if (!STATUSES_THAT_KEEP_A_SCHEDULE.includes(statusCode)) {
        await client.query(
          `UPDATE followup_calls SET status = 'COMPLETED' WHERE lead_id = $1 AND status <> 'COMPLETED'`,
          [leadId]
        );
      } else if (!keepSchedule) {
        await client.query(
          `UPDATE followup_calls SET status = 'COMPLETED'
           WHERE lead_id = $1 AND status <> 'COMPLETED'
             AND (status = 'MISSED' OR scheduled_at < now()
                  OR (call_type = 'SITE_VISIT' AND $2::text <> 'SITE_VISIT_SCHEDULED'))`,
          [leadId, statusCode]
        );
      }
    });
  } catch (err) {
    // status_code references lead_statuses(code) — an unrecognized code
    // string would pass Zod's enum check only if LEAD_STATUS_CODES drifts
    // from lead_statuses' real rows; this stays as a defensive fallback.
    if (isForeignKeyViolation(err)) {
      throw ApiError.badRequest(`"${statusCode}" is not a recognized lead status.`);
    }
    throw err;
  }

  // The lead has been acted on, so its reminders/SLA/reassignment alerts are
  // stale for everyone who received them.
  await deleteLeadActivityNotifications(leadId);

  // A new booking waits for the Sales Tracker team's approval. Best-effort:
  // a failed notification must never fail the status change itself.
  if (statusCode === "BOOKED" && existing.status_code !== "BOOKED") {
    // Booked again after a rejection: it goes back to Pending for a fresh review.
    await query(`DELETE FROM booking_approval_decisions WHERE lead_id = $1 AND decision = 'REJECTED'`, [leadId]);
    notifyBookingApproval(leadId, existing.name, existing.assigned_agent_name).catch(err =>
      logger.error({ err, leadId }, "Could not send the Booking Approval notification")
    );
  }

  broadcastLeadChanged(leadId);
  return repo.findById(leadId, scopedToAgentIds);
}

/** Tells every Sales Tracker account (config/salesTracker.ts) a lead was marked Booked. */
async function notifyBookingApproval(leadId: string, leadName: string, agentName: string): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM users WHERE status = 'ACTIVE' AND lower(email) = ANY($1::text[])`,
    [SALES_TRACKER_EMAILS]
  );
  // CRM, not FINANCE: the bell hides Finance while the app is CRM-only.
  await Promise.all(rows.map(u => createNotification({
    system: "CRM",
    category: "GENERAL",
    title: "Booking Approval",
    message: `${agentName} marked "${leadName}" as Booked. Review and approve it in the Sales Tracker.`,
    recipientUserId: u.id,
    leadId,
    link: "/dashboard/finance?tab=approval"
  })));
}

const VALID_CALL_STATUSES = new Set(["Connected", "Called", "Not Reachable", "Wrong Number"]);

/**
 * Data Calling's own field (migration 030) — fully independent of
 * updateLeadStatus above, no transition matrix between its 4 values. A
 * Connected + Qualified result promotes a bulk-uploaded lead out of the
 * cold-outreach pipeline into the main CRM leads list (see
 * leads.repository.ts's updateCallStatus for the mechanics); Connected alone
 * or Unqualified keeps it in Data Calling.
 */
export async function updateCallStatus(
  caller: AccessTokenPayload,
  leadId: string,
  callStatus: string,
  // Qualified / Unqualified (migration 033). Optional, only valid with
  // Connected; undefined = leave the current one as is (still Connected) or none.
  callSubStatus?: "Qualified" | "Unqualified" | null,
  // Required by the API (updateCallStatusSchema) — saved as the lead's note.
  note?: string
) {
  if (!VALID_CALL_STATUSES.has(callStatus)) {
    throw ApiError.badRequest(`"${callStatus}" is not a recognized call status.`);
  }
  if (callSubStatus && callStatus !== "Connected") {
    throw ApiError.badRequest("Sub-status can only be set when the call status is Connected.");
  }
  const scopedToAgentIds = await scopeForCaller(caller);
  const existing = await repo.findById(leadId, scopedToAgentIds);
  if (!existing) throw ApiError.notFound("Lead not found");
  await assertStatusChangeAllowed(caller, existing.assigned_agent_id, "change its call status");

  const nextSubStatus =
    callStatus !== "Connected"
      ? null
      : callSubStatus !== undefined
        ? callSubStatus
        : existing.call_status === "Connected" ? existing.call_sub_status : null;

  const promotion =
    callStatus === "Connected" && nextSubStatus === "Qualified" && existing.source === "Bulk Upload"
      ? { source: "Data", statusCode: "NEW_LEAD" }
      : undefined;
  // Only Connected + Qualified belongs in the main Leads pipeline. A lead
  // promoted earlier (source "Data", still carrying its Data Calling
  // sub_source) that's now marked anything else goes back to Data Calling.
  // A revived lead (migration 054) came back through a real ad enquiry, so
  // it stays on the Leads page whatever its Data Calling result.
  const demote =
    !!existing.sub_source && existing.source === "Data" && !existing.revived_at &&
    !(callStatus === "Connected" && nextSubStatus === "Qualified");
  const statusChanged = existing.call_status !== callStatus;
  const subStatusChanged = (existing.call_sub_status ?? null) !== nextSubStatus;

  await withTransaction(async (client) => {
    await repo.updateCallStatus(client, leadId, callStatus, nextSubStatus, promotion, demote);
    if (statusChanged || !subStatusChanged) {
      await repo.insertLeadLog(client, leadId, caller.sub, caller.name, `Call status changed to "${callStatus}"`);
    }
    if (subStatusChanged) {
      await repo.insertLeadLog(client, leadId, caller.sub, caller.name, nextSubStatus ? `Sub-status changed to "${nextSubStatus}"` : "Sub-status cleared");
    }
    if (note) {
      await repo.setNote(client, leadId, note, caller.sub);
      await repo.insertLeadLog(client, leadId, caller.sub, caller.name, `Note: ${note}`);
    }
    if (promotion) {
      // A second, explicit log entry for the promotion itself — distinct
      // from the generic "Call status changed" line above, so the
      // Activity History timeline shows plainly why this lead moved out
      // of Data Calling, not just that it was called.
      await repo.insertLeadLog(
        client,
        leadId,
        caller.sub,
        caller.name,
        `Lead qualified and transferred to main leads (source changed from "Bulk Upload" to "${promotion.source}").`
      );
    }
    if (demote) {
      await repo.insertLeadLog(
        client,
        leadId,
        caller.sub,
        caller.name,
        `Lead no longer qualified and moved back to Data Calling (source changed from "Data" to "Bulk Upload").`
      );
    }
  });

  broadcastLeadChanged(leadId);
  return repo.findById(leadId, scopedToAgentIds);
}

export async function editLead(caller: AccessTokenPayload, leadId: string, input: repo.EditLeadInput) {
  // Same ownership rule as read access: a sales member may only edit their
  // own leads; managers/finance/admin may edit any lead.
  const scopedToAgentIds = await scopeForCaller(caller);
  const existing = await repo.findById(leadId, scopedToAgentIds);
  if (!existing) throw ApiError.notFound("Lead not found");

  await repo.update(leadId, input);
  broadcastLeadChanged(leadId);
  return repo.findById(leadId);
}

/**
 * ADMIN may reassign a lead to anyone. Everyone else is restricted to their
 * own reporting line: a Manager may only hand a lead to one of their own
 * direct reports (or take it themselves); a Member may only hand it to a
 * teammate who shares their manager (or to that manager). Checked here, not
 * just in the UI, since the route is open to every authenticated role.
 */
/** Uploading (single or bulk): a manager may assign new leads to themselves or a direct report only. */
/** New leads only ever go to active users — never an inactive (or deleted) one. */
/**
 * Who can be given leads by a (re)assignment: an active sales agent/manager,
 * or an admin who is in the Sales department (an admin who also sells).
 */
function canReceiveLeads(u: { role: string; status: string; department?: string | null }): boolean {
  if (u.status !== "ACTIVE") return false;
  if (u.role === "AGENT") return !u.department || u.department === "SALES";
  return u.role === "ADMIN" && u.department === "SALES";
}

async function assertActiveAssignees(agentIds: string[]): Promise<void> {
  const ids = Array.from(new Set(agentIds));
  if (ids.length === 0) return;
  const { rows } = await query<{ count: string }>(`SELECT count(*) FROM users WHERE id = ANY($1::uuid[]) AND status = 'ACTIVE'`, [ids]);
  if (Number(rows[0]?.count ?? 0) !== ids.length) {
    throw ApiError.badRequest("Leads can only be assigned to active users.");
  }
}

async function assertUploadAssigneeAllowed(caller: AccessTokenPayload, agentId: string): Promise<void> {
  if (caller.role === "ADMIN" || agentId === caller.sub) return;
  const target = await usersRepo.findById(agentId);
  if (caller.roleType === "MANAGER" && target?.manager_id === caller.sub) return;
  throw ApiError.forbidden("You can only upload leads for yourself or your own team.");
}

async function assertReassignAllowed(caller: AccessTokenPayload, newAgentId: string): Promise<void> {
  if (caller.role === "ADMIN") return;

  if (caller.roleType === "MANAGER") {
    if (newAgentId === caller.sub) return;
    const target = await usersRepo.findById(newAgentId);
    if (target?.manager_id === caller.sub) return;
    // Any other active sales manager too — managers look after different
    // locations, so a lead for another manager's location goes straight to them.
    if (target?.role === "AGENT" && target.role_type === "MANAGER" && target.status === "ACTIVE") return;
    throw ApiError.forbidden("You can only reassign leads to your own direct reports or to another manager.");
  }

  // Agents can't reassign (the route already refuses them); kept as a guard
  // for any internal caller.
  throw ApiError.forbidden("Only admins and managers can reassign leads.");
}

// Deletion is ADMIN-only — enforced by requireRole at the route level (see
// leads.routes.ts). Reassignment is open to every role but scoped by
// reporting line above, since a Member routing a missed lead to a teammate
// is a normal CRM action, not an admin-only one.
/** Sets the lead's current note (owner, their manager or an admin) and records it in Activity History. */
export async function updateLeadNote(caller: AccessTokenPayload, leadId: string, note: string) {
  const scopedToAgentIds = await scopeForCaller(caller);
  const existing = await repo.findById(leadId, scopedToAgentIds);
  if (!existing) throw ApiError.notFound("Lead not found");
  await assertStatusChangeAllowed(caller, existing.assigned_agent_id, "edit its notes");
  await withTransaction(async (client) => {
    await repo.setNote(client, leadId, note, caller.sub);
    await repo.insertLeadLog(client, leadId, caller.sub, caller.name, `Note: ${note}`);
  });
  broadcastLeadChanged(leadId);
  return repo.findById(leadId, scopedToAgentIds);
}

/**
 * Managers (route-gated) link a lead to a property, change it or clear it,
 * reaching only their own team's leads (scopeForCaller). Admins can too,
 * but only the one Super Admin account — every other admin is blocked,
 * per explicit product decision (managers keep their existing access).
 * Every change is written to Activity History, old and new property named.
 */
// `note` is optional from the single-lead API (no schema field for it
// today) but required from the bulk one below (bulkSetLeadPropertySchema)
// — same shape as reassignLead's own optional/required split.
/** Name of the property `propertyId` points to, or undefined unless it exists in the matching list (Leads or Data Calling). */
async function findPropertyName(propertyId: string, kind: repo.LeadPropertyKind): Promise<string | undefined> {
  const row = await findPropertyById(propertyId);
  return row && row.kind === (kind === "DATA_CALLING" ? "DATA_CALLING" : "LEADS") ? row.name : undefined;
}

// `kind` picks which of the lead's two property fields changes (see
// repo.LEAD_PROPERTY_FIELDS). Same access rules for both.
export async function setLeadProperty(caller: AccessTokenPayload, leadId: string, propertyId: string | null, note?: string, kind: repo.LeadPropertyKind = "MAIN") {
  if (caller.role === "ADMIN" && !(await usersRepo.isSuperAdmin(caller.sub))) {
    throw ApiError.forbidden("Only the Super Admin can change a lead's property.");
  }
  const scopedToAgentIds = await scopeForCaller(caller);
  const existing = await repo.findById(leadId, scopedToAgentIds);
  if (!existing) throw ApiError.notFound("Lead not found");
  const current = kind === "DATA_CALLING"
    ? { id: existing.data_calling_property_id, name: existing.data_calling_property_name }
    : { id: existing.property_id, name: existing.property_name };
  if ((current.id ?? null) === propertyId) return existing;

  const nextName = propertyId ? await findPropertyName(propertyId, kind) : undefined;
  if (propertyId && !nextName) throw ApiError.badRequest("That property no longer exists.");
  const { label } = repo.LEAD_PROPERTY_FIELDS[kind];
  const before = current.name;
  const message = !nextName
    ? `${label} removed (was "${before}")`
    : before
      ? `${label} changed from "${before}" to "${nextName}"`
      : `${label} set to "${nextName}"`;

  await withTransaction(async (client) => {
    await repo.setPropertyId(client, leadId, propertyId, kind);
    if (note) await repo.setNote(client, leadId, note, caller.sub);
    await repo.insertLeadLog(client, leadId, caller.sub, caller.name, note ? `${message}. Note: ${note}` : message);
  });
  broadcastLeadChanged(leadId);
  return repo.findById(leadId, scopedToAgentIds);
}

export interface BulkSetLeadPropertyResult {
  requested: number;
  updated: number;
  skipped: number; // already on this property
  failed: { id: string; reason: string }[];
}

// Bulk counterpart to setLeadProperty above — same per-lead-loop shape as
// bulkReassignLeads (one lead's failure can't block the rest; each call
// reuses the single-lead function's own validation/logging).
const BULK_SET_PROPERTY_CHUNK_SIZE = 1000;

export async function bulkSetLeadProperty(
  caller: AccessTokenPayload,
  leadIds: string[],
  propertyId: string | null,
  note?: string,
  kind: repo.LeadPropertyKind = "MAIN"
): Promise<BulkSetLeadPropertyResult> {
  const ids = Array.from(new Set(leadIds));

  // Validated once for the whole job, not once per lead — these only depend
  // on the caller and the target property, never on which lead is being
  // touched (see leads.repository.ts's setLeadPropertyChunk for the batched
  // per-lead work this used to redo, including fetching the same row 3x).
  if (caller.role === "ADMIN" && !(await usersRepo.isSuperAdmin(caller.sub))) {
    throw ApiError.forbidden("Only the Super Admin can change a lead's property.");
  }
  const nextName = propertyId ? await findPropertyName(propertyId, kind) : undefined;
  if (propertyId && !nextName) throw ApiError.badRequest("That property no longer exists.");
  const scopedToAgentIds = await scopeForCaller(caller);

  let updated = 0;
  let skipped = 0;
  const failed: { id: string; reason: string }[] = [];

  for (let i = 0; i < ids.length; i += BULK_SET_PROPERTY_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BULK_SET_PROPERTY_CHUNK_SIZE);
    const result = await repo.setLeadPropertyChunk(chunk, propertyId, nextName, scopedToAgentIds, note, { userId: caller.sub, name: caller.name }, kind);
    updated += result.updated.length;
    skipped += result.skipped.length;
    result.notFound.forEach((id) => failed.push({ id, reason: "Lead not found" }));
  }

  if (updated > 0) broadcastManyLeadsChanged();

  return { requested: ids.length, updated, skipped, failed };
}

/**
 * Bulk "change leads' property" is Super-Admin-always (every other admin
 * is blocked), Manager-by-toggle — the Access Control switch in Settings >
 * Manage Users (Super Admin only), off by default. Mirrors
 * assertBulkImportAllowed's shape; checked once before queueing, since the
 * queued worker runs without a caller.
 */
export async function assertBulkPropertyChangeAllowed(caller: AccessTokenPayload): Promise<void> {
  if (caller.role === "ADMIN") {
    if (await usersRepo.isSuperAdmin(caller.sub)) return;
    throw ApiError.forbidden("Only the Super Admin can bulk-change leads' property.");
  }
  const allowed = await usersRepo.isBulkChangeLeadPropertyEnabled(caller.sub);
  if (!allowed) {
    throw ApiError.forbidden("You don't have access to bulk-change leads' property — ask an admin to enable it for you in Manage Users.");
  }
}

// `note` is required from the API (reassignLeadSchema); automatic internal
// reassignments (e.g. reassignUnassignedSheetLeads) pass none and only log the event.
/** Activity line for the previous agent's open follow-ups closed on reassignment (repo.reassign). */
const closedFollowupsLog = (n: number) =>
  `${n} open follow-up${n === 1 ? "" : "s"} from the previous agent closed on reassignment.`;

export async function reassignLead(caller: AccessTokenPayload, leadId: string, newAgentId: string, note?: string) {
  const previousAgentId = await repo.getAssignedAgentId(leadId);
  if (!previousAgentId) throw ApiError.notFound("Lead not found");
  if (previousAgentId === newAgentId) {
    throw ApiError.badRequest("Lead is already assigned to this agent.");
  }
  // Only the lead owner's own manager (or an admin) may move it: a manager
  // can't take leads from another manager's team, only hand out their own.
  if (caller.role !== "ADMIN") {
    const myTeam = await scopeForCaller(caller);
    if (!myTeam?.includes(previousAgentId)) throw ApiError.forbidden("You can only reassign your own team's leads.");
  }
  await assertReassignAllowed(caller, newAgentId);

  const newAgent = await usersRepo.findById(newAgentId);
  if (!newAgent) throw ApiError.badRequest("New agent not found.");
  // Leads only ever go to active CRM sales agents/managers — never Finance,
  // Admin or other departments, who can't work them from the CRM.
  if (!canReceiveLeads(newAgent)) {
    throw ApiError.badRequest("Leads can only be reassigned to active sales agents or managers.");
  }
  const newAgentName = `${newAgent.first_name}${newAgent.last_name ? " " + newAgent.last_name : ""}`;

  try {
    await withTransaction(async (client) => {
      const closedFollowups = await repo.reassign(client, leadId, previousAgentId, newAgentId);
      if (note) await repo.setNote(client, leadId, note, caller.sub);
      await repo.insertLeadLog(client, leadId, caller.sub, caller.name, note ? `Reassigned to ${newAgentName}. Note: ${note}` : `Reassigned to ${newAgentName}`);
      if (closedFollowups > 0) await repo.insertLeadLog(client, leadId, caller.sub, caller.name, closedFollowupsLog(closedFollowups));
    });
  } catch (err) {
    // newAgentId references users(id) — a well-formed but nonexistent UUID
    // passes Zod's uuid() check and only fails at the DB as an FK violation.
    if (isForeignKeyViolation(err)) {
      throw ApiError.badRequest("New agent not found.");
    }
    throw err;
  }

  // A lead still on the internal UNASSIGNED sentinel (no real owner yet)
  // graduates to NEW_LEAD now that it has one — the one place this must
  // happen for every reassignment path, not a follow-up step each caller
  // has to remember separately (reassignUnassignedSheetLeads below used to
  // be the only caller that did; the manual single-lead reassign route
  // never did, which is how a lead could end up with a real agent and
  // property assigned while still showing under the "Unassigned" filter —
  // UNASSIGNED's own display fallback shows it as "New Lead" everywhere
  // else, masking the real status underneath).
  await repo.markLeadNewIfUnassigned(leadId);

  const updated = await repo.findById(leadId);
  if (updated) {
    await createNotification({
      system: "CRM",
      category: "REASSIGNMENT",
      title: "Lead Reassigned To You",
      message: `${updated.name} — ${updated.property_name || "Unassigned Project"} was reassigned to you by ${caller.name}.`,
      recipientUserId: newAgentId,
      leadId: updated.id,
      link: "/dashboard/crm"
    });
  }
  broadcastLeadChanged(leadId);
  return updated;
}

export interface BulkReassignLeadsResult {
  requested: number;
  moved: number;
  skipped: number; // already assigned to this agent
  failed: { id: string; reason: string }[];
}

// Backs Data Calling's and the main CRM Leads page's bulk Assign/Reshuffle
// toolbar actions, which previously fired one apiReassignLead call per
// selected lead directly from the browser (unawaited in Data Calling's
// case) — hundreds of concurrent requests for a large selection, no single
// place to see how many actually succeeded. This reuses reassignLead's own
// per-lead permission/validation logic one lead at a time (same
// "each lead is its own transaction" reasoning as bulkDeleteLeads: one
// blocked lead must not roll back the others), just server-side and
// sequential instead of client-side and concurrent.
const BULK_REASSIGN_CHUNK_SIZE = 1000;

export async function bulkReassignLeads(
  caller: AccessTokenPayload,
  leadIds: string[],
  newAgentId: string,
  note?: string
): Promise<BulkReassignLeadsResult> {
  const ids = Array.from(new Set(leadIds));

  // Validated once for the whole job, not once per lead — assertReassignAllowed
  // and the new-agent checks only depend on the caller and newAgentId, never
  // on which lead is being moved. The old per-lead reassignLead() path redid
  // all of this (plus a fresh scopeForCaller DB round trip) on every single
  // lead — see leads.repository.ts's reassignLeadsChunk for the batched
  // per-lead work that replaces it.
  await assertReassignAllowed(caller, newAgentId);
  const newAgent = await usersRepo.findById(newAgentId);
  if (!newAgent) throw ApiError.badRequest("New agent not found.");
  if (!canReceiveLeads(newAgent)) {
    throw ApiError.badRequest("Leads can only be reassigned to active sales agents or managers.");
  }
  const newAgentName = `${newAgent.first_name}${newAgent.last_name ? " " + newAgent.last_name : ""}`;
  const scopedToAgentIds = await scopeForCaller(caller);

  const movedIds: string[] = [];
  let skipped = 0;
  const failed: { id: string; reason: string }[] = [];

  for (let i = 0; i < ids.length; i += BULK_REASSIGN_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BULK_REASSIGN_CHUNK_SIZE);
    const result = await repo.reassignLeadsChunk(chunk, newAgentId, newAgentName, scopedToAgentIds, note, { userId: caller.sub, name: caller.name });
    movedIds.push(...result.moved);
    skipped += result.skipped.length;
    result.notFound.forEach((id) => failed.push({ id, reason: "Lead not found" }));
    result.outOfScope.forEach((id) => failed.push({ id, reason: "You can only reassign your own team's leads." }));
  }
  const moved = movedIds.length;

  // One notification summarizing the whole batch, not one per lead — a
  // 300-lead reassignment used to mean 300 separate notifications/pushes to
  // the same new agent in a few seconds (the exact flood class
  // missedLeadScheduler.ts already guards against elsewhere). Clicking it
  // still opens the leads themselves: one lead keeps the single-lead shape
  // (leadId -> opens its drawer, same as reassignLead's own notification);
  // several open a list of exactly those leads, same link the users-module
  // handover uses for "Leads Reassigned To You".
  if (moved > 0) {
    const title = moved === 1 ? "Lead Reassigned To You" : `${moved} Leads Reassigned To You`;
    await createNotification({
      system: "CRM",
      category: "REASSIGNMENT",
      title,
      message: moved === 1
        ? `1 lead was reassigned to you by ${caller.name}.`
        : `${moved} leads were reassigned to you by ${caller.name}.`,
      recipientUserId: newAgentId,
      leadId: moved === 1 ? movedIds[0] : undefined,
      link: moved === 1
        ? "/dashboard/crm"
        : leadIdsLink(title, movedIds, "/dashboard/crm", { assignedAgentId: [newAgentId] })
    });
    broadcastManyLeadsChanged();
  }

  return { requested: ids.length, moved, skipped, failed };
}

/**
 * Hands a departing user's leads (`leadIds`, oldest first) to `targets`
 * round-robin, so each gets an equal share (±1), inside the caller's
 * transaction. Each lead's note and history name only its own new owner; the
 * admin's typed note is kept as an admins/managers-only history entry.
 * Follow-ups are moved separately (repo.moveFollowupsToLeadOwners) once all
 * leads have their new owner.
 */
export async function handOverLeadsInTransaction(
  client: PoolClient,
  caller: AccessTokenPayload,
  fromUser: { id: string; name: string },
  leadIds: string[],
  targets: { id: string; name: string }[],
  note: string
): Promise<Map<string, number>> {
  const received = new Map<string, number>();
  for (let i = 0; i < leadIds.length; i++) {
    const target = targets[i % targets.length];
    const closedFollowups = await repo.reassign(client, leadIds[i], fromUser.id, target.id);
    // The lead's visible note names only its own new owner — never the other
    // agents who got the rest of the split (see leads.handover.ts).
    await repo.setNote(client, leadIds[i], `Reassigned from ${fromUser.name} to ${target.name}.`, caller.sub);
    await repo.insertLeadLog(client, leadIds[i], caller.sub, caller.name, `Reassigned from ${fromUser.name} to ${target.name} (${fromUser.name} was removed).`);
    if (closedFollowups > 0) await repo.insertLeadLog(client, leadIds[i], caller.sub, caller.name, closedFollowupsLog(closedFollowups));
    // The admin's own note (may mention everyone) — admins & managers only.
    await repo.insertLeadLog(client, leadIds[i], caller.sub, caller.name, `${HANDOVER_NOTE_PREFIX}${note}`);
    received.set(target.id, (received.get(target.id) ?? 0) + 1);
  }
  return received;
}

/**
 * Preview for the property popup: leads that fell back to an admin only
 * because this property's Meta campaign / sheet tab wasn't linked yet (see
 * repo.findLeadsWaitingForProperty for every safeguard). Nothing moves here;
 * `canAssign` is false when the property has no active team to hand them to.
 */
export async function listLeadsWaitingForProperty(propertyId: string): Promise<{ leads: repo.WaitingLeadRow[]; canAssign: boolean }> {
  const [leads, assignment] = await Promise.all([repo.findLeadsWaitingForProperty(propertyId), getAssignmentPool(propertyId)]);
  return { leads, canAssign: !!assignment && assignment.pool.length > 0 };
}

/**
 * Assigns the waiting leads the admin confirmed in the preview. Each id is
 * re-checked against the same safeguards right now (a lead someone has
 * reassigned since the preview opened is skipped), then routed with the
 * property's own Round Robin / Percentage rule through reassignLead — same
 * history entry, notification, Unassigned -> New Lead and fresh 20-minute
 * clock as any reassignment. The lead's own Notes field is never touched.
 */
export async function assignLeadsWaitingForProperty(
  caller: AccessTokenPayload,
  propertyId: string,
  leadIds: string[]
): Promise<{ assigned: number; skipped: number }> {
  const property = await findPropertyById(propertyId);
  if (!property) throw ApiError.notFound("Property not found");
  const assignment = await getAssignmentPool(propertyId);
  if (!assignment || assignment.pool.length === 0) {
    throw ApiError.badRequest(`"${property.name}" has no active sales team to assign leads to yet.`);
  }

  const stillWaiting = new Set((await repo.findLeadsWaitingForProperty(propertyId)).map(l => l.id));
  let assigned = 0;
  let skipped = 0;
  for (const leadId of new Set(leadIds)) {
    if (!stillWaiting.has(leadId)) { skipped++; continue; }
    // Atomic claim: if another assign run (e.g. a second save a moment
    // earlier) already took this lead, skip it instead of moving it twice.
    if (!(await repo.claimWaitingLead(leadId))) { skipped++; continue; }
    // Filed under the property first, so Round Robin counts it for the right property.
    await repo.setLeadPropertyId(leadId, propertyId);
    const agentId = await pickAgentForProperty(propertyId);
    try {
      if (!agentId) throw new Error("No eligible agent on the property's team");
      await reassignLead(caller, leadId, agentId);
      await withTransaction(client => repo.insertLeadLog(client, leadId, caller.sub, caller.name,
        `Assigned from the waiting list after its campaign was linked to "${property.name}".`));
      assigned++;
    } catch (err) {
      // e.g. a team member who isn't an active sales agent — the lead goes
      // back to waiting Unassigned on the admin.
      await repo.releaseWaitingLead(leadId);
      logger.warn({ err, leadId, propertyId, agentId }, "Waiting lead not assigned — left on the admin");
      skipped++;
    }
  }
  return { assigned, skipped };
}

/**
 * Runs right after an admin saves a property's campaign / sheet links: every
 * lead that was waiting on an admin because those links didn't exist yet
 * (last 30 days, same safeguards as the waiting list) is handed to the
 * property's team automatically. `noTeam` tells the caller the leads are
 * still waiting because the property has no active team yet.
 */
export async function autoAssignLeadsWaitingForProperty(
  caller: AccessTokenPayload,
  propertyId: string
): Promise<{ assigned: number; skipped: number; noTeam: boolean }> {
  const { leads, canAssign } = await listLeadsWaitingForProperty(propertyId);
  if (leads.length === 0) return { assigned: 0, skipped: 0, noTeam: false };
  if (!canAssign) return { assigned: 0, skipped: leads.length, noTeam: true };
  const result = await assignLeadsWaitingForProperty(caller, propertyId, leads.map(l => l.id));
  return { ...result, noTeam: false };
}

/**
 * One-time (but safe to re-run anytime) maintenance action: re-checks every
 * sheet-imported lead currently sitting UNASSIGNED — i.e. one that fell back
 * to an admin at ingest time because its sheet source wasn't linked to a
 * property yet (Property editor -> Connected Lead-Form Sheets), or was
 * linked to one with no configured sales team — and moves it to a real
 * agent via the exact same Round Robin / Percentage rule a fresh import
 * would use, now that the link/team has been set up. A lead whose sheet
 * source still doesn't resolve to an assignable team is left exactly as it
 * was; nothing here ever assigns anyone speculatively.
 */
export async function reassignUnassignedSheetLeads(caller: AccessTokenPayload): Promise<{ reassigned: number; stillUnassigned: number; total: number }> {
  const candidates = await repo.findUnassignedSheetLeads();
  let reassigned = 0;
  let stillUnassigned = 0;

  for (const lead of candidates) {
    let propertyId = lead.property_id ?? undefined;

    // Same order as a new sheet lead: its Google campaign first...
    if (!propertyId && lead.campaign) {
      propertyId = await findPropertyIdByGoogleCampaignName(lead.campaign);
      if (propertyId) await repo.setLeadPropertyId(lead.id, propertyId);
    }

    // ...then, if still no property, recover the sheet's project name
    // from the lead's own first log entry and try the link again now that an
    // admin may have connected that sheet source to a property (Property
    // editor -> Connected Lead-Form Sheets).
    if (!propertyId) {
      const sourceSheetName = await repo.findImportedSourceSheetName(lead.id);
      if (sourceSheetName) {
        propertyId = await findPropertyIdBySheetSource(sourceSheetName);
        if (propertyId) {
          await repo.setLeadPropertyId(lead.id, propertyId);
        }
      }
    }

    const newAgentId = propertyId ? await pickAgentForProperty(propertyId) : undefined;

    if (!newAgentId || newAgentId === lead.assigned_agent_id) {
      stillUnassigned++;
      continue;
    }

    // reassignLead now promotes UNASSIGNED -> NEW_LEAD itself.
    await reassignLead(caller, lead.id, newAgentId);
    reassigned++;
  }

  return { reassigned, stillUnassigned, total: candidates.length };
}

/**
 * One-time (safe to re-run) maintenance action: ingestSheetLead used to let
 * created_at default to now() at insert time, dating every sheet-imported
 * lead by when the sync happened to run rather than when the prospect
 * actually submitted the form. That's since been fixed for new imports —
 * this corrects every lead imported before the fix, recovering the sheet's
 * real Timestamp from the "Original sheet timestamp: ..." line each lead
 * already has in its own first import log entry. A lead whose created_at
 * already matches (new imports, or a lead this has already fixed) is left
 * untouched.
 */
export async function fixSheetLeadTimestamps(): Promise<{ fixed: number; alreadyCorrect: number; total: number }> {
  const leads = await repo.findAllSheetLeads();
  let fixed = 0;
  let alreadyCorrect = 0;

  for (const lead of leads) {
    const originalTimestamp = await repo.findImportedOriginalTimestamp(lead.id);
    if (!originalTimestamp) {
      alreadyCorrect++;
      continue;
    }
    const currentCreatedAt = new Date(lead.created_at);
    if (Math.abs(currentCreatedAt.getTime() - originalTimestamp.getTime()) < 1000) {
      alreadyCorrect++;
      continue;
    }
    await repo.setLeadCreatedAt(lead.id, originalTimestamp);
    fixed++;
  }

  if (fixed > 0) broadcastManyLeadsChanged();
  return { fixed, alreadyCorrect, total: leads.length };
}

export async function deleteLead(actor: { userId: string; name: string }, leadId: string): Promise<void> {
  const existing = await repo.findById(leadId);
  if (!existing) throw ApiError.notFound("Lead not found");

  let removed: boolean;
  try {
    removed = await repo.archiveAndRemove(leadId, actor);
  } catch (err) {
    // invoices.lead_id is ON DELETE RESTRICT (see DATA_DICTIONARY.md) —
    // deliberately so a lead with billing history can't vanish silently.
    if (isForeignKeyViolation(err)) {
      throw ApiError.conflict("This lead has an associated invoice and cannot be deleted. Delete the invoice first.");
    }
    throw err;
  }
  // Lead was removed by someone else between the findById check and the delete.
  if (!removed) throw ApiError.notFound("Lead not found");
  broadcastLeadChanged(leadId);
}

export interface BulkDeleteLeadsResult {
  requested: number;
  deleted: number;
  notFound: number;
  blocked: { id: string; reason: string }[];
}

// Chunked, same philosophy as bulkImportLeads — one transaction per 1000
// ids instead of one per lead. A lead with an invoice can't block the rest
// of its chunk; see archiveAndRemoveChunk for how that isolation is kept
// without per-row transactions.
const BULK_DELETE_CHUNK_SIZE = 1000;

export async function bulkDeleteLeads(actor: { userId: string; name: string }, leadIds: string[]): Promise<BulkDeleteLeadsResult> {
  const ids = Array.from(new Set(leadIds));
  let deleted = 0;
  let notFound = 0;
  const blocked: { id: string; reason: string }[] = [];

  for (let i = 0; i < ids.length; i += BULK_DELETE_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BULK_DELETE_CHUNK_SIZE);
    const result = await repo.archiveAndRemoveChunk(chunk, actor);
    deleted += result.deleted.length;
    notFound += result.notFound.length;
    blocked.push(...result.blocked);
    result.deleted.forEach(id => broadcastLeadChanged(id));
  }

  return { requested: ids.length, deleted, notFound, blocked };
}

// KYC verification is ADMIN/FINANCE-only — enforced by requireRole at the
// route level (see leads.routes.ts), matching the frontend's verifyKYC action
// which only ever appears in the Finance module UI.
export async function verifyLeadKyc(leadId: string) {
  const updated = await repo.setKycVerified(leadId);
  if (!updated) throw ApiError.notFound("Lead not found");
  const lead = await repo.findById(leadId);
  if (lead) {
    await createNotification({
      system: "CRM",
      category: "KYC",
      title: "KYC Verified",
      message: `${lead.name}'s KYC document has been verified — the invoice can now be generated.`,
      recipientUserId: lead.assigned_agent_id,
      leadId: lead.id,
      link: "/dashboard/crm"
    });
  }
  broadcastLeadChanged(leadId);
  return lead;
}

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23503";
}
