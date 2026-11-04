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

// Opened from a notification (?from=notifications), the Leads page's lead
// panel closes to the CRM Dashboard instead of leaving them on Leads.
export const FROM_NOTIFICATIONS_PARAM = "from";
export const FROM_NOTIFICATIONS_VALUE = "notifications";

// The leads a notification is about open on their own page under the CRM
// Dashboard (app/(app)/crm/dashboard/alert-leads), not inside Reports.
type AlertLeadsDetail = Extract<ReportDetail, { view: "leads" }>;
const ALERT_LEADS_PATH = "/crm/dashboard/alert-leads";

function alertLeadsHref(title: string, filters: LeadListFilters): string {
  const detail: AlertLeadsDetail = { view: "leads", title, filters };
  return `${ALERT_LEADS_PATH}?detail=${encodeURIComponent(JSON.stringify(detail))}`;
}

export function parseAlertLeadsDetail(raw: string | null): AlertLeadsDetail | null {
  const d = parseReportDetail(raw);
  return d?.view === "leads" ? d : null;
}

// "Missed Leads Today: N" alerts sent before they carried their own lead list
// link (they point at plain Reports / Manager Reports) — rebuilt from the
// alert's time so they open the same list newer ones do (missedLeadScheduler.ts).
const LEGACY_MISSED_DIGEST_LINKS = ["/dashboard/reports", "/dashboard/reports?tab=manager"];
function legacyMissedDigestHref(n: { title: string; link?: string; timestamp: string }): string | undefined {
  if (!n.link || !LEGACY_MISSED_DIGEST_LINKS.includes(n.link) || !n.title.startsWith("Missed Leads Today:")) return undefined;
  const sentAt = new Date(n.timestamp);
  if (isNaN(sentAt.getTime())) return undefined;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(sentAt);
  return alertLeadsHref(`Missed Leads on ${day}`, { missedOn: day, missedUntil: sentAt.toISOString(), overdueOnly: true });
}

// "Lead(s) Missed SLA" / "Team Lead(s) Missed SLA" alerts sent before they
// carried their lead ids (they point at the Leads or Reports page). Every
// lead one scheduler run flags shares one missed_notified_at, set just
// before its alerts are sent and a full poll (60s) after the previous run's,
// so the 30 seconds before the alert pick out exactly its leads. The
// recipient's own lead access narrows it to theirs (an agent / a manager's
// team); an alert naming one agent also carries their id in its link.
const LEGACY_MISSED_SLA_TITLE = /^(\d+ )?(Team )?Leads? Missed SLA$/;
const MISSED_SLA_RUN_WINDOW_MS = 30_000;
function legacyMissedSlaHref(n: { title: string; link?: string; timestamp: string }): string | undefined {
  if (!LEGACY_MISSED_SLA_TITLE.test(n.title) || n.link?.includes("detail=")) return undefined;
  const sentAt = new Date(n.timestamp);
  if (isNaN(sentAt.getTime())) return undefined;
  const agentId = n.link?.match(/[?&]agentId=([^&]+)/)?.[1];
  return alertLeadsHref(n.title, {
    missedFrom: new Date(sentAt.getTime() - MISSED_SLA_RUN_WINDOW_MS).toISOString(),
    missedUntil: sentAt.toISOString(),
    overdueOnly: true,
    assignedAgentId: agentId ? [decodeURIComponent(agentId)] : undefined
  });
}

// A lead-list link already stored on a notification (missedLeadScheduler.ts
// etc., which used to point at Reports' detail page) -> the same list on the
// alert leads page.
function storedLeadListHref(link: string | undefined): string | undefined {
  if (!link || (!link.startsWith("/dashboard/reports?") && !link.startsWith(`${ALERT_LEADS_PATH}?`))) return undefined;
  const detail = parseAlertLeadsDetail(new URLSearchParams(link.slice(link.indexOf("?") + 1)).get("detail"));
  return detail ? alertLeadsHref(detail.title, detail.filters) : undefined;
}

/** Where clicking a notification goes — the bell, the pop-up and a push tap alike. */
export function notificationHref(n: { title: string; link?: string; timestamp: string; system?: string; leadId?: string }): string | undefined {
  // A CRM alert about one lead opens that lead.
  if (n.system === "CRM" && n.leadId) return `/dashboard/crm?openLead=${n.leadId}&${FROM_NOTIFICATIONS_PARAM}=${FROM_NOTIFICATIONS_VALUE}`;
  return storedLeadListHref(n.link) ?? legacyMissedSlaHref(n) ?? legacyMissedDigestHref(n) ?? n.link;
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
