// Notification links that open a list on the CRM Dashboard's alert leads
// page (frontend app/(app)/crm/dashboard/alert-leads, lib/reportDetail.ts —
// keep the ?detail= shapes in step with ReportDetail's "leads" and
// "missed-records" views).

/** More ids than this and the link is too long for a push (FCM caps its data at 4KB). */
export const MAX_LINKED_LEAD_IDS = 40;

export interface LeadListLinkFilters {
  leadIds?: string[];
  assignedAgentId?: string[];
}

function alertLeadsLink(detail: object): string {
  return `/crm/dashboard/alert-leads?detail=${encodeURIComponent(JSON.stringify(detail))}`;
}

/** A list of exactly these (live) leads, or `fallback` when there are too many to fit in a link. */
export function leadIdsLink(title: string, leadIds: string[], fallback: string, extra: Omit<LeadListLinkFilters, "leadIds"> = {}): string {
  if (leadIds.length === 0 || leadIds.length > MAX_LINKED_LEAD_IDS) return fallback;
  return alertLeadsLink({ view: "leads", title, filters: { leadIds, ...extra } });
}

/** Filters of GET /missed-records (missed-records.routes.ts). */
export interface MissedRecordFilters {
  recordIds?: string[];
  type?: "LEAD" | "CALL";
  missedOn?: string;
  missedFrom?: string;
  missedUntil?: string;
  agentId?: string;
}

/** The frozen missed-lead records (migration 053) a notification is about. */
export function missedRecordsLink(title: string, filters: MissedRecordFilters): string {
  return alertLeadsLink({ view: "missed-records", title, filters });
}

/**
 * Exactly these records — or, when there are too many ids for a push, the
 * same records by when they were made: every record of one scheduler run
 * shares its missed_at (`at`), so `type` + that instant finds them again.
 */
export function missedRecordIdsLink(title: string, recordIds: string[], type: "LEAD" | "CALL", at: Date, agentId?: string): string {
  if (recordIds.length > 0 && recordIds.length <= MAX_LINKED_LEAD_IDS) return missedRecordsLink(title, { recordIds });
  return missedRecordsLink(title, { type, missedFrom: at.toISOString(), missedUntil: at.toISOString(), agentId });
}
