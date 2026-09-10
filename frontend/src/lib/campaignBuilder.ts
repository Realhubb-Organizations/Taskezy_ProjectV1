import { Lead, AdSpendRecord } from "@/context/AppContext";

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
}

export const CAMPAIGN_STATUSES: CampaignItem["status"][] = ["Active", "Pause", "Stopped"];
export const QUALIFIED_LEAD_STATUSES = ["Interested", "Connected", "Visit Schedule", "Site Visit", "Booking Done", "Booked"];
export const UNQUALIFIED_LEAD_STATUSES = ["Dead", "Invalid", "RNR"];
export const SITE_VISIT_LEAD_STATUSES = ["Visit Schedule", "Site Visit"];
export const BOOKING_LEAD_STATUSES = ["Booking Done", "Booking Approved", "Booked"];

// A campaign's totalLeads is the sum, over every real day it has data, of
// max(that day's platform-reported leadsGenerated, that day's real synced
// Lead count) — never less than what the platform reported, and never less
// than what's actually been synced into the CRM either. Taking the max per
// day (not once across the whole range) means the exact same real
// per-(campaign, day) numbers (returned as leadsByDateByCampaign) can drive
// both a day-by-day chart AND the range's grand total, and the two are then
// mathematically guaranteed to always agree, however the data is sliced.
//
// leadDateFilter scopes which of a campaign's real leads count toward the
// synced side — records is expected to already be pre-filtered to the same
// Date Range, otherwise a campaign's leads from months ago leak into a
// narrow range's union of dates and get summed in as if they happened then.
export function buildCampaignsList(
  records: AdSpendRecord[],
  leads: Lead[],
  leadDateFilter: (l: Lead) => boolean
): { items: CampaignItem[]; leadsByDateByCampaign: Record<string, Record<string, number>>; platformReportedTotal: number } {
  const spendCampaignMap: Record<string, { spend: number; platformLeadsByDate: Record<string, number>; status: "Active" | "Pause" | "Stopped"; platform: "Meta" | "Google" | "Other"; property?: string }> = {};

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
        property: rec.property
      };
    }
    if (!spendCampaignMap[name].property && rec.property) spendCampaignMap[name].property = rec.property;
    spendCampaignMap[name].spend += rec.spend;
    spendCampaignMap[name].platformLeadsByDate[rec.date] = (spendCampaignMap[name].platformLeadsByDate[rec.date] || 0) + rec.leadsGenerated;
  });

  const result: CampaignItem[] = [];
  const leadsByDateByCampaign: Record<string, Record<string, number>> = {};
  let platformReportedTotal = 0;

  Object.keys(spendCampaignMap).forEach((cName, idx) => {
    if (!result.some(r => r.name.toLowerCase() === cName.toLowerCase())) {
      const item = spendCampaignMap[cName];
      const campaignPlatformReportedLeads = Object.values(item.platformLeadsByDate).reduce((acc, v) => acc + v, 0);
      platformReportedTotal += campaignPlatformReportedLeads;
      // Qualified/Unqualified/Site Visit are current pipeline status
      // snapshots (like the CRM Dashboard's own cards) — a lead qualified
      // today should still count even if it came in last week, so those
      // read off every matched lead regardless of creation date.
      const campaignLeads = leads.filter(l => (l.campaign || l.source)?.toLowerCase() === cName.toLowerCase());

      const syncedLeadsByDate: Record<string, number> = {};
      campaignLeads.filter(leadDateFilter).forEach(l => {
        if (!l.createdAtStr) return;
        const d = new Date(l.createdAtStr);
        if (isNaN(d.getTime())) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        syncedLeadsByDate[key] = (syncedLeadsByDate[key] || 0) + 1;
      });

      const perDayMax: Record<string, number> = {};
      new Set([...Object.keys(item.platformLeadsByDate), ...Object.keys(syncedLeadsByDate)]).forEach(date => {
        perDayMax[date] = Math.max(item.platformLeadsByDate[date] || 0, syncedLeadsByDate[date] || 0);
      });
      leadsByDateByCampaign[cName] = perDayMax;

      const total = Object.values(perDayMax).reduce((acc, v) => acc + v, 0);
      const qualified = campaignLeads.filter(l => QUALIFIED_LEAD_STATUSES.includes(l.status)).length;
      const unqualified = campaignLeads.filter(l => UNQUALIFIED_LEAD_STATUSES.includes(l.status)).length;
      const siteVisits = campaignLeads.filter(l => SITE_VISIT_LEAD_STATUSES.includes(l.status)).length;
      const cplVal = total > 0 ? Number((item.spend / total).toFixed(2)) : 0;

      result.push({
        id: `dyn-${idx}`,
        name: cName,
        status: item.status,
        totalLeads: total,
        qualifiedLeads: qualified,
        unqualifiedLeads: unqualified,
        siteVisit: siteVisits,
        cpl: cplVal,
        spend: item.spend,
        platform: item.platform,
        property: item.property || "Unspecified",
        platformReportedLeads: campaignPlatformReportedLeads
      });
    }
  });

  return { items: result, leadsByDateByCampaign, platformReportedTotal };
}
