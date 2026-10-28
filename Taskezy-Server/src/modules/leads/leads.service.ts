import type { PoolClient } from "pg";
import { withTransaction } from "../../db/pool";
import { AccessTokenPayload } from "../../utils/tokens";
import { ApiError } from "../../utils/ApiError";
import * as repo from "./leads.repository";
import { CreateLeadInput } from "./leads.repository";
import * as usersRepo from "../users/users.repository";
import { createNotification, deleteLeadActivityNotifications } from "../notifications/notifications.service";
import { findPropertyIdBySheetSource, findById as findPropertyById } from "../properties/properties.repository";
import { pickAgentForProperty, createPropertyAgentPicker } from "../properties/properties.assignment";
import { broadcastLeadChanged } from "./leads.realtime";
import { HANDOVER_NOTE_PREFIX } from "./leads.handover";
import { normalizeTypedIndianMobile } from "../../utils/validation";
import { assertTransitionAllowed, LeadStatusCode } from "./leadStatusTransitions";

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
async function scopeForCaller(caller: AccessTokenPayload): Promise<string[] | undefined> {
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
  missedOnly?: boolean;
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
    missedOnly: filter.missedOnly,
    slaMinutes: filter.missedOnly ? REPORT_SLA_MINUTES : undefined,
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
    const n = normalizeTypedIndianMobile(raw);
    if (n) normalizedSet.add(n);
  }

  const allMatched = await repo.findManyByPhones(Array.from(normalizedSet));
  const matchedPhones = new Set(allMatched.map(m => m.phone));

  const notFound = trimmed.filter(raw => {
    const n = normalizeTypedIndianMobile(raw);
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

export interface LeadSummaryStats {
  totalLeads: number;
  newLeads: number;
  rnr: number;
  callBacks: number;
  followUps: number;
  siteVisitScheduled: number;
  siteVisitDone: number;
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
  missedOnly?: boolean;
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
    missedOnly: filter.missedOnly,
    slaMinutes: filter.missedOnly ? REPORT_SLA_MINUTES : undefined,
    scopedToAgentIds
  });

  const countFor = (code: string): number =>
    grouped.filter(g => g.status_code === code).reduce((sum, g) => sum + Number(g.count), 0);
  const totalLeads = grouped.reduce((sum, g) => sum + Number(g.count), 0);

  return {
    totalLeads,
    newLeads: countFor(NEW_LEADS_CODE),
    rnr: countFor(RNR_CODE),
    callBacks: countFor(CALL_BACKS_CODE),
    followUps: countFor(FOLLOW_UPS_CODE),
    siteVisitScheduled: countFor(SITE_VISIT_SCHEDULED_CODE),
    siteVisitDone: countFor(SITE_VISIT_DONE_CODE)
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
  missedOnly?: boolean;
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
    missedOnly: filter.missedOnly,
    slaMinutes: filter.missedOnly ? REPORT_SLA_MINUTES : undefined,
    scopedToAgentIds
  });
}

// Mirrors LeadDashboard.tsx's UNQUALIFIED_STATUSES/SITE_VISIT_STATUSES —
// kept here (DB codes, not frontend display strings) for the same reason
// the 7-stat-card codes above are, but must stay in lockstep with that
// file if either list ever changes.
const UNQUALIFIED_CODES = ["RNR", "LOW_BUDGET", "DEAD_LEAD", "NOT_INTERESTED"];
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
}): Promise<AgentAnalyticsStats[]> {
  const scopedToAgentIds = await scopeForCaller(caller);
  const rows = await repo.getAnalyticsStatsByAgent(
    {
      propertyId: filter.propertyId,
      campaign: filter.campaign,
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
      scopedToAgentIds
    },
    UNQUALIFIED_CODES,
    SITE_VISIT_CODES
  );
  return rows.map(r => {
    const total = Number(r.total);
    const unqualified = Number(r.unqualified);
    return {
      assignedAgentId: r.assigned_agent_id,
      total,
      qualified: total - unqualified,
      unqualified,
      siteVisits: Number(r.site_visits)
    };
  });
}

// Mirrors frontend/src/lib/reportMetrics.ts's BUYER_STATUSES (the Agent
// report's "Qualified" bucket) and VISIT_OR_MEETING_STATUSES — same
// lockstep requirement as the other code-list constants above.
const REPORT_QUALIFIED_CODES = ["CALL_BACK", "FOLLOWUP", "EOI", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "BOOKED"];
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
    missedFollowups
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
    { dateFrom: filter.dateFrom, dateTo: filter.dateTo, scopedToAgentIds },
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

  // Set up once, outside the per-row loop — see createPropertyAgentPicker.
  const pickPropertyAgent =
    input.assignmentMode === "PROPERTY" ? await createPropertyAgentPicker(input.propertyId!) : undefined;
  const agentIds = input.assignmentMode === "AGENT" ? input.agentIds ?? [] : [];

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
    const phone = normalizeTypedIndianMobile(input.leads[i].phone ?? "");
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
      skipped.push({ row, reason: "Phone is not a valid 10-digit mobile number" });
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
    new Set(leads.map(l => normalizeTypedIndianMobile(l.phone ?? "")).filter((p): p is string => !!p))
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
  dealValue: number | undefined
) {
  const scopedToAgentIds = await scopeForCaller(caller);
  const existing = await repo.findById(leadId, scopedToAgentIds);
  if (!existing) throw ApiError.notFound("Lead not found");
  await assertStatusChangeAllowed(caller, existing.assigned_agent_id);
  // The one and only enforcement point for the Lead Status transition
  // matrix — every other code path that writes status_code is either
  // system-driven (markLeadNewIfUnassigned) or an initial INSERT, neither
  // of which is a user-initiated transition.
  await assertTransitionAllowed(existing.status_code, statusCode, leadId);

  const stampFirstResponse = existing.status_code === "NEW_LEAD"; // first-ever status change

  try {
    await withTransaction(async (client) => {
      await repo.updateStatus(client, leadId, statusCode, dealValue, stampFirstResponse);
      await repo.insertLeadLog(client, leadId, caller.sub, caller.name, `Status changed to "${statusCode}"`);
      // The agent responded in time — this is what the follow-up SLA
      // scheduler (jobs/followupScheduler.ts) checks for before escalating
      // a missed reminder to admins, so it needs to land in the same
      // transaction as the status change itself.
      await client.query(
        `UPDATE followup_calls SET status = 'COMPLETED' WHERE lead_id = $1 AND status = 'UPCOMING'`,
        [leadId]
      );
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

  broadcastLeadChanged(leadId);
  return repo.findById(leadId, scopedToAgentIds);
}

const VALID_CALL_STATUSES = new Set(["Connected", "Called", "Not Reachable", "Wrong Number"]);

/**
 * Data Calling's own field (migration 030) — fully independent of
 * updateLeadStatus above, no transition matrix between its 4 values. A
 * Connected result promotes a bulk-uploaded lead out of the cold-outreach
 * pipeline into the main CRM leads list (see leads.repository.ts's
 * updateCallStatus for the mechanics) the same way reaching
 * Connected+Qualified used to before this field existed.
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

  const promotion =
    callStatus === "Connected" && existing.source === "Bulk Upload"
      ? { source: "Data", statusCode: "NEW_LEAD" }
      : undefined;

  const nextSubStatus =
    callStatus !== "Connected"
      ? null
      : callSubStatus !== undefined
        ? callSubStatus
        : existing.call_status === "Connected" ? existing.call_sub_status : null;
  const statusChanged = existing.call_status !== callStatus;
  const subStatusChanged = (existing.call_sub_status ?? null) !== nextSubStatus;

  await withTransaction(async (client) => {
    await repo.updateCallStatus(client, leadId, callStatus, nextSubStatus, promotion);
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
    throw ApiError.forbidden("You can only reassign leads to one of your own direct reports.");
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
export async function setLeadProperty(caller: AccessTokenPayload, leadId: string, propertyId: string | null, note?: string) {
  if (caller.role === "ADMIN" && !(await usersRepo.isSuperAdmin(caller.sub))) {
    throw ApiError.forbidden("Only the Super Admin can change a lead's property.");
  }
  const scopedToAgentIds = await scopeForCaller(caller);
  const existing = await repo.findById(leadId, scopedToAgentIds);
  if (!existing) throw ApiError.notFound("Lead not found");
  if ((existing.property_id ?? null) === propertyId) return existing;

  const next = propertyId ? await findPropertyById(propertyId) : undefined;
  if (propertyId && !next) throw ApiError.badRequest("That property no longer exists.");
  const before = existing.property_name;
  const message = !next
    ? `Property removed (was "${before}")`
    : before
      ? `Property changed from "${before}" to "${next.name}"`
      : `Property set to "${next.name}"`;

  await withTransaction(async (client) => {
    await repo.setPropertyId(client, leadId, propertyId);
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
export async function bulkSetLeadProperty(
  caller: AccessTokenPayload,
  leadIds: string[],
  propertyId: string | null,
  note: string
): Promise<BulkSetLeadPropertyResult> {
  const ids = Array.from(new Set(leadIds));
  let updated = 0;
  let skipped = 0;
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      const before = await repo.findById(id, await scopeForCaller(caller));
      if (!before) {
        failed.push({ id, reason: "Lead not found" });
        continue;
      }
      if ((before.property_id ?? null) === propertyId) {
        skipped++;
        continue;
      }
      await setLeadProperty(caller, id, propertyId, note);
      updated++;
    } catch (err) {
      failed.push({ id, reason: err instanceof ApiError ? err.message : "Unexpected error" });
    }
  }

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
  if (newAgent.role !== "AGENT" || newAgent.status !== "ACTIVE" || (newAgent.department && newAgent.department !== "SALES")) {
    throw ApiError.badRequest("Leads can only be reassigned to active sales agents or managers.");
  }
  const newAgentName = `${newAgent.first_name}${newAgent.last_name ? " " + newAgent.last_name : ""}`;

  try {
    await withTransaction(async (client) => {
      await repo.reassign(client, leadId, previousAgentId, newAgentId);
      if (note) await repo.setNote(client, leadId, note, caller.sub);
      await repo.insertLeadLog(client, leadId, caller.sub, caller.name, note ? `Reassigned to ${newAgentName}. Note: ${note}` : `Reassigned to ${newAgentName}`);
    });
  } catch (err) {
    // newAgentId references users(id) — a well-formed but nonexistent UUID
    // passes Zod's uuid() check and only fails at the DB as an FK violation.
    if (isForeignKeyViolation(err)) {
      throw ApiError.badRequest("New agent not found.");
    }
    throw err;
  }

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
export async function bulkReassignLeads(
  caller: AccessTokenPayload,
  leadIds: string[],
  newAgentId: string,
  note: string
): Promise<BulkReassignLeadsResult> {
  const ids = Array.from(new Set(leadIds));
  let moved = 0;
  let skipped = 0;
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    const currentAgentId = await repo.getAssignedAgentId(id);
    if (!currentAgentId) {
      failed.push({ id, reason: "Lead not found" });
      continue;
    }
    if (currentAgentId === newAgentId) {
      skipped++;
      continue;
    }
    try {
      await reassignLead(caller, id, newAgentId, note);
      // No-op unless this lead was still on the internal UNASSIGNED
      // sentinel (see the LeadStatus segregation memory) — promotes it to
      // NEW_LEAD now that it has a real owner, same as the Assign flow did
      // client-side before.
      await repo.markLeadNewIfUnassigned(id);
      moved++;
    } catch (err) {
      failed.push({ id, reason: err instanceof ApiError ? err.message : "Unexpected error" });
    }
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
    await repo.reassign(client, leadIds[i], fromUser.id, target.id);
    // The lead's visible note names only its own new owner — never the other
    // agents who got the rest of the split (see leads.handover.ts).
    await repo.setNote(client, leadIds[i], `Reassigned from ${fromUser.name} to ${target.name}.`, caller.sub);
    await repo.insertLeadLog(client, leadIds[i], caller.sub, caller.name, `Reassigned from ${fromUser.name} to ${target.name} (${fromUser.name} was removed).`);
    // The admin's own note (may mention everyone) — admins & managers only.
    await repo.insertLeadLog(client, leadIds[i], caller.sub, caller.name, `${HANDOVER_NOTE_PREFIX}${note}`);
    received.set(target.id, (received.get(target.id) ?? 0) + 1);
  }
  return received;
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

    // No property matched at ingest time — recover the sheet's project name
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

    await reassignLead(caller, lead.id, newAgentId);
    await repo.markLeadNewIfUnassigned(lead.id);
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
