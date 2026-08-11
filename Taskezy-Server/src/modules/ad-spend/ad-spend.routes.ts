import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { query } from "../../db/pool";

export const adSpendRouter = Router();

adSpendRouter.use(requireAuth);

adSpendRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT a.id, a.platform, a.account_name, a.property_id, p.name AS property_name,
              a.spend_date, a.spend, a.leads_generated, COALESCE(mc.status, gc.status) AS campaign_status
       FROM ad_spend_records a
       LEFT JOIN properties p ON p.id = a.property_id
       LEFT JOIN meta_campaigns mc ON mc.id = a.meta_campaign_id
       LEFT JOIN google_ads_campaigns gc ON gc.id = a.google_campaign_id
       ORDER BY a.spend_date`
    );
    sendOk(res, rows);
  })
);
