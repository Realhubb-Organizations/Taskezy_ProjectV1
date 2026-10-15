import { AdSpendRecord } from "@/context/AppContext";
import { CampaignLeadStats } from "@/lib/apiClient";

// Single source of truth for turning real AdSpendRecord rows + real Leads
// into the per-campaign CampaignItem shape — shared by the Campaigns
// Analytics page and the Campaign Deep Dive page so they can never drift
// into different real numbers for the same campaign.
export interface CampaignItem {
  id: string;
  name: string;
  status: "Active" | "Pause" | "Stopped";
  totalLeads: number;
  qualifiedLeads: number;
  unqualifiedLeads: number;
  siteVisit: number;
  cpl: number;
  spend: number;
  platform: "Meta" | "Google" | "Other";
  property: string;
  // Pure ad-platform self-reported leads (unblended with synced-lead
  // count) — kept alongside totalLeads so anywhere that pairs a real
  // spend figure with a leads figure can show the platform-reported
  // number too, since spend was actually incurred to generate this
  // (usually larger) count, not the smaller real-synced totalLeads.
  platformReportedLeads: number;
  // Sums of the platform-reported daily figures; null when the platform
  // never reported them for this campaign in the range (shown as "—").
  impressions: number | null;
  clicks: number | null;
}

export const CAMPAIGN_STATUSES: CampaignItem["status"][] = ["Active", "Pause", "Stopped"];
export const QUALIFIED_LEAD_STATUSES = ["Call Back", "Followup", "EOI", "Site Visit Scheduled", "Site Visit Done", "Booked"];
export const UNQUALIFIED_LEAD_STATUSES = ["Dead Lead", "RNR"];
export const SITE_VISIT_LEAD_STATUSES = ["Site Visit Scheduled", "Site Visit Done"];
export const BOOKING_LEAD_STATUSES = ["Booked"];

// A campaign's totalLeads (and its qualified/unqualified/siteVisit
// breakdown) now comes from the server — GET /ad-spend/campaign-lead-stats
// (see Taskezy-Server/src/modules/ad-spend/ad-spend.routes.ts), which runs
// the exact "per real day, max(platform-reported, real-synced-count), then
// sum" rule this function used to compute client-side over the full
// bulk-loaded leads array. leadStats is keyed by campaign name
// (case-insensitively — same join key the old client-side filter used),
// fetched once per call site (date-scoped or all-time, matching whichever
// records/leadStats pair the caller passed) with a zeroed fallback for any
// campaign the server didn't return a row for (e.g. a brand-new campaign
// with ad-spend but not yet matched by any lead-stats call).
export function buildCampaignsList(
  records: AdSpendRecord[],
  leadStats: Map<string, CampaignLeadStats>
): { items: CampaignItem[]; platformReportedTotal: number } {
  const spendCampaignMap: Record<string, { spend: number; platformLeadsByDate: Record<string, number>; status: "Active" | "Pause" | "Stopped"; platform: "Meta" | "Google" | "Other"; property?: string; impressions: number | null; clicks: number | null }> = {};

  records.forEach(rec => {
    const name = rec.accountName;
    if (!spendCampaignMap[name]) {
      let st: "Active" | "Pause" | "Stopped" = "Active";
      if (rec.campaignStatus === "INACTIVE") st = "Stopped";
      if ((rec.campaignStatus as string) === "PAUSED") st = "Pause";

      let plat: "Meta" | "Google" | "Other" = "Meta";
      if (rec.platform.toLowerCase().includes("google")) plat = "Google";
      else if (!rec.platform.toLowerCase().includes("meta") && !rec.platform.toLowerCase().includes("facebook")) plat = "Other";

      spendCampaignMap[name] = {
        spend: 0,
        platformLeadsByDate: {},
        status: st,
        platform: plat,
        property: rec.property,
        impressions: null,
        clicks: null
      };
    }
    if (rec.impressions !== null && rec.impressions !== undefined) spendCampaignMap[name].impressions = (spendCampaignMap[name].impressions ?? 0) + rec.impressions;
    if (rec.clicks !== null && rec.clicks !== undefined) spendCampaignMap[name].clicks = (spendCampaignMap[name].clicks ?? 0) + rec.clicks;
    if (!spendCampaignMap[name].property && rec.property) spendCampaignMap[name].property = rec.property;
    spendCampaignMap[name].spend += rec.spend;
    spendCampaignMap[name].platformLeadsByDate[rec.date] = (spendCampaignMap[name].platformLeadsByDate[rec.date] || 0) + rec.leadsGenerated;
  });

  const result: CampaignItem[] = [];
  let platformReportedTotal = 0;

  Object.keys(spendCampaignMap).forEach((cName, idx) => {
    if (!result.some(r => r.name.toLowerCase() === cName.toLowerCase())) {
      const item = spendCampaignMap[cName];
      const campaignPlatformReportedLeads = Object.values(item.platformLeadsByDate).reduce((acc, v) => acc + v, 0);
      platformReportedTotal += campaignPlatformReportedLeads;

      // Zeroed fallback for a campaign the server's lead-stats call didn't
      // return a row for — same as this function's old behavior when a
      // campaign genuinely had zero matching leads.
      const stats = leadStats.get(cName.toLowerCase()) ?? { totalLeads: 0, qualifiedLeads: 0, unqualifiedLeads: 0, siteVisit: 0 };
      const cplVal = stats.totalLeads > 0 ? Number((item.spend / stats.totalLeads).toFixed(2)) : 0;

      result.push({
        id: `dyn-${idx}`,
        name: cName,
        status: item.status,
        totalLeads: stats.totalLeads,
        qualifiedLeads: stats.qualifiedLeads,
        unqualifiedLeads: stats.unqualifiedLeads,
        siteVisit: stats.siteVisit,
        cpl: cplVal,
        spend: item.spend,
        platform: item.platform,
        property: item.property || "Unspecified",
        platformReportedLeads: campaignPlatformReportedLeads,
        impressions: item.impressions,
        clicks: item.clicks
      });
    }
  });

  return { items: result, platformReportedTotal };
}
