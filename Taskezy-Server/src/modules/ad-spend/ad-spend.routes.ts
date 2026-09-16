import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { query } from "../../db/pool";
import { listAdLevelSpend as listMetaAdLevelSpend } from "../meta/meta.repository";
import { listAdLevelSpend as listGoogleAdLevelSpend } from "../google-ads/google-ads.repository";
import { triggerMetaAdSpendSyncNow } from "../../jobs/metaAdSpendSync";
import { triggerGoogleAdsSpendSyncNow } from "../../jobs/googleAdsSpendSync";

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

/**
 * Real per-ad, per-day spend/leads with each row's real ad set/ad/creative
 * name attached — un-aggregated (one row per ad per day), same grain as
 * "/" above, for Campaign Deep Dive. Combines both platforms (each row
 * tagged platform: "META" | "GOOGLE") the same way "/" already unifies
 * Meta + Google campaign-level spend. The frontend applies its own Date
 * Range scoping to this the same way it already does for "/", rather than
 * this route pre-aggregating a range server-side.
 */
adSpendRouter.get(
  "/ad-level",
  asyncHandler(async (_req, res) => {
    const [metaRows, googleRows] = await Promise.all([listMetaAdLevelSpend(), listGoogleAdLevelSpend()]);
    sendOk(res, [...metaRows, ...googleRows]);
  })
);

/**
 * Manually wakes both platforms' ad-level sync jobs early instead of
 * waiting for their 6h interval — Campaign Deep Dive's Sync button. Fires
 * the same jobs with the same real rate-limit pacing/backoff already in
 * place; it starts them sooner, it does not bypass Meta's or Google's
 * actual rate limits, so a run can still take a while to fully land.
 * Returns immediately — { started: false } for a platform means a sync
 * for it was already in progress, not that this request failed.
 */
adSpendRouter.post(
  "/sync",
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const meta = triggerMetaAdSpendSyncNow();
    const google = triggerGoogleAdsSpendSyncNow();
    sendOk(res, { meta, google });
  })
);
