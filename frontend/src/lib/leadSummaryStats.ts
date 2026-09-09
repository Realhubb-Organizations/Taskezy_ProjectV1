import { Lead } from "@/context/AppContext";

// Single source of truth for the 7 lead-pipeline stat cards shown on the
// CRM Dashboard, the admin Leads page, and the Campaigns page's top bar —
// they used to each duplicate this predicate logic independently and drift
// apart (e.g. Campaigns' Total Leads/Follow Ups/Call Backs computed
// differently from the identically-labeled cards on the other two pages).
// Every page now calls this so the same field name can never mean a
// different real number depending on which page you're looking at.
//
// Total Leads/New Leads are about intake volume, so they respect whichever
// date-range predicate the caller passes in. Every other card reflects a
// lead's CURRENT status regardless of when it was created — a live
// pipeline snapshot (a lead created last week that just got marked RNR
// today should still count), not an intake-date snapshot — so those
// deliberately read off `scopedLeads` unfiltered by date.
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
    rnr: scopedLeads.filter(l => l.status === "RNR").length,
    callBacks: scopedLeads.filter(l => l.status === "Call Back").length,
    followUps: scopedLeads.filter(l => l.status === "Follow-ups").length,
    siteVisitScheduled: scopedLeads.filter(l => l.status === "Visit Schedule").length,
    siteVisitDone: scopedLeads.filter(l => l.status === "Site Visit").length
  };
}
