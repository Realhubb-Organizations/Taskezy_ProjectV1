import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendOk } from "../../utils/apiResponse";
import { query } from "../../db/pool";
import { BUSINESS_TIMEZONE } from "../../utils/businessDate";
import { listAdLevelSpend as listMetaAdLevelSpend } from "../meta/meta.repository";
import { listAdLevelSpend as listGoogleAdLevelSpend } from "../google-ads/google-ads.repository";
import { triggerMetaAdSpendSyncNow } from "../../jobs/metaAdSpendSync";
import { triggerGoogleAdsSpendSyncNow } from "../../jobs/googleAdsSpendSync";

export const adSpendRouter = Router();

adSpendRouter.use(requireAuth);
// Campaigns is admin-only (see frontend/src/app/(app)/layout.tsx's
// checkUserAccess — Sales Member/Manager are deliberately excluded there).
// That was UI-only gating; this enforces the same boundary server-side so
// the data can't be reached by calling the API directly.
adSpendRouter.use(requireRole("ADMIN"));

adSpendRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT a.id, a.platform, a.account_name, a.property_id, p.name AS property_name,
              a.spend_date, a.spend, a.leads_generated, a.impressions, a.clicks, COALESCE(mc.status, gc.status) AS campaign_status
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

const campaignLeadStatsQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD").optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD").optional()
});

// Mirrors frontend/src/lib/campaignBuilder.ts's QUALIFIED_LEAD_STATUSES/
// UNQUALIFIED_LEAD_STATUSES/SITE_VISIT_LEAD_STATUSES (DB codes, not the
// frontend's display labels) — must stay in lockstep with that file.
const QUALIFIED_CODES = ["CALL_BACK", "FOLLOWUP", "EOI", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "BOOKED"];
const UNQUALIFIED_CODES = ["DEAD_LEAD", "RNR"];
const SITE_VISIT_CODES = ["SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE"];

/**
 * Backend counterpart to campaignBuilder.ts's buildCampaignsList — just the
 * lead-derived numbers (totalLeads/qualifiedLeads/unqualifiedLeads/
 * siteVisit), keyed by campaign name, so the Campaigns page can stop
 * needing the full bulk-loaded leads array for these. Spend/impressions/
 * clicks/property/platform/status stay client-side, computed from
 * adSpendRecords exactly as before — that was never the bulk-array problem
 * this is solving.
 *
 * "Known campaigns" = every account_name with at least one ad_spend_records
 * row in [dateFrom, dateTo] (or ever, if both are omitted — "All Time").
 * totalLeads is the same "per real day, max(platform-reported,
 * real-synced-count), then sum" rule campaignBuilder.ts uses, computed here
 * as a day-by-day join between ad_spend_records and leads (matched by
 * LOWER(COALESCE(campaign, source)) = LOWER(account_name), same
 * case-insensitive join the frontend always used) so a day with a synced
 * lead but no ad-spend row that day (or vice versa) is still counted, not
 * silently dropped by whichever side happens to be missing it.
 * Qualified/unqualified/siteVisit are an unfiltered-by-date pipeline
 * snapshot across every lead ever matched to a known campaign — same as
 * campaignBuilder.ts's own campaignLeads-based counts, which never applied
 * the date filter either (a lead qualified today still counts even if it
 * arrived last week).
 */
adSpendRouter.get(
  "/campaign-lead-stats",
  validate({ query: campaignLeadStatsQuerySchema }),
  asyncHandler(async (req, res) => {
    const { dateFrom, dateTo } = req.query as unknown as { dateFrom?: string; dateTo?: string };
    const { rows } = await query<{
      campaign_name: string;
      total_leads: number;
      qualified: number;
      unqualified: number;
      site_visits: number;
    }>(
      `WITH platform_daily AS (
         SELECT a.account_name AS campaign_name, a.spend_date AS day, SUM(a.leads_generated) AS platform_leads
         FROM ad_spend_records a
         WHERE ($1::date IS NULL OR a.spend_date >= $1::date)
           AND ($2::date IS NULL OR a.spend_date <= $2::date)
         GROUP BY a.account_name, a.spend_date
       ),
       known_campaigns AS (
         SELECT DISTINCT campaign_name FROM platform_daily
       ),
       synced_daily AS (
         SELECT k.campaign_name, (l.created_at AT TIME ZONE $3)::date AS day, count(*) AS synced_leads
         FROM leads l
         JOIN known_campaigns k ON LOWER(COALESCE(l.campaign, l.source)) = LOWER(k.campaign_name)
         WHERE ($1::date IS NULL OR (l.created_at AT TIME ZONE $3)::date >= $1::date)
           AND ($2::date IS NULL OR (l.created_at AT TIME ZONE $3)::date <= $2::date)
         GROUP BY k.campaign_name, (l.created_at AT TIME ZONE $3)::date
       ),
       daily_union AS (
         SELECT p.campaign_name, p.day, GREATEST(p.platform_leads, COALESCE(s.synced_leads, 0)) AS day_total
         FROM platform_daily p
         LEFT JOIN synced_daily s ON s.campaign_name = p.campaign_name AND s.day = p.day
         UNION ALL
         SELECT s.campaign_name, s.day, s.synced_leads AS day_total
         FROM synced_daily s
         WHERE NOT EXISTS (
           SELECT 1 FROM platform_daily p WHERE p.campaign_name = s.campaign_name AND p.day = s.day
         )
       ),
       totals AS (
         SELECT campaign_name, SUM(day_total) AS total_leads FROM daily_union GROUP BY campaign_name
       ),
       snapshot AS (
         SELECT k.campaign_name,
                count(*) FILTER (WHERE l.status_code = ANY($4::text[])) AS qualified,
                count(*) FILTER (WHERE l.status_code = ANY($5::text[])) AS unqualified,
                count(*) FILTER (WHERE l.status_code = ANY($6::text[])) AS site_visits
         FROM leads l
         JOIN known_campaigns k ON LOWER(COALESCE(l.campaign, l.source)) = LOWER(k.campaign_name)
         GROUP BY k.campaign_name
       )
       SELECT k.campaign_name,
              COALESCE(t.total_leads, 0)::int AS total_leads,
              COALESCE(sn.qualified, 0)::int AS qualified,
              COALESCE(sn.unqualified, 0)::int AS unqualified,
              COALESCE(sn.site_visits, 0)::int AS site_visits
       FROM known_campaigns k
       LEFT JOIN totals t ON t.campaign_name = k.campaign_name
       LEFT JOIN snapshot sn ON sn.campaign_name = k.campaign_name`,
      [dateFrom ?? null, dateTo ?? null, BUSINESS_TIMEZONE, QUALIFIED_CODES, UNQUALIFIED_CODES, SITE_VISIT_CODES]
    );
    sendOk(res, rows.map(r => ({
      campaign: r.campaign_name,
      totalLeads: r.total_leads,
      qualifiedLeads: r.qualified,
      unqualifiedLeads: r.unqualified,
      siteVisit: r.site_visits
    })));
  })
);

// Mirrors frontend/src/lib/reportMetrics.ts's BUYER_STATUSES/
// NON_BUYER_STATUSES/VISIT_OR_MEETING_STATUSES (DB codes, not display
// labels) — BUYER_CODES is the same set leads.service.ts's
// REPORT_QUALIFIED_CODES already uses for the Agent/Manager reports;
// NON_BUYER_CODES is its own, wider set (also includes Low Budget and
// Cancelled, unlike campaign-lead-stats' UNQUALIFIED_CODES above). Must
// stay in lockstep with reportMetrics.ts if either list ever changes.
const BUYER_CODES = ["CALL_BACK", "FOLLOWUP", "EOI", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "BOOKED"];
const NON_BUYER_CODES = ["DEAD_LEAD", "RNR", "LOW_BUDGET", "CANCELLED"];
const VISIT_CODES = ["SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE"];

const marketingReportStatsQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be YYYY-MM-DD").optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be YYYY-MM-DD").optional()
});

/**
 * Backend counterpart to MarketingReports.tsx — the "Overall" summary
 * cards (Lead Quality, Visit Conversion, Booking ROI) plus the "By Ad
 * Account" and "Property-wise" tables' lead-derived numbers (CPL/spend
 * stay client-side from the already-fetched adSpendRecords, same split
 * as Campaigns' own campaign-lead-stats above). Campaign matching is the
 * exact-string rule reportMetrics.ts's computeCampaignAttributedSpend
 * always used (l.campaign = ad_spend's account_name, case-sensitive, no
 * COALESCE-to-source fallback) — deliberately stricter than campaign-
 * lead-stats' LOWER(COALESCE(...)) join, matching what this page's own
 * accountRows always did. byCampaign/byProperty only return rows with at
 * least one matching lead; the frontend already drives the full account/
 * property list from adSpendRecords/properties and looks these up,
 * zero-defaulting whatever isn't present here.
 */
adSpendRouter.get(
  "/marketing-report-stats",
  validate({ query: marketingReportStatsQuerySchema }),
  asyncHandler(async (req, res) => {
    const { dateFrom, dateTo } = req.query as unknown as { dateFrom?: string; dateTo?: string };
    const dateBounds = `($1::date IS NULL OR (l.created_at AT TIME ZONE $3)::date >= $1::date)
         AND ($2::date IS NULL OR (l.created_at AT TIME ZONE $3)::date <= $2::date)`;
    const baseParams = [dateFrom ?? null, dateTo ?? null, BUSINESS_TIMEZONE];

    const [overallResult, byCampaignResult, byPropertyResult] = await Promise.all([
      query<{
        buyer_count: string; non_buyer_count: string; converted_count: string;
        total_count: string; booking_value: string; booking_count: string;
      }>(
        `SELECT count(*) FILTER (WHERE l.status_code = ANY($4::text[])) AS buyer_count,
                count(*) FILTER (WHERE l.status_code = ANY($5::text[])) AS non_buyer_count,
                count(*) FILTER (WHERE l.status_code = ANY($6::text[])) AS converted_count,
                count(*) AS total_count,
                COALESCE(SUM(l.deal_value) FILTER (WHERE l.status_code = 'BOOKED'), 0) AS booking_value,
                count(*) FILTER (WHERE l.status_code = 'BOOKED') AS booking_count
         FROM leads l
         WHERE ${dateBounds}`,
        [...baseParams, BUYER_CODES, NON_BUYER_CODES, VISIT_CODES]
      ),
      query<{ campaign: string; buyer_count: string; non_buyer_count: string; booking_value: string }>(
        `SELECT l.campaign,
                count(*) FILTER (WHERE l.status_code = ANY($4::text[])) AS buyer_count,
                count(*) FILTER (WHERE l.status_code = ANY($5::text[])) AS non_buyer_count,
                COALESCE(SUM(l.deal_value) FILTER (WHERE l.status_code = 'BOOKED'), 0) AS booking_value
         FROM leads l
         WHERE l.campaign IS NOT NULL AND ${dateBounds}
         GROUP BY l.campaign`,
        [...baseParams, BUYER_CODES, NON_BUYER_CODES]
      ),
      query<{ property_name: string; leads_count: string; booking_value: string; booking_count: string }>(
        `SELECT p.name AS property_name,
                count(*) AS leads_count,
                COALESCE(SUM(l.deal_value) FILTER (WHERE l.status_code = 'BOOKED'), 0) AS booking_value,
                count(*) FILTER (WHERE l.status_code = 'BOOKED') AS booking_count
         FROM leads l
         JOIN properties p ON p.id = l.property_id
         WHERE ${dateBounds}
         GROUP BY p.name`,
        baseParams
      )
    ]);

    const o = overallResult.rows[0];
    sendOk(res, {
      overall: {
        buyerCount: Number(o?.buyer_count ?? 0),
        nonBuyerCount: Number(o?.non_buyer_count ?? 0),
        convertedCount: Number(o?.converted_count ?? 0),
        totalCount: Number(o?.total_count ?? 0),
        bookingValue: Number(o?.booking_value ?? 0),
        bookingCount: Number(o?.booking_count ?? 0)
      },
      byCampaign: byCampaignResult.rows.map(r => ({
        campaign: r.campaign,
        buyerCount: Number(r.buyer_count),
        nonBuyerCount: Number(r.non_buyer_count),
        bookingValue: Number(r.booking_value)
      })),
      byProperty: byPropertyResult.rows.map(r => ({
        property: r.property_name,
        leadsCount: Number(r.leads_count),
        bookingValue: Number(r.booking_value),
        bookingCount: Number(r.booking_count)
      }))
    });
  })
);

/**
 * Manually wakes both platforms' ad-level sync jobs early instead of
 * waiting for their 6h interval — Campaign Deep Dive's Sync button. Fires
 * the same jobs with the same real rate-limit pacing/backoff already in
 * place; it starts them sooner, it does not bypass Meta's or Google's
 * actual rate limits, so a run can still take a while to fully land.
 * Returns immediately — { started: false } for a platform means a sync for
 * it was already in progress, or the 10-minute manual-trigger cooldown
 * (see metaAdSpendSync.ts) hasn't elapsed yet, not that this request failed.
 */
adSpendRouter.post(
  "/sync",
  asyncHandler(async (_req, res) => {
    const meta = triggerMetaAdSpendSyncNow();
    const google = triggerGoogleAdsSpendSyncNow();
    sendOk(res, { meta, google });
  })
);
