import { LeadStatus, LeadLog } from "@/context/AppContext";

// The frontend's LeadStatus union has real duplication (e.g. "New Lead" vs
// "New", "Booked" vs "Booking Done") that accumulated as different screens
// were built at different times — see DATA_DICTIONARY.md in Taskezy_DB for
// the full explanation. The database consolidates these into 27 canonical
// `lead_statuses` codes (schema.sql). These two maps translate between them
// at the API boundary so neither side has to change its existing values.

// Frontend value → DB code, for anything the UI sends to the API (status updates).
export const FRONTEND_STATUS_TO_DB_CODE: Record<string, string> = {
  "New Lead": "NEW", "New": "NEW", "Revived": "REVIVED", "Lead Pool": "LEAD_POOL", "After RERA": "AFTER_RERA",
  "Interested": "INTERESTED", "Follow up": "FOLLOW_UP", "Call Back": "CALL_BACK", "Meeting Scheduled": "MEETING_SCHEDULED",
  "Meeting Done": "MEETING_DONE", "Site Visit Scheduled": "SITE_VISIT_SCHEDULED", "Site Visit Done": "SITE_VISIT_DONE",
  "In Negotiation": "IN_NEGOTIATION", "Booking Done": "BOOKING_DONE", "Finance Review": "FINANCE_REVIEW",
  "Booking Approved": "BOOKING_APPROVED", "Finance Rejected": "FINANCE_REJECTED", "Dead": "DEAD", "Unassigned": "UNASSIGNED",
  "RNR": "RNR", "Switch off": "SWITCH_OFF", "Booked": "BOOKING_DONE", "New Leads": "NEW", "Assigned": "ASSIGNED",
  "Connected": "CONNECTED", "Follow-ups": "FOLLOW_UP", "Visit Schedule": "SITE_VISIT_SCHEDULED", "Not Interested": "NOT_INTERESTED",
  "EOI Customers": "EOI", "Invalid": "INVALID", "Low Budget": "LOW_BUDGET", "Site Visit": "SITE_VISIT_DONE", "Completed": "COMPLETED"
};

// DB code → frontend display value, one canonical representative per code
// (chosen to match the LeadDetailDrawer's actual dropdown options where one exists).
export const DB_CODE_TO_FRONTEND_STATUS: Record<string, LeadStatus> = {
  NEW: "New Lead",
  ASSIGNED: "Assigned",
  CONNECTED: "Connected",
  INTERESTED: "Interested",
  FOLLOW_UP: "Follow-ups",
  CALL_BACK: "Call Back",
  MEETING_SCHEDULED: "Meeting Scheduled",
  MEETING_DONE: "Meeting Done",
  SITE_VISIT_SCHEDULED: "Visit Schedule",
  SITE_VISIT_DONE: "Site Visit",
  IN_NEGOTIATION: "In Negotiation",
  BOOKING_DONE: "Booked",
  FINANCE_REVIEW: "Finance Review",
  BOOKING_APPROVED: "Booking Approved",
  FINANCE_REJECTED: "Finance Rejected",
  DEAD: "Dead",
  UNASSIGNED: "Unassigned",
  RNR: "RNR",
  SWITCH_OFF: "Switch off",
  EOI: "EOI Customers",
  COMPLETED: "Completed",
  REVIVED: "Revived",
  LEAD_POOL: "Lead Pool",
  AFTER_RERA: "After RERA",
  NOT_INTERESTED: "Not Interested",
  LOW_BUDGET: "Low Budget",
  INVALID: "Invalid"
};

export function frontendStatusToDbCode(status: LeadStatus): string | undefined {
  return FRONTEND_STATUS_TO_DB_CODE[status];
}

export function dbCodeToFrontendStatus(code: string): LeadStatus {
  return DB_CODE_TO_FRONTEND_STATUS[code] || "New Lead";
}

// Real DB rows use UUID ids; local mock leads use "l-1", "l-2", etc. This is
// the cheap, reliable way to tell "does this lead exist in Postgres" apart
// from "this is still mock-only data" without an extra flag on every Lead.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isRealLeadId(id: string): boolean {
  return UUID_REGEX.test(id);
}

// Same check, generic name — every domain (properties, users, claims, etc.)
// uses the identical "real UUID from Postgres vs local mock id" distinction.
export const isRealId = isRealLeadId;

// --- Lead activity timeline: real state transitions parsed from real log
// messages, never fabricated ---
//
// LeadLog only stores {timestamp, message, user} — there's no structured
// "previous status / new status" pair anywhere in the schema. Rather than
// invent one, this parses the message formats actually observed in real
// production log entries (the backend and the client's own optimistic
// updates don't always word things identically, so this matches both):
//   - a real creation message ("Lead added manually...", "Lead assigned
//     to...") → "Lead Captured"
//   - `Status changed to "X"` → X, resolved through the DB-code map when
//     X is a raw DB code like "FOLLOW_UP" (real backend messages use the
//     DB code, not the frontend label), otherwise used verbatim
//   - "Reassigned to a different agent" or "Reassigned from A to B" →
//     "Reassigned"
// A message that matches none of these gets no derived label — including
// the chronologically-first entry, if for whatever reason it isn't a real
// creation message (e.g. only a partial log history is available) —
// forcing "Lead Captured" onto whatever happens to be oldest would be a
// guess, not a real read of the data. The UI falls back to showing the
// raw message with no transition arrow in that case. Each entry's "from"
// state is simply the previous entry's real derived "to" state, so the
// arrow is a real sequence, not an invented pairing.
export interface ActivityTimelineEntry {
  log: LeadLog;
  toLabel: string | null;
  fromLabel: string | null;
}

function resolveStatusLabel(rawStatus: string): string {
  const dbCodeMatch = DB_CODE_TO_FRONTEND_STATUS[rawStatus.toUpperCase().replace(/\s+/g, "_")];
  if (dbCodeMatch) return dbCodeMatch;
  return rawStatus.replace(/_/g, " ").replace(/-/g, " ");
}

function deriveLogStateLabel(message: string): string | null {
  if (/^Lead (added|assigned|captured)/i.test(message)) return "Lead Captured";
  const statusMatch = message.match(/^Status changed to "(.+)"$/i);
  if (statusMatch) return resolveStatusLabel(statusMatch[1]);
  if (/^Reassigned( to a different agent| from .+ to .+)?$/i.test(message)) return "Reassigned";
  return null;
}

// Oldest first ("down word approach") — Lead Captured at the top, each
// later update reading downward in the order it actually happened.
export function deriveActivityTimeline(logs: LeadLog[]): ActivityTimelineEntry[] {
  const chronological = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  let previousLabel: string | null = null;
  return chronological.map((log) => {
    const toLabel = deriveLogStateLabel(log.message);
    const entry: ActivityTimelineEntry = { log, toLabel, fromLabel: previousLabel };
    previousLabel = toLabel ?? previousLabel;
    return entry;
  });
}
