import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { query } from "../../db/pool";

export const followupsRouter = Router();

followupsRouter.use(requireAuth);

followupsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT fc.id, fc.scheduled_at, fc.status, fc.lead_id, fc.lead_name, fc.phone, fc.call_type,
              fc.assigned_to_id, u.first_name || COALESCE(' ' || u.last_name, '') AS assigned_to_name
       FROM followup_calls fc
       JOIN users u ON u.id = fc.assigned_to_id
       ORDER BY fc.scheduled_at`
    );
    sendOk(res, rows);
  })
);
