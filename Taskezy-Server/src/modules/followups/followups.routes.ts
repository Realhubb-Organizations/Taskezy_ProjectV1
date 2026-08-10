import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { ApiError } from "../../utils/ApiError";
import { pool, query } from "../../db/pool";

export const followupsRouter = Router();

followupsRouter.use(requireAuth);

const SELECT = `
  SELECT fc.id, fc.scheduled_at, fc.status, fc.lead_id, fc.lead_name, fc.phone, fc.call_type,
         fc.assigned_to_id, u.first_name || COALESCE(' ' || u.last_name, '') AS assigned_to_name
  FROM followup_calls fc
  JOIN users u ON u.id = fc.assigned_to_id
`;

// Mirrors leads.service.ts's scopeForCaller rule: a SALES department
// "Member" only ever sees their own follow-ups (lead names/phone numbers
// included); everyone else (Managers, Finance, Admin) sees all of them.
// Previously completely unscoped — any authenticated role, including a
// Member, could list every follow-up call for every agent in the company.
followupsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const isSalesMember = req.user!.role === "AGENT" && req.user!.roleType === "MEMBER";
    if (isSalesMember) {
      const { rows } = await query(`${SELECT} WHERE fc.assigned_to_id = $1 ORDER BY fc.scheduled_at`, [req.user!.sub]);
      sendOk(res, rows);
      return;
    }
    const { rows } = await query(`${SELECT} ORDER BY fc.scheduled_at`);
    sendOk(res, rows);
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

// Every authenticated role may schedule a follow-up for their own or a
// teammate's lead — matches how the reminder picker in LeadDetailDrawer
// works today (no admin gate on scheduling a reminder).
followupsRouter.post(
  "/",
  validate({ body: createFollowupSchema }),
  asyncHandler(async (req, res) => {
    let insertedId: string;
    try {
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
    const { rows } = await pool.query(`UPDATE followup_calls SET status = $1 WHERE id = $2 RETURNING id`, [req.body.status, req.params.id]);
    if (rows.length === 0) throw ApiError.notFound("Follow-up not found");
    const { rows: updated } = await query(`${SELECT} WHERE fc.id = $1`, [req.params.id]);
    sendOk(res, updated[0]);
  })
);
