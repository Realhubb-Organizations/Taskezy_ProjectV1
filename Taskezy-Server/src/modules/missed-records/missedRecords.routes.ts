import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendPaginated } from "../../utils/apiResponse";
import { query } from "../../db/pool";
import { BUSINESS_TIMEZONE } from "../../utils/businessDate";
import { scopeForCaller } from "../leads/leads.service";

// The frozen missed-lead records (migration 053) — what a missed-lead
// notification opens: each lead exactly as it was when it was missed.
// Read-only; rows are only ever added by the schedulers.

export const missedRecordsRouter = Router();
missedRecordsRouter.use(requireAuth);

const uuidToArray = z.union([z.string().uuid(), z.array(z.string().uuid())])
  .optional()
  .transform(v => v === undefined ? undefined : (Array.isArray(v) ? v : [v]));

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(10),
  recordIds: uuidToArray,
  leadIds: uuidToArray,
  type: z.enum(["LEAD", "CALL"]).optional(),
  // Business day (YYYY-MM-DD) the miss happened on.
  missedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "missedOn must be YYYY-MM-DD").optional(),
  missedFrom: z.string().datetime({ offset: true }).optional(),
  missedUntil: z.string().datetime({ offset: true }).optional(),
  agentId: z.string().uuid().optional()
});

missedRecordsRouter.get(
  "/",
  validate({ query: listSchema }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listSchema>;
    const conditions: string[] = [];
    const params: unknown[] = [];
    const add = (sql: (n: number) => string, value: unknown) => { params.push(value); conditions.push(sql(params.length)); };

    // Same people a caller can see leads for: a Member their own misses, a
    // Manager their team's, an Admin everyone's.
    const scope = await scopeForCaller(req.user!);
    if (scope) add(n => `r.agent_id = ANY($${n}::uuid[])`, scope);

    if (q.recordIds?.length) add(n => `r.id = ANY($${n}::uuid[])`, q.recordIds);
    if (q.leadIds?.length) add(n => `r.lead_id = ANY($${n}::uuid[])`, q.leadIds);
    if (q.type) add(n => `r.miss_type = $${n}`, q.type);
    if (q.agentId) add(n => `r.agent_id = $${n}`, q.agentId);
    if (q.missedOn) {
      params.push(q.missedOn, BUSINESS_TIMEZONE);
      conditions.push(`(r.missed_at AT TIME ZONE $${params.length})::date = $${params.length - 1}::date`);
    }
    if (q.missedFrom) add(n => `r.missed_at >= $${n}::timestamptz`, q.missedFrom);
    if (q.missedUntil) add(n => `r.missed_at <= $${n}::timestamptz`, q.missedUntil);

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows: countRows } = await query<{ count: string }>(`SELECT count(*) FROM missed_lead_records r ${where}`, params);
    const totalCount = Number(countRows[0]?.count ?? 0);

    const offset = (q.page - 1) * q.pageSize;
    const { rows } = await query(
      `SELECT r.id, r.miss_type, r.missed_at, r.lead_id, r.lead_name, r.lead_phone, r.lead_email,
              r.status_code, r.call_status, r.call_sub_status, r.next_call_at, r.call_type,
              r.agent_id, r.agent_name, r.manager_name, r.property_name, r.campaign, r.source, r.sub_source,
              r.feedback, r.notes, r.lead_created_at, r.assigned_at, r.is_backfilled
       FROM missed_lead_records r
       ${where}
       ORDER BY r.missed_at DESC, r.id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, q.pageSize, offset]
    );
    sendPaginated(res, rows, { page: q.page, pageSize: q.pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / q.pageSize)) });
  })
);
