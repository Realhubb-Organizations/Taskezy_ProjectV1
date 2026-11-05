import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk, sendPaginated } from "../../utils/apiResponse";
import { query } from "../../db/pool";
import { BUSINESS_TIMEZONE } from "../../utils/businessDate";
import { AccessTokenPayload } from "../../utils/tokens";
import { findDirectReportIds } from "../users/users.repository";
import { LEAD_SOURCE_BUCKET_SQL } from "../leads/leads.repository";
import { canSeeMissedTaskCount } from "../leads/leads.handover";
import { MISSED_BY_JOIN_SQL } from "./siteVisitSql";
import { FOLLOWUP_EVER_MISSED_SQL, IS_SITE_VISIT_FOLLOWUP_SQL, SITE_VISIT_DONE_LOG } from "./siteVisitSql";

// Reports → Team Reports (frontend TeamReports.tsx): KPI cards, the
// Salesperson Leads Report (one row per salesperson), the Salesperson Site
// Visit Report (one row per lead with a site visit) and the Salesperson
// Missed Task / Data Calling Reports (paged lists).
//
// Dates: lead numbers are for leads created in the range (same as every
// other report); tasks and site visits are dated by when they were due.
// Scope: an Admin sees everyone, a Manager themselves + their direct
// reports, a Member only themselves — same rule as GET /leads.

export const teamReportRouter = Router();
teamReportRouter.use(requireAuth);
teamReportRouter.use(requireRole("ADMIN", "AGENT"));

// Same "qualified" statuses as Marketing Reports (ad-spend.routes.ts BUYER_CODES).
const QUALIFIED_CODES = ["CALL_BACK", "FOLLOWUP", "EOI", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "BOOKED"];

const toArray = z.union([z.string(), z.array(z.string())])
  .optional()
  .transform(v => v === undefined ? undefined : (Array.isArray(v) ? v : [v]));
const uuidArray = z.union([z.string().uuid(), z.array(z.string().uuid())])
  .optional()
  .transform(v => v === undefined ? undefined : (Array.isArray(v) ? v : [v]));
const SOURCES = ["META", "GOOGLE", "DATA"] as const;

const teamReportQuerySchema = z.object({
  // LEADS = the Leads page's leads (not the Data Calling pool);
  // DATA_CALLING = the Data Calling page's leads (any sub-source).
  mode: z.enum(["LEADS", "DATA_CALLING"]).default("LEADS"),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD").optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD").optional(),
  campaign: toArray,
  propertyId: uuidArray,
  noProperty: z.enum(["true", "false"]).optional().transform(v => v === "true"),
  // Salespeople (Team / Salesperson filters) — always narrowed to the caller's scope.
  assignedAgentId: uuidArray,
  // Leads mode only.
  source: z.union([z.enum(SOURCES), z.array(z.enum(SOURCES))])
    .optional()
    .transform(v => v === undefined ? undefined : (Array.isArray(v) ? v : [v])),
  // Data Calling mode only: batch labels (leads.sub_source).
  subSource: toArray
});
type TeamReportQuery = z.infer<typeof teamReportQuerySchema>;

async function scopeForCaller(caller: AccessTokenPayload): Promise<string[] | null> {
  if (caller.role !== "AGENT") return null;
  if (caller.roleType === "MANAGER") return [caller.sub, ...(await findDirectReportIds(caller.sub))];
  return [caller.sub];
}

/**
 * WHERE conditions for leads (alias `l`), pushing their values onto
 * `params`. noDate leaves out the created-date bounds (tasks and site
 * visits use their own dates); agentColumn is the salesperson column the
 * scope and salesperson filter apply to.
 */
function leadConditions(
  q: TeamReportQuery,
  scope: string[] | null,
  params: unknown[],
  opts: { noDate?: boolean; agentColumn?: string } = {}
): string {
  const p = (v: unknown) => `$${params.push(v)}`;
  const agentColumn = opts.agentColumn ?? "l.assigned_agent_id";
  const c: string[] = [];
  if (scope) c.push(`${agentColumn} = ANY(${p(scope)}::uuid[])`);
  if (q.assignedAgentId?.length) c.push(`${agentColumn} = ANY(${p(q.assignedAgentId)}::uuid[])`);
  if (!opts.noDate && q.dateFrom) c.push(`(l.created_at AT TIME ZONE ${p(BUSINESS_TIMEZONE)})::date >= ${p(q.dateFrom)}::date`);
  if (!opts.noDate && q.dateTo) c.push(`(l.created_at AT TIME ZONE ${p(BUSINESS_TIMEZONE)})::date <= ${p(q.dateTo)}::date`);
  if (q.campaign?.length) c.push(`LOWER(COALESCE(l.campaign, l.source)) = ANY(${p(q.campaign.map(x => x.toLowerCase()))}::text[])`);
  if (q.propertyId?.length || q.noProperty) {
    c.push(`(l.property_id = ANY(${p(q.propertyId ?? [])}::uuid[])${q.noProperty ? " OR l.property_id IS NULL" : ""})`);
  }
  if (q.mode === "DATA_CALLING") {
    c.push(`l.sub_source IS NOT NULL`);
    if (q.subSource?.length) c.push(`l.sub_source = ANY(${p(q.subSource)}::text[])`);
  } else {
    c.push(`l.source IS DISTINCT FROM 'Bulk Upload'`);
    if (q.source?.length) c.push(`${LEAD_SOURCE_BUCKET_SQL} = ANY(${p(q.source)}::text[])`);
  }
  return c.join(" AND ");
}

/** Due-date bounds on followup_calls.scheduled_at (business calendar days). */
function dueConditions(q: TeamReportQuery, params: unknown[]): string {
  const p = (v: unknown) => `$${params.push(v)}`;
  const c = ["TRUE"];
  if (q.dateFrom) c.push(`(fc.scheduled_at AT TIME ZONE ${p(BUSINESS_TIMEZONE)})::date >= ${p(q.dateFrom)}::date`);
  if (q.dateTo) c.push(`(fc.scheduled_at AT TIME ZONE ${p(BUSINESS_TIMEZONE)})::date <= ${p(q.dateTo)}::date`);
  return c.join(" AND ");
}

/**
 * A call made with the Call button (call_attempts, channel CALL) — the day
 * it was made (business calendar), alias `ca`. "Calls Made" = different
 * leads each agent called that day, counted for the agent who called.
 */
const CALL_DAY_SQL = (tz: string) => `(COALESCE(ca.started_at, ca.created_at) AT TIME ZONE ${tz})::date`;

/** Date bounds on the call's own day (not the lead's created date). */
function callDayConditions(q: TeamReportQuery, params: unknown[]): string {
  const p = (v: unknown) => `$${params.push(v)}`;
  const c = [`ca.channel = 'CALL'`];
  if (q.dateFrom) c.push(`${CALL_DAY_SQL(p(BUSINESS_TIMEZONE))} >= ${p(q.dateFrom)}::date`);
  if (q.dateTo) c.push(`${CALL_DAY_SQL(p(BUSINESS_TIMEZONE))} <= ${p(q.dateTo)}::date`);
  return c.join(" AND ");
}

const userName = (alias: string) => `NULLIF(TRIM(${alias}.first_name || COALESCE(' ' || ${alias}.last_name, '')), '')`;

teamReportRouter.get(
  "/team",
  validate({ query: teamReportQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as TeamReportQuery;
    const scope = await scopeForCaller(req.user!);
    const dataCalling = q.mode === "DATA_CALLING";
    // Data Calling counts calls the way the Data Calling page does: Qualified /
    // Not Qualified = a Connected call's sub-status, RNR = Not Reachable.
    const qualifiedSql = dataCalling ? `(l.call_status = 'Connected' AND l.call_sub_status = 'Qualified')` : `l.status_code = ANY('{${QUALIFIED_CODES.join(",")}}'::text[])`;
    const rnrSql = dataCalling ? `l.call_status = 'Not Reachable'` : `l.status_code = 'RNR'`;

    const leadParams: unknown[] = [];
    const leadWhere = leadConditions(q, scope, leadParams);

    const taskParams: unknown[] = [];
    const taskWhere = `${FOLLOWUP_EVER_MISSED_SQL} AND ${dueConditions(q, taskParams)} AND ${leadConditions(q, scope, taskParams, { noDate: true, agentColumn: "r.agent_id" })}`;

    // Site visits: leads with a visit due in the range, then every visit
    // those leads ever had (for the first date, reschedules and misses).
    const svParams: unknown[] = [];
    const svPickWhere = `${IS_SITE_VISIT_FOLLOWUP_SQL} AND ${dueConditions(q, svParams)} AND ${leadConditions(q, scope, svParams, { noDate: true })}`;
    const doneLogParam = `$${svParams.push(SITE_VISIT_DONE_LOG)}`;
    // A visit inside the date range (the lead may also have visits outside it).
    const svInRange = dueConditions(q, svParams);

    const subSourceParams: unknown[] = [];
    const subSourceScope = scope ? `AND l.assigned_agent_id = ANY($${subSourceParams.push(scope)}::uuid[])` : "";

    // Calls Made (Data Calling): from the Call button, against who called —
    // reshuffling a lead or changing its status never adds to it.
    const callParams: unknown[] = [];
    const callWhere = `${callDayConditions(q, callParams)} AND ${leadConditions(q, scope, callParams, { noDate: true, agentColumn: "ca.caller_user_id" })}`;
    const callTz = `$${callParams.push(BUSINESS_TIMEZONE)}`;

    const [byAgentResult, missedResult, svResult, subSourceResult, callsResult] = await Promise.all([
      query<Record<string, string | null>>(
        `SELECT l.assigned_agent_id AS agent_id, ${userName("u")} AS agent_name,
                count(*) AS total,
                count(*) FILTER (WHERE l.assigned_agent_id IS NOT NULL) AS assigned,
                count(*) FILTER (WHERE ${qualifiedSql}) AS qualified,
                count(*) FILTER (WHERE l.call_status = 'Connected' AND l.call_sub_status = 'Unqualified') AS not_qualified,
                count(*) FILTER (WHERE l.call_status IS NOT NULL) AS calls_made,
                count(*) FILTER (WHERE l.call_status = 'Connected') AS connected,
                count(*) FILTER (WHERE l.status_code IN ('SITE_VISIT_SCHEDULED', 'SITE_VISIT_DONE')) AS site_visits,
                count(*) FILTER (WHERE ${rnrSql}) AS rnr,
                count(*) FILTER (WHERE l.status_code = 'FOLLOWUP') AS follow_ups,
                count(*) FILTER (WHERE l.status_code = 'CALL_BACK') AS call_backs
         FROM leads l
         LEFT JOIN users u ON u.id = l.assigned_agent_id
         WHERE ${leadWhere}
         GROUP BY l.assigned_agent_id, u.first_name, u.last_name`,
        leadParams
      ),
      // Missed Tasks = follow-up tasks (any type) that went missed, counted
      // against the agent the task belonged to when it was missed — never
      // whoever has the lead now. A removed agent (no user row) keeps their
      // misses under their saved name.
      query<{ agent_id: string | null; agent_name: string | null; missed: string }>(
        `SELECT r.agent_id, COALESCE(max(${userName("u")}), max(r.agent_name)) AS agent_name, count(*) AS missed
         FROM followup_calls fc
         ${MISSED_BY_JOIN_SQL}
         JOIN leads l ON l.id = fc.lead_id
         LEFT JOIN users u ON u.id = r.agent_id
         WHERE ${taskWhere}
         GROUP BY r.agent_id, CASE WHEN r.agent_id IS NULL THEN r.agent_name END`,
        taskParams
      ),
      query<{
        lead_id: string; name: string; phone: string; status_code: string; agent_id: string | null; agent_name: string | null;
        property_name: string | null; missed_task_count: number; sv_count: string; missed_count: string; range_missed: string; range_upcoming: string; first_at: string;
        last_at: string; reason: string | null; done_at: string | null; all_missed: string; next_call_at: string | null;
      }>(
        `WITH picked AS (
           SELECT DISTINCT fc.lead_id
           FROM followup_calls fc
           JOIN leads l ON l.id = fc.lead_id
           WHERE ${svPickWhere}
         ),
         ev AS (
           SELECT fc.lead_id, fc.scheduled_at, fc.created_at, fc.reschedule_reason, ${FOLLOWUP_EVER_MISSED_SQL} AS missed,
                  fc.status, (${svInRange}) AS in_range
           FROM followup_calls fc
           JOIN picked p ON p.lead_id = fc.lead_id
           WHERE ${IS_SITE_VISIT_FOLLOWUP_SQL}
         ),
         per_lead AS (
           SELECT lead_id,
                  count(*) AS sv_count,
                  count(*) FILTER (WHERE missed) AS missed_count,
                  count(*) FILTER (WHERE missed AND in_range) AS range_missed,
                  count(*) FILTER (WHERE status = 'UPCOMING' AND in_range) AS range_upcoming,
                  (array_agg(scheduled_at ORDER BY created_at))[1] AS first_at,
                  (array_agg(scheduled_at ORDER BY created_at DESC))[1] AS last_at,
                  (array_agg(reschedule_reason ORDER BY created_at DESC) FILTER (WHERE reschedule_reason IS NOT NULL))[1] AS reason
           FROM ev
           GROUP BY lead_id
         )
         SELECT pl.lead_id, l.name, l.phone, l.status_code, l.assigned_agent_id AS agent_id, ${userName("u")} AS agent_name,
                pr.name AS property_name, l.missed_task_count, pl.sv_count, pl.missed_count, pl.range_missed, pl.range_upcoming, pl.first_at, pl.last_at, pl.reason,
                (SELECT max(ll.created_at) FROM lead_logs ll WHERE ll.lead_id = l.id AND ll.message = ${doneLogParam}) AS done_at,
                -- every missed task for the lead, calls included
                (SELECT count(*) FROM followup_calls fc WHERE fc.lead_id = l.id AND ${FOLLOWUP_EVER_MISSED_SQL}) AS all_missed,
                (SELECT min(fc.scheduled_at) FROM followup_calls fc WHERE fc.lead_id = l.id AND fc.status = 'UPCOMING') AS next_call_at
         FROM per_lead pl
         JOIN leads l ON l.id = pl.lead_id
         LEFT JOIN users u ON u.id = l.assigned_agent_id
         LEFT JOIN properties pr ON pr.id = l.property_id
         ORDER BY pl.last_at DESC`,
        svParams
      ),
      dataCalling
        ? query<{ sub_source: string }>(
          `SELECT DISTINCT l.sub_source FROM leads l WHERE l.sub_source IS NOT NULL ${subSourceScope} ORDER BY l.sub_source`,
          subSourceParams
        )
        : Promise.resolve({ rows: [] as { sub_source: string }[] }),
      dataCalling
        ? query<{ agent_id: string; agent_name: string | null; calls: string }>(
          `SELECT ca.caller_user_id AS agent_id, max(${userName("u")}) AS agent_name,
                  count(DISTINCT (ca.lead_id, ${CALL_DAY_SQL(callTz)})) AS calls
           FROM call_attempts ca
           JOIN leads l ON l.id = ca.lead_id
           LEFT JOIN users u ON u.id = ca.caller_user_id
           WHERE ${callWhere}
           GROUP BY ca.caller_user_id`,
          callParams
        )
        : Promise.resolve({ rows: [] as { agent_id: string; agent_name: string | null; calls: string }[] })
    ]);

    // One row per salesperson with leads or missed tasks in the filters;
    // the cards are the totals (unassigned leads count there, with no row).
    const zero = () => ({
      totalLeads: 0, assigned: 0, qualified: 0, notQualified: 0, callsMade: 0, connected: 0,
      siteVisits: 0, rnr: 0, followUps: 0, callBacks: 0, missedTasks: 0
    });
    type Counts = ReturnType<typeof zero>;
    const rows = new Map<string, Counts & { agentId: string; name: string }>();
    const rowFor = (id: string, name: string | null) => {
      let r = rows.get(id);
      if (!r) {
        r = { agentId: id, name: name ?? "Unknown", ...zero() };
        rows.set(id, r);
      }
      return r;
    };
    const kpis = zero();
    byAgentResult.rows.forEach(a => {
      const counts: Omit<Counts, "missedTasks"> = {
        totalLeads: Number(a.total), assigned: Number(a.assigned), qualified: Number(a.qualified), notQualified: Number(a.not_qualified),
        callsMade: Number(a.calls_made), connected: Number(a.connected), siteVisits: Number(a.site_visits),
        rnr: Number(a.rnr), followUps: Number(a.follow_ups), callBacks: Number(a.call_backs)
      };
      (Object.keys(counts) as (keyof typeof counts)[]).forEach(k => { kpis[k] += counts[k]; });
      if (a.agent_id) Object.assign(rowFor(a.agent_id, a.agent_name), counts);
    });
    if (dataCalling) {
      // Replaces the lead-based count above (leads now owned with a call status).
      kpis.callsMade = 0;
      rows.forEach(r => { r.callsMade = 0; });
      callsResult.rows.forEach(c => {
        kpis.callsMade += Number(c.calls);
        rowFor(c.agent_id, c.agent_name).callsMade = Number(c.calls);
      });
    }
    missedResult.rows.forEach(m => {
      kpis.missedTasks += Number(m.missed);
      // A removed agent has no id left — keyed by name ("removed:<name>"; the
      // page shows their count without a drill-down link).
      rowFor(m.agent_id ?? `removed:${m.agent_name ?? ""}`, m.agent_name).missedTasks = Number(m.missed);
    });

    const showMissedCount = canSeeMissedTaskCount(req.user!);
    const siteVisitLeads = svResult.rows.map(r => {
      const svCount = Number(r.sv_count);
      return {
        leadId: r.lead_id,
        name: r.name,
        phone: r.phone,
        status: r.status_code,
        salespersonId: r.agent_id,
        salesperson: r.agent_name,
        propertyName: r.property_name,
        missedTaskCount: showMissedCount ? r.missed_task_count : undefined,
        // First date the visit was booked for; the latest new date if it moved.
        scheduledAt: r.first_at,
        rescheduledAt: svCount > 1 ? r.last_at : null,
        rescheduleReason: svCount > 1 ? r.reason : null,
        rescheduleCount: svCount - 1,
        siteVisitCount: svCount,
        missedCount: Number(r.missed_count),
        // Visits inside the date range only: missed / still upcoming
        // (Marketing's "Lead SV Missed" / "SV Scheduled").
        rangeMissedCount: Number(r.range_missed),
        rangeUpcomingCount: Number(r.range_upcoming),
        allMissedCount: Number(r.all_missed),
        nextCallAt: r.next_call_at,
        doneAt: r.done_at,
        // Done also covers leads that went straight to Booked, or were marked
        // done before this was tracked (no date for those).
        done: !!r.done_at || r.status_code === "SITE_VISIT_DONE" || r.status_code === "BOOKED"
      };
    });

    sendOk(res, {
      kpis,
      salespeople: Array.from(rows.values()).sort((a, b) => b.totalLeads - a.totalLeads || a.name.localeCompare(b.name)),
      siteVisits: {
        kpis: {
          qualified: kpis.qualified,
          leads: siteVisitLeads.length,
          scheduled: siteVisitLeads.reduce((n, r) => n + r.siteVisitCount, 0),
          done: siteVisitLeads.filter(r => r.done).length,
          missedLeads: siteVisitLeads.filter(r => r.missedCount > 0).length,
          missedTasks: siteVisitLeads.reduce((n, r) => n + r.missedCount, 0),
          // Reschedules per lead, averaged over the leads in the table.
          avgReschedules: siteVisitLeads.length > 0 ? siteVisitLeads.reduce((n, r) => n + r.rescheduleCount, 0) / siteVisitLeads.length : 0
        },
        leads: siteVisitLeads
      },
      subSources: subSourceResult.rows.map(r => r.sub_source)
    });
  })
);

const pageSchema = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(500).default(10)
};
type Paged = TeamReportQuery & { page: number; pageSize: number };

// Salesperson Missed Task Report's Missed Followups tab (and the Missed
// Tasks card's list) — the same tasks the card counts, a page at a time,
// optionally narrowed by lead name and the lead's current status.
teamReportRouter.get(
  "/team/missed-tasks",
  validate({
    query: teamReportQuerySchema.extend({
      ...pageSchema,
      search: z.string().trim().max(200).optional(),
      leadStatus: toArray
    })
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as Paged & { search?: string; leadStatus?: string[] };
    const scope = await scopeForCaller(req.user!);
    const params: unknown[] = [];
    let where = `${FOLLOWUP_EVER_MISSED_SQL} AND ${dueConditions(q, params)} AND ${leadConditions(q, scope, params, { noDate: true, agentColumn: "r.agent_id" })}`;
    if (q.search) where += ` AND l.name ILIKE $${params.push(`%${q.search}%`)}`;
    if (q.leadStatus?.length) where += ` AND l.status_code = ANY($${params.push(q.leadStatus)}::text[])`;
    const countResult = await query<{ count: string }>(
      `SELECT count(*) FROM followup_calls fc ${MISSED_BY_JOIN_SQL} JOIN leads l ON l.id = fc.lead_id WHERE ${where}`,
      params
    );
    const totalCount = Number(countResult.rows[0]?.count ?? 0);
    const pageParams = [...params, q.pageSize, (q.page - 1) * q.pageSize];
    const { rows } = await query<Record<string, unknown>>(
      `SELECT fc.id, fc.lead_id, l.name AS lead_name, l.phone, l.email, l.notes, l.assigned_agent_id, pr.name AS property_name,
              ${userName("la")} AS lead_agent_name, fc.scheduled_at, fc.status, l.status_code AS lead_status,
              CASE WHEN ${IS_SITE_VISIT_FOLLOWUP_SQL} THEN 'SITE_VISIT' ELSE fc.call_type END AS call_type,
              COALESCE(${userName("u")}, r.agent_name) AS assigned_to_name, l.missed_task_count,
              (SELECT min(nx.scheduled_at) FROM followup_calls nx WHERE nx.lead_id = l.id AND nx.status = 'UPCOMING') AS next_call_at
       FROM followup_calls fc
       ${MISSED_BY_JOIN_SQL}
       JOIN leads l ON l.id = fc.lead_id
       LEFT JOIN users u ON u.id = r.agent_id
       LEFT JOIN users la ON la.id = l.assigned_agent_id
       LEFT JOIN properties pr ON pr.id = l.property_id
       WHERE ${where}
       ORDER BY fc.scheduled_at DESC, fc.id
       LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams
    );
    if (!canSeeMissedTaskCount(req.user!)) rows.forEach(r => { delete r.missed_task_count; });
    sendPaginated(res, rows, { page: q.page, pageSize: q.pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / q.pageSize)) });
  })
);

// Data Calling page's Calls Made: every (lead, agent who called, day) from
// the Call button, for Data Calling leads — one compact [leadId, agentId,
// "YYYY-MM-DD"] row each, scoped to who the caller may see. The page counts
// different leads called per day from these (reshuffles never add any).
teamReportRouter.get(
  "/data-calling/call-days",
  asyncHandler(async (req, res) => {
    const scope = await scopeForCaller(req.user!);
    const params: unknown[] = [BUSINESS_TIMEZONE];
    const scopeSql = scope ? `AND ca.caller_user_id = ANY($${params.push(scope)}::uuid[])` : "";
    const { rows } = await query<{ lead_id: string; caller_user_id: string; day: string }>(
      `SELECT DISTINCT ca.lead_id, ca.caller_user_id, ${CALL_DAY_SQL("$1")}::text AS day
       FROM call_attempts ca
       JOIN leads l ON l.id = ca.lead_id
       WHERE ca.channel = 'CALL' AND l.sub_source IS NOT NULL ${scopeSql}`,
      params
    );
    sendOk(res, rows.map(r => [r.lead_id, r.caller_user_id, r.day]));
  })
);

// Salesperson Data Calling Report — one row per Data Calling lead in the
// filters (leads created in the range), a page at a time.
teamReportRouter.get(
  "/team/data-calling-leads",
  validate({ query: teamReportQuerySchema.extend({ ...pageSchema, search: z.string().trim().max(200).optional() }) }),
  asyncHandler(async (req, res) => {
    const q = { ...(req.query as unknown as Paged & { search?: string }), mode: "DATA_CALLING" as const };
    const scope = await scopeForCaller(req.user!);
    const params: unknown[] = [];
    let where = leadConditions(q, scope, params);
    if (q.search) where += ` AND l.name ILIKE $${params.push(`%${q.search}%`)}`;
    const countResult = await query<{ count: string }>(`SELECT count(*) FROM leads l WHERE ${where}`, params);
    const totalCount = Number(countResult.rows[0]?.count ?? 0);
    const pageParams = [...params, q.pageSize, (q.page - 1) * q.pageSize];
    const { rows } = await query<Record<string, unknown>>(
      `SELECT l.id AS lead_id, l.name AS lead_name, l.phone, l.sub_source, l.call_status, l.call_sub_status, l.status_code,
              ${userName("u")} AS assigned_to_name, l.missed_task_count,
              (SELECT max(ll.created_at) FROM lead_logs ll WHERE ll.lead_id = l.id AND ll.message LIKE 'Call status changed to %') AS last_called_at,
              (SELECT min(fc.scheduled_at) FROM followup_calls fc WHERE fc.lead_id = l.id AND fc.status = 'UPCOMING') AS next_call_at
       FROM leads l
       LEFT JOIN users u ON u.id = l.assigned_agent_id
       WHERE ${where}
       ORDER BY l.created_at DESC, l.id
       LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams
    );
    if (!canSeeMissedTaskCount(req.user!)) rows.forEach(r => { delete r.missed_task_count; });
    sendPaginated(res, rows, { page: q.page, pageSize: q.pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / q.pageSize)) });
  })
);
