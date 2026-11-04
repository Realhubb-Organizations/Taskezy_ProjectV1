// Notification links that open a list of leads on the CRM Dashboard's alert
// leads page (frontend app/(app)/crm/dashboard/alert-leads, lib/reportDetail.ts
// — keep the ?detail= shape in step with ReportDetail's "leads" view).

/** More ids than this and the link is too long for a push (FCM caps its data at 4KB). */
export const MAX_LINKED_LEAD_IDS = 40;

export interface LeadListLinkFilters {
  leadIds?: string[];
  assignedAgentId?: string[];
  missedOn?: string;
  missedUntil?: string;
  overdueOnly?: boolean;
}

export function leadListLink(title: string, filters: LeadListLinkFilters): string {
  const detail = { view: "leads", title, filters };
  return `/crm/dashboard/alert-leads?detail=${encodeURIComponent(JSON.stringify(detail))}`;
}

/** A list of exactly these leads, or `fallback` when there are too many to fit in a link. */
export function leadIdsLink(title: string, leadIds: string[], fallback: string, extra: Omit<LeadListLinkFilters, "leadIds"> = {}): string {
  if (leadIds.length === 0 || leadIds.length > MAX_LINKED_LEAD_IDS) return fallback;
  return leadListLink(title, { leadIds, ...extra });
}
