import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { query } from "../../db/pool";
import { findDirectReportIds } from "../users/users.repository";
import { AccessTokenPayload } from "../../utils/tokens";

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

// Same three-way split as leads.service.ts's scopeForCaller/
// followups.routes.ts's scopedAssigneeIdsForCaller — duplicated rather
// than imported, same precedent as those two (not exported from either
// module). undefined = unrestricted (Admin/Finance).
async function scopedUserIdsForCaller(caller: AccessTokenPayload): Promise<string[] | undefined> {
  if (caller.role !== "AGENT") return undefined;
  if (caller.roleType === "MEMBER") return [caller.sub];
  if (caller.roleType === "MANAGER") {
    const reportIds = await findDirectReportIds(caller.sub);
    return [caller.sub, ...reportIds];
  }
  return undefined;
}

// Statuses that mean "the agent still has to act on this" (no scheduled
// follow-up needed to be a task) — mirrors frontend/src/lib/
// salesPendingTasks.ts's ACTIONABLE_LEAD_STATUSES/NEW_LEAD_STATUSES (DB
// codes, not the frontend's display labels). Must stay in lockstep.
const ACTIONABLE_LEAD_CODES = ["NEW_LEAD", "RNR", "CALL_BACK", "FOLLOWUP"];
const NEW_LEAD_CODE = "NEW_LEAD";

interface OpenFollowupRow {
  id: string;
  lead_id: string | null;
  scheduled_at: string;
  status: "MISSED" | "UPCOMING" | "COMPLETED";
  lead_name: string;
  call_phone: string | null;
  call_type: string;
  assigned_to_name: string;
  lead_full_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  lead_status_label: string | null;
  latest_log_message: string | null;
  latest_log_at: string | null;
  is_data_calling: boolean | null;
}

interface ActionableLeadRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status_code: string;
  status_label: string;
  assigned_at: string | null;
  created_at: string;
  assigned_to_name: string;
  latest_log_message: string | null;
  latest_log_at: string | null;
  is_data_calling: boolean | null;
}

export interface PendingTaskRow {
  id: string;
  leadId?: string;
  dueAt: string | null;
  // True only for a follow-up call the scheduler has already flipped to
  // MISSED — the frontend's bucketing must honor this regardless of what
  // bucketFor(dueAt, now) would otherwise compute, same as
  // buildSalesPendingTasks did before this moved server-side.
  forceMissed: boolean;
  name: string;
  phone: string;
  email: string;
  status: string;
  feedback: string;
  taskType: string;
  assignedTo: string;
  /** The lead is a Data Calling lead (source "Bulk Upload") — lets the per-member task page split Leads / Data Calling. */
  isDataCalling: boolean;
}

/**
 * Backend counterpart to frontend/src/lib/salesPendingTasks.ts's
 * buildSalesPendingTasks — same two-source merge (open follow-ups, plus
 * actionable-status leads with no open follow-up), ported here nearly
 * verbatim rather than re-derived, so it can't silently drift from the
 * already-proven client logic. The one piece deliberately left client-side
 * is bucketing (missed/pending/upcoming): that's recomputed live every 30s
 * against the current time so the UI reflects an SLA transition instantly,
 * and redoing that server-side would mean a 30s poll loop for no benefit —
 * dueAt (and forceMissed, for an already-scheduler-flagged MISSED call) is
 * everything the client needs to keep doing that itself.
 */
tasksRouter.get(
  "/pending",
  asyncHandler(async (req, res) => {
    const scopedUserIds = await scopedUserIdsForCaller(req.user!);

    const followupParams: unknown[] = [];
    let followupScopeClause = "";
    if (scopedUserIds) {
      followupParams.push(scopedUserIds);
      followupScopeClause = `AND fc.assigned_to_id = ANY($${followupParams.length}::uuid[])`;
    }
    const { rows: followupRows } = await query<OpenFollowupRow>(
      `SELECT fc.id, fc.lead_id, fc.scheduled_at, fc.status, fc.lead_name, fc.phone AS call_phone, fc.call_type,
              u.first_name || COALESCE(' ' || u.last_name, '') AS assigned_to_name,
              l.name AS lead_full_name, l.phone AS lead_phone, l.email AS lead_email, ls.label AS lead_status_label,
              ll.message AS latest_log_message, ll.created_at AS latest_log_at,
              l.source = 'Bulk Upload' AS is_data_calling
       FROM followup_calls fc
       JOIN users u ON u.id = fc.assigned_to_id
       LEFT JOIN leads l ON l.id = fc.lead_id
       LEFT JOIN lead_statuses ls ON ls.code = l.status_code
       LEFT JOIN LATERAL (
         SELECT message, created_at FROM lead_logs WHERE lead_id = fc.lead_id ORDER BY created_at DESC LIMIT 1
       ) ll ON fc.lead_id IS NOT NULL
       WHERE fc.status != 'COMPLETED' ${followupScopeClause}`,
      followupParams
    );

    const leadParams: unknown[] = [ACTIONABLE_LEAD_CODES];
    let leadScopeClause = "";
    if (scopedUserIds) {
      leadParams.push(scopedUserIds);
      leadScopeClause = `AND l.assigned_agent_id = ANY($${leadParams.length}::uuid[])`;
    }
    const { rows: leadRows } = await query<ActionableLeadRow>(
      `SELECT l.id, l.name, l.phone, l.email, l.status_code, ls.label AS status_label,
              l.assigned_at, l.created_at,
              u.first_name || COALESCE(' ' || u.last_name, '') AS assigned_to_name,
              ll.message AS latest_log_message, ll.created_at AS latest_log_at,
              l.source = 'Bulk Upload' AS is_data_calling
       FROM leads l
       JOIN lead_statuses ls ON ls.code = l.status_code
       JOIN users u ON u.id = l.assigned_agent_id
       LEFT JOIN LATERAL (
         SELECT message, created_at FROM lead_logs WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1
       ) ll ON true
       WHERE l.status_code = ANY($1::text[])
         -- A lead is only "already covered" by an open follow-up if that
         -- follow-up would actually become a task below (same acted-since
         -- rule as the follow-up query) — one the agent has already acted
         -- on since it fell due is excluded from the result entirely
         -- (per-call loop below), so it must NOT also suppress this lead's
         -- own current-status task, or the lead would silently vanish from
         -- the queue instead of correctly falling back to this branch.
         AND NOT EXISTS (
           SELECT 1 FROM followup_calls fc2
           WHERE fc2.lead_id = l.id AND fc2.status != 'COMPLETED'
             AND NOT (fc2.scheduled_at <= now() AND ll.created_at IS NOT NULL AND ll.created_at >= fc2.scheduled_at)
         )
         ${leadScopeClause}`,
      leadParams
    );

    const tasks: PendingTaskRow[] = [];

    for (const r of followupRows) {
      const dueAt = r.scheduled_at;
      // Any lead activity logged at/after the task fell due counts as the
      // agent having acted on it — the latest log's own timestamp is
      // enough to decide this (if the single most recent log is before
      // dueAt, no log can be at/after it either).
      const actedSince = !!(r.lead_id && r.latest_log_at && dueAt && new Date(r.latest_log_at).getTime() >= new Date(dueAt).getTime());
      if (dueAt && new Date(dueAt).getTime() <= Date.now() && actedSince) continue;

      tasks.push({
        id: `fc-${r.id}`,
        leadId: r.lead_id ?? undefined,
        dueAt,
        forceMissed: r.status === "MISSED",
        name: r.lead_full_name || r.lead_name,
        phone: r.lead_phone || r.call_phone || "",
        email: r.lead_email || "",
        status: r.lead_status_label || r.call_type,
        feedback: r.latest_log_message || "No feedback yet",
        taskType: r.call_type,
        assignedTo: r.assigned_to_name || "",
        isDataCalling: r.is_data_calling === true
      });
    }

    for (const r of leadRows) {
      const dueAt = r.status_code === NEW_LEAD_CODE ? (r.assigned_at || r.created_at) : (r.latest_log_at || r.created_at);
      tasks.push({
        id: `lead-${r.id}`,
        leadId: r.id,
        dueAt,
        forceMissed: false,
        name: r.name,
        phone: r.phone,
        email: r.email || "",
        status: r.status_label,
        feedback: r.latest_log_message || "No feedback yet",
        taskType: r.status_label,
        assignedTo: r.assigned_to_name || "",
        isDataCalling: r.is_data_calling === true
      });
    }

    sendOk(res, tasks);
  })
);
