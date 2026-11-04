import type { LeadListFilters, MissedRecordFilters, TeamReportFilters } from "./apiClient";

// Reports → a number → its detail page (the leads / tasks / site visits
// behind that number). The detail opens inside the Reports page itself
// (?detail=…), so Back returns to the report with its filters and scroll
// position intact — see app/(app)/dashboard/reports/page.tsx and
// components/reports/ReportDetailView.tsx.

export type ReportDetail =
  /** Leads, via GET /leads — same filters as the number's own count. */
  | { view: "leads"; title: string; filters: LeadListFilters }
  /** Frozen missed-lead records (migration 053), via GET /missed-records —
   *  each lead exactly as it was when it was missed. */
  | { view: "missed-records"; title: string; filters: MissedRecordFilters }
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
    return d && typeof d === "object" && typeof d.title === "string" && ["leads", "missed-records", "missed-tasks", "site-visits", "missed-followups"].includes(d.view) ? d : null;
  } catch {
    return null;
  }
}

// Opened from a notification (?from=notifications), the Leads page's lead
// panel closes to the CRM Dashboard instead of leaving them on Leads.
export const FROM_NOTIFICATIONS_PARAM = "from";
export const FROM_NOTIFICATIONS_VALUE = "notifications";

// What a notification opens shows on its own page under the CRM Dashboard
// (app/(app)/crm/dashboard/alert-leads), not inside Reports: the frozen
// missed-lead records of a missed alert, or a list of live leads.
type AlertLeadsDetail = Extract<ReportDetail, { view: "leads" | "missed-records" }>;
const ALERT_LEADS_PATH = "/crm/dashboard/alert-leads";

function alertLeadsHref(detail: AlertLeadsDetail): string {
  return `${ALERT_LEADS_PATH}?detail=${encodeURIComponent(JSON.stringify(detail))}`;
}

export function parseAlertLeadsDetail(raw: string | null): AlertLeadsDetail | null {
  const d = parseReportDetail(raw);
  return d?.view === "leads" || d?.view === "missed-records" ? d : null;
}

function storedDetail(link: string | undefined): AlertLeadsDetail | null {
  if (!link || (!link.startsWith("/dashboard/reports?") && !link.startsWith(`${ALERT_LEADS_PATH}?`))) return null;
  return parseAlertLeadsDetail(new URLSearchParams(link.slice(link.indexOf("?") + 1)).get("detail"));
}

// Missed alerts sent before they linked to their frozen records (migration
// 053) find them again by when they were sent. Every record of one
// scheduler run shares its missed_at, set just before its alerts go out and
// a full poll (60s) after the previous run's, so the 30 seconds before an
// alert pick out exactly its misses; "Missed Leads Today" covers its whole
// day up to then. The recipient's own access narrows them to theirs (an
// agent / a manager's team).
const MISSED_SLA_TITLE = /^(\d+ )?(Team )?Leads? Missed SLA$/;
const MISSED_RUN_WINDOW_MS = 30_000;
function legacyMissedRecordsHref(n: { title: string; link?: string; timestamp: string; leadId?: string }): string | undefined {
  const isDigest = n.title.startsWith("Missed Leads Today:");
  const isLeadMiss = MISSED_SLA_TITLE.test(n.title);
  const isCallMiss = n.title === "Follow-up SLA Violation";
  if (!isDigest && !isLeadMiss && !isCallMiss) return undefined;
  const sentAt = new Date(n.timestamp);
  if (isNaN(sentAt.getTime())) return undefined;
  const until = sentAt.toISOString();
  if (isDigest) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(sentAt);
    return alertLeadsHref({ view: "missed-records", title: `Missed Leads on ${day}`, filters: { type: "LEAD", missedOn: day, missedUntil: until } });
  }
  const agentId = n.link?.match(/[?&]agentId=([^&]+)/)?.[1];
  return alertLeadsHref({
    view: "missed-records",
    title: n.title,
    filters: {
      type: isCallMiss ? "CALL" : "LEAD",
      missedFrom: new Date(sentAt.getTime() - MISSED_RUN_WINDOW_MS).toISOString(),
      missedUntil: until,
      leadIds: n.leadId ? [n.leadId] : undefined,
      agentId: agentId ? decodeURIComponent(agentId) : undefined
    }
  });
}

/** Where clicking a notification goes — the bell, the pop-up and a push tap alike. */
export function notificationHref(n: { title: string; link?: string; timestamp: string; system?: string; leadId?: string }): string | undefined {
  const stored = storedDetail(n.link);
  // A missed alert opens its frozen records — the leads as they were then.
  if (stored?.view === "missed-records") return alertLeadsHref(stored);
  const legacyMissed = legacyMissedRecordsHref(n);
  if (legacyMissed) return legacyMissed;
  // A list of live leads (e.g. "Leads Reassigned To You").
  if (stored) return alertLeadsHref(stored);
  // A CRM alert about one lead opens that lead.
  if (n.system === "CRM" && n.leadId) return `/dashboard/crm?openLead=${n.leadId}&${FROM_NOTIFICATIONS_PARAM}=${FROM_NOTIFICATIONS_VALUE}`;
  return n.link;
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
