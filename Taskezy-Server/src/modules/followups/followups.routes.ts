import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk, sendPaginated } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { pool, query } from "../../db/pool";
import { deleteLeadActivityNotifications } from "../notifications/notifications.service";
import { findDirectReportIds, findById as findUserById } from "../users/users.repository";
import { getAssignedAgentId } from "../leads/leads.repository";
import { AccessTokenPayload } from "../../utils/tokens";

export const followupsRouter = Router();

// Same three-way split as leads.service.ts's scopeForCaller — duplicated
// rather than imported since that function isn't exported (see call-log's
// and call-attempts' own copies of this same pattern for precedent).
async function scopedAssigneeIdsForCaller(caller: AccessTokenPayload): Promise<string[] | undefined> {
  if (caller.role !== "AGENT") return undefined;
  if (caller.roleType === "MEMBER") return [caller.sub];
  if (caller.roleType === "MANAGER") {
    const reportIds = await findDirectReportIds(caller.sub);
    return [caller.sub, ...reportIds];
  }
  return undefined;
}

followupsRouter.use(requireAuth);

const SELECT = `
  SELECT fc.id, fc.scheduled_at, fc.status, fc.lead_id, fc.lead_name, fc.phone, fc.call_type,
         fc.assigned_to_id, u.first_name || COALESCE(' ' || u.last_name, '') AS assigned_to_name,
         fc.due_notified_at, fc.violation_notified_at
  FROM followup_calls fc
  JOIN users u ON u.id = fc.assigned_to_id
`;

// followup_calls is another zero-cap, ever-growing table (one row per
// scheduled callback/meeting/site visit, never pruned) — page/pageSize give
// real LIMIT/OFFSET instead of the previous unbounded SELECT. Default
// pageSize of 10 matches the sales dashboard's own pagination convention
// (SalesPendingTasksTable/TeamTasksTable/NotificationBell all page 10 at a
// time); max 500 is the same bridge-pattern cap leads.schema.ts uses so
// apiListFollowups()'s page-loop (which reconstructs the full array for
// AppContext's bulk load — still needed by TeamTasksTable/
// SalesPendingTasksTable's cross-referenced, time-bucketed task queue and by
// home/page.tsx's pendingFollowUps count) stays a reasonable handful of
// round trips. `status` is an optional filter for any future dedicated
// per-status followups list (e.g. a pure "Upcoming" or "Missed" table) —
// the existing dashboard components all derive a merged leads+follow-ups
// view via buildSalesPendingTasks that needs the *whole* dataset to compute
// its time-based buckets correctly, so none of them can safely be switched
// to a single filtered server page today; this keeps that door open without
// changing any of their behavior.
const uuidToArray = z.union([z.string().uuid(), z.array(z.string().uuid())])
  .optional()
  .transform(v => v === undefined ? undefined : (Array.isArray(v) ? v : [v]));

const listFollowupsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(500).default(10),
  status: z.union([z.enum(["MISSED", "UPCOMING", "COMPLETED"]), z.array(z.enum(["MISSED", "UPCOMING", "COMPLETED"]))])
    .optional()
    .transform(v => v === undefined ? undefined : (Array.isArray(v) ? v : [v])),
  // Lets a drill-down table fetch "the follow-ups for just these leads"
  // (e.g. for a next-call-date column) instead of paging through every
  // follow-up in the company — same uuidToArray pattern leads.schema.ts's
  // assignedAgentId already uses.
  leadId: uuidToArray,
  // Lets a report fetch "just this one agent's follow-ups" (e.g. the
  // Missed Follow-ups drill-down) — ANDed with scopedAssigneeIdsForCaller
  // below, same AND-only boundary as every other scoped endpoint, so this
  // can never widen what the caller is actually allowed to see.
  assignedToId: uuidToArray,
  // Same plain-date-string bounds getMissedFollowupCount already uses on
  // this same column (no BUSINESS_TIMEZONE conversion, unlike leads'
  // created_at) — kept identical on purpose, so a row-level fetch here can
  // never disagree with that count for the same date range.
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD").optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD").optional()
});

// Mirrors leads.service.ts's scopeForCaller rule: a Member only ever sees
// their own follow-ups; a Manager sees self + their direct reports';
// Finance/Admin see all. Previously only the Member case was handled — a
// Manager fell through the gap and saw every follow-up call for every
// agent in the company, same bug class as the unscoped Member case this
// was originally written to fix.
followupsRouter.get(
  "/",
  validate({ query: listFollowupsQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize, status, leadId, assignedToId, dateFrom, dateTo } = req.query as unknown as {
      page: number; pageSize: number; status?: ("MISSED" | "UPCOMING" | "COMPLETED")[]; leadId?: string[];
      assignedToId?: string[]; dateFrom?: string; dateTo?: string;
    };
    const scopedAssigneeIds = await scopedAssigneeIdsForCaller(req.user!);

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (scopedAssigneeIds) {
      params.push(scopedAssigneeIds);
      conditions.push(`fc.assigned_to_id = ANY($${params.length}::uuid[])`);
    }
    if (leadId && leadId.length > 0) {
      params.push(leadId);
      conditions.push(`fc.lead_id = ANY($${params.length}::uuid[])`);
    }
    if (assignedToId && assignedToId.length > 0) {
      params.push(assignedToId);
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
    if (status && status.length > 0) {
      if (status.length === 1) {
        params.push(status[0]);
        conditions.push(`fc.status = $${params.length}`);
      } else {
        params.push(status);
        conditions.push(`fc.status = ANY($${params.length}::text[])`);
      }
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await query<{ count: string }>(`SELECT count(*) FROM followup_calls fc ${whereClause}`, params);
    const totalCount = Number(countResult.rows[0]?.count ?? 0);

    const offset = (page - 1) * pageSize;
    const dataParams = [...params, pageSize, offset];
    const { rows } = await query(
      `${SELECT} ${whereClause} ORDER BY fc.scheduled_at LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    sendPaginated(res, rows, { page, pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) });
  })
);

const createFollowupSchema = z.object({
  scheduledAt: z.string().min(1),
  leadId: z.string().uuid().optional(),
  leadName: z.string().min(1),
  phone: z.string().optional(),
  callType: z.enum(["CALLBACK", "MEETING", "SITE_VISIT"]),
  assignedToId: z.string().uuid()
});

// Same three-way ownership rule as leads.service.ts's
// assertStatusChangeAllowed — duplicated rather than imported (that one
// isn't exported; see this file's own scopedAssigneeIdsForCaller above for
// the same precedent). Previously missing entirely: any authenticated role
// could create a follow-up against ANY lead_id, which became a real
// integrity gap once RNR -> Dead Lead's attempt-history check
// (leadStatusTransitions.ts) started reading these rows — someone with no
// relationship to a lead could pad or interfere with another agent's
// attempt history for it. Only runs when leadId is actually provided;
// assignedToId (who the reminder lands on) is intentionally left
// unrestricted here, same as before — a Manager/Admin scheduling a
// reminder FOR a teammate on a lead they're allowed to touch is the normal
// case, not something this fix is about.
async function assertCanScheduleFor(caller: AccessTokenPayload, leadId: string): Promise<void> {
  if (caller.role === "ADMIN") return;
  const assignedAgentId = await getAssignedAgentId(leadId);
  if (!assignedAgentId) return; // bad/missing leadId — let the FK violation below report it, not this check
  if (assignedAgentId === caller.sub) return;
  const owner = await findUserById(assignedAgentId);
  if (owner?.manager_id === caller.sub) return;
  throw ApiError.forbidden("Only the lead's owner, their manager or an admin can schedule a follow-up for it.");
}

// Every authenticated role may schedule a follow-up for their own or a
// teammate's lead — matches how the reminder picker in LeadDetailDrawer
// works today (no admin gate on scheduling a reminder). "Teammate's lead"
// is enforced by assertCanScheduleFor above, not left open to any lead.
followupsRouter.post(
  "/",
  validate({ body: createFollowupSchema }),
  asyncHandler(async (req, res) => {
    if (req.body.leadId) await assertCanScheduleFor(req.user!, req.body.leadId);
    let insertedId: string;
    try {
      // Rescheduling a lead (RNR -> Call Back -> Followup, etc.) creates a
      // new row here every time rather than editing the old one — without
      // this, every prior reminder stays "Upcoming"/"Missed" forever, so
      // Next Call Date columns (nextFollowupFor, lib/followups.ts) keep
      // showing a stale overdue date instead of the one just set, since
      // overdue rows are always preferred over upcoming ones there. Mark
      // the lead's older pending reminders done before inserting the new
      // one, so only the current schedule stays active for it.
      if (req.body.leadId) {
        await pool.query(
          `UPDATE followup_calls SET status = 'COMPLETED' WHERE lead_id = $1 AND status <> 'COMPLETED'`,
          [req.body.leadId]
        );
        await deleteLeadActivityNotifications(req.body.leadId, ["REMINDER"]);
      }
      const { rows } = await pool.query(
        `INSERT INTO followup_calls (scheduled_at, lead_id, lead_name, phone, call_type, assigned_to_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [req.body.scheduledAt, req.body.leadId ?? null, req.body.leadName, req.body.phone ?? null, req.body.callType, req.body.assignedToId]
      );
      insertedId = rows[0].id;
    } catch (err) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23503") {
        throw ApiError.badRequest("That lead or assignee doesn't exist.");
      }
      throw err;
    }
    const { rows: created } = await query(`${SELECT} WHERE fc.id = $1`, [insertedId]);
    sendOk(res, created[0], 201);
  })
);

const idParamSchema = z.object({ id: z.string().uuid() });
const updateStatusSchema = z.object({ status: z.enum(["MISSED", "UPCOMING", "COMPLETED"]) });

followupsRouter.patch(
  "/:id/status",
  validate({ params: idParamSchema, body: updateStatusSchema }),
  asyncHandler(async (req, res) => {
    // Only the assigned agent, that agent's manager, or an admin may change a
    // follow-up's status — completing one also clears its reminders, so it
    // must not be possible on someone else's follow-ups.
    const { rows: found } = await pool.query<{ assigned_to_id: string; assignee_manager_id: string | null }>(
      `SELECT fc.assigned_to_id, u.manager_id AS assignee_manager_id
       FROM followup_calls fc JOIN users u ON u.id = fc.assigned_to_id
       WHERE fc.id = $1`,
      [req.params.id]
    );
    if (found.length === 0) throw ApiError.notFound("Follow-up not found");
    const caller = req.user!;
    const allowed =
      caller.role === "ADMIN" ||
      found[0].assigned_to_id === caller.sub ||
      found[0].assignee_manager_id === caller.sub;
    if (!allowed) throw ApiError.forbidden();

    const { rows } = await pool.query<{ id: string; lead_id: string | null }>(
      `UPDATE followup_calls SET status = $1 WHERE id = $2 RETURNING id, lead_id`,
      [req.body.status, req.params.id]
    );
    if (rows.length === 0) throw ApiError.notFound("Follow-up not found");
    // A completed follow-up no longer needs its "Reminder Due Now" alerts.
    // Notifications only carry the lead, so this clears every reminder for that lead.
    if (req.body.status === "COMPLETED" && rows[0].lead_id) {
      await deleteLeadActivityNotifications(rows[0].lead_id, ["REMINDER"]);
    }
    const { rows: updated } = await query(`${SELECT} WHERE fc.id = $1`, [req.params.id]);
    sendOk(res, updated[0]);
  })
);
