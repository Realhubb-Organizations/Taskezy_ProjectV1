import { Lead } from "@/context/AppContext";

// Single source of truth for the 7 lead-pipeline stat cards shown on the
// CRM Dashboard, the admin Leads page, and the Campaigns page's top bar —
// they used to each duplicate this predicate logic independently and drift
// apart. Every page now calls this so the same field name can never mean a
// different real number depending on which page you're looking at.
//
// All 7 fields respect the caller's Date Range predicate — including
// RNR/Call Backs/Follow Ups/Site Visit Scheduled/Site Visit Done, which
// used to deliberately ignore Date Range (real all-time pipeline
// snapshots). The user explicitly chose full Date Range reactivity
// everywhere over that: a lead created last week that's marked RNR today
// will now disappear from "Today"'s RNR count, since it wasn't created
// today — a known, accepted trade-off, not an oversight.
export interface LeadSummaryStats {
  totalLeads: number;
  newLeads: number;
  rnr: number;
  callBacks: number;
  followUps: number;
  siteVisitScheduled: number;
  siteVisitDone: number;
}

export function computeLeadSummaryStats(scopedLeads: Lead[], isInDateRange: (l: Lead) => boolean): LeadSummaryStats {
  const rangeLeads = scopedLeads.filter(isInDateRange);
  return {
    totalLeads: rangeLeads.length,
    newLeads: rangeLeads.filter(l => l.status === "New Lead").length,
    rnr: rangeLeads.filter(l => l.status === "RNR").length,
    callBacks: rangeLeads.filter(l => l.status === "Call Back").length,
    followUps: rangeLeads.filter(l => l.status === "Follow-ups").length,
    siteVisitScheduled: rangeLeads.filter(l => l.status === "Visit Schedule").length,
    siteVisitDone: rangeLeads.filter(l => l.status === "Site Visit").length
  };
}
