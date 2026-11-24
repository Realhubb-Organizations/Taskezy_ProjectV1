import type { Lead } from "@/context/AppContext";
import { isQualifiedCall } from "./callSubStatus";

/**
 * Data Calling "Not Qualified": a lead that has been called but isn't
 * Connected + Qualified — Connected-Unqualified, Connected with no sub-status
 * yet, Called, Not Reachable (RNR), Wrong Number. Leads nobody has called yet
 * aren't counted. Same rule as the server (qualifiedLeads.ts CALL_NOT_QUALIFIED_SQL).
 */
export const isCallNotQualified = (l: Pick<Lead, "callStatus" | "callSubStatus">): boolean => !!l.callStatus && !isQualifiedCall(l);

/**
 * When a Data Calling lead's result (Connected / Qualified / Unqualified /
 * RNR) counts: the moment its call status was last set (migration 059), or
 * its upload time for a lead from before that was recorded. Same rule as the
 * Reports Team report (teamReport.routes.ts CALL_RESULT_AT_SQL), so an
 * agent's calls on 19 Nov to leads uploaded on 13 Nov count on 19 Nov.
 */
export const callResultAt = (l: Pick<Lead, "callStatusAt" | "createdAtStr">): string | undefined => l.callStatusAt || l.createdAtStr;

export interface AnalyticsPerformanceRow {
  name: string;
  totalLeads: number;
  callsMade: number;
  /** Different leads called — each lead once, however many times or days (the "Unique Calls Made" column). */
  uniqueCallsMade?: number;
  connected: number;
  qualifiedLeads: number;
  unqualifiedLeads: number;
  rnr: number;
  siteVisits: number;
  qualificationRate: string;
}

type RowLead = Pick<Lead, "callStatus" | "callSubStatus" | "status">;

/** Qualified % = Qualified ÷ Unique Calls Made (different leads called with the Call button) × 100. */
export const qualificationRate = (qualified: number, uniqueCallsMade: number): string =>
  uniqueCallsMade > 0 ? `${((qualified / uniqueCallsMade) * 100).toFixed(1)}%` : "0.0%";

/** A row with its Calls Made and Unique Calls Made filled in (from the Call button's records) and its Qualified % worked out from Unique Calls Made. */
export const withCallsMade = (row: AnalyticsPerformanceRow, callsMade: number, uniqueCallsMade: number): AnalyticsPerformanceRow =>
  ({ ...row, callsMade, uniqueCallsMade, qualificationRate: qualificationRate(row.qualifiedLeads, uniqueCallsMade) });

/**
 * One row per group (salesperson, source…). Lead totals and site visits come
 * from `uploaded` (leads uploaded in the range); call results come from
 * `called` (leads whose result counts in the range, see callResultAt).
 * Unqualified = every called lead that isn't Qualified (isCallNotQualified).
 * Calls Made and Qualified % are filled in afterwards (withCallsMade).
 */
export function computeAnalyticsPerformanceRows<T extends RowLead>(
  uploaded: T[],
  called: T[],
  groupBy: (l: T) => string | undefined
): AnalyticsPerformanceRow[] {
  const groups = new Map<string, { uploaded: T[]; called: T[] }>();
  const add = (list: T[], kind: "uploaded" | "called") => list.forEach(l => {
    const key = groupBy(l);
    if (!key) return;
    const group = groups.get(key) ?? { uploaded: [], called: [] };
    group[kind].push(l);
    groups.set(key, group);
  });
  add(uploaded, "uploaded");
  add(called, "called");

  return Array.from(groups.entries()).map(([name, g]) => {
    const connected = g.called.filter(l => l.callStatus === "Connected").length;
    const qualifiedLeads = g.called.filter(isQualifiedCall).length;
    return {
      name,
      totalLeads: g.uploaded.length,
      callsMade: 0, // filled from the Call button's records (the page's withCallsMade)
      connected,
      qualifiedLeads,
      unqualifiedLeads: g.called.filter(isCallNotQualified).length,
      rnr: g.called.filter(l => l.callStatus === "Not Reachable").length,
      siteVisits: g.uploaded.filter(l => l.status === "Site Visit Scheduled" || l.status === "Site Visit Done").length,
      qualificationRate: qualificationRate(qualifiedLeads, 0)
    };
  }).sort((a, b) => b.totalLeads - a.totalLeads);
}
