import type { LeadListFilters, TeamReportFilters } from "./apiClient";

// Reports → a number → its detail page (the leads / tasks / site visits
// behind that number). The detail opens inside the Reports page itself
// (?detail=…), so Back returns to the report with its filters and scroll
// position intact — see app/(app)/dashboard/reports/page.tsx and
// components/reports/ReportDetailView.tsx.

export type ReportDetail =
  /** Leads, via GET /leads — same filters as the number's own count. */
  | { view: "leads"; title: string; filters: LeadListFilters }
  /** Follow-up tasks that went missed, via GET /reports/team/missed-tasks. */
  | { view: "missed-tasks"; title: string; filters: TeamReportFilters }
  /** Leads with a site visit due in the range, via GET /reports/team —
   *  optionally only those with a visit in the range that was missed / is
   *  still upcoming. */
  | { view: "site-visits"; title: string; filters: TeamReportFilters; match?: "all" | "missed" | "upcoming" }
  /** Follow-ups currently marked Missed, via GET /followups (Manager Reports' count). */
  | { view: "missed-followups"; title: string; agentIds: string[]; dateFrom?: string; dateTo?: string };

export type ReportTab = "agent" | "manager" | "marketing";

export function reportDetailHref(tab: ReportTab, detail: ReportDetail): string {
  return `/dashboard/reports?tab=${tab}&detail=${encodeURIComponent(JSON.stringify(detail))}`;
}

export function parseReportDetail(raw: string | null): ReportDetail | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as ReportDetail;
    return d && typeof d === "object" && typeof d.title === "string" && ["leads", "missed-tasks", "site-visits", "missed-followups"].includes(d.view) ? d : null;
  } catch {
    return null;
  }
}

// "Missed Leads Today: N" alerts sent before they carried their own lead list
// link (they point at plain Reports / Manager Reports) — rebuilt from the
// alert's time so they open the same list newer ones do (missedLeadScheduler.ts).
const LEGACY_MISSED_DIGEST_LINKS = ["/dashboard/reports", "/dashboard/reports?tab=manager"];
export function notificationHref(n: { title: string; link?: string; timestamp: string }): string | undefined {
  if (!n.link || !LEGACY_MISSED_DIGEST_LINKS.includes(n.link) || !n.title.startsWith("Missed Leads Today:")) return n.link;
  const sentAt = new Date(n.timestamp);
  if (isNaN(sentAt.getTime())) return n.link;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(sentAt);
  return reportDetailHref("manager", {
    view: "leads",
    title: `Missed Leads on ${day}`,
    filters: { missedOn: day, missedUntil: sentAt.toISOString() }
  });
}

// Where the report was scrolled to when a number was clicked, so Back can
// return to the same spot (the page scrolls inside <main>).
let savedReportScroll = 0;
export function rememberReportScroll(): void {
  savedReportScroll = document.querySelector("main")?.scrollTop ?? 0;
}
export function savedReportScrollTop(): number {
  return savedReportScroll;
}
