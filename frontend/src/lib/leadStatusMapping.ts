import { LeadStatus, LeadLog } from "@/context/AppContext";

// The 14-value Lead Status list (main Leads page only — Data Calling has
// its own, independent Call Status, see callStatusMapping.ts). Replaced
// the old 32-frontend-label/27-DB-code system (which had real duplicates,
// e.g. "New Lead" vs "New", "Booked" vs "Booking Done") in migration 029 —
// frontend label and DB code are now a clean 1:1, so this file is far
// smaller than it used to be. See DATA_DICTIONARY.md in Taskezy_DB and
// Taskezy-Server/migrations-archive/029_lead_status_segregation.sql for
// the old->new mapping every existing lead was migrated through.
export const FRONTEND_STATUS_TO_DB_CODE: Record<LeadStatus, string> = {
  "New Lead": "NEW_LEAD",
  "RNR": "RNR",
  "Call Back": "CALL_BACK",
  "Dead Lead": "DEAD_LEAD",
  "Followup": "FOLLOWUP",
  "EOI": "EOI",
  "Site Visit Scheduled": "SITE_VISIT_SCHEDULED",
  "Site Visit Done": "SITE_VISIT_DONE",
  "Low Budget": "LOW_BUDGET",
  "Other requirement": "OTHER_REQUIREMENT",
  "Broker": "BROKER",
  "Booked": "BOOKED",
  "Cancelled": "CANCELLED",
  "Different Location": "DIFFERENT_LOCATION"
};

export const DB_CODE_TO_FRONTEND_STATUS: Record<string, LeadStatus> = {
  NEW_LEAD: "New Lead",
  RNR: "RNR",
  CALL_BACK: "Call Back",
  DEAD_LEAD: "Dead Lead",
  FOLLOWUP: "Followup",
  EOI: "EOI",
  SITE_VISIT_SCHEDULED: "Site Visit Scheduled",
  SITE_VISIT_DONE: "Site Visit Done",
  LOW_BUDGET: "Low Budget",
  OTHER_REQUIREMENT: "Other requirement",
  BROKER: "Broker",
  BOOKED: "Booked",
  CANCELLED: "Cancelled",
  DIFFERENT_LOCATION: "Different Location",
  // UNASSIGNED is a system sentinel (no agent assigned yet, see
  // leads.service.ts) — never user-facing, auto-promotes to New Lead the
  // moment an agent is assigned. Shown as New Lead here purely as a safe
  // display fallback for the rare moment it's visible at all.
  UNASSIGNED: "New Lead"
};

// Full set of selectable statuses, in canonical pipeline order — shared by
// every status dropdown in the app so they all list the same options.
export const STATUS_OPTIONS: LeadStatus[] = [
  "New Lead", "RNR", "Call Back", "Followup", "EOI", "Site Visit Scheduled",
  "Site Visit Done", "Low Budget", "Other requirement", "Broker", "Booked",
  "Dead Lead", "Cancelled", "Different Location"
];

// Badge color classes for a status pill — shared by every status badge/pill
// in the app so the same status always reads the same color everywhere.
export function statusBadgeClasses(status: LeadStatus): string {
  switch (status) {
    case "Booked":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "New Lead":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "Dead Lead":
    case "Cancelled":
      return "bg-red-50 text-red-700 border-red-200";
    case "RNR":
    case "Call Back":
    case "Followup":
    case "EOI":
    case "Site Visit Scheduled":
    case "Site Visit Done":
    case "Low Budget":
    case "Other requirement":
    case "Broker":
    case "Different Location":
      return "bg-amber-50 text-amber-700 border-amber-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

export function frontendStatusToDbCode(status: LeadStatus): string | undefined {
  return FRONTEND_STATUS_TO_DB_CODE[status];
}

export function dbCodeToFrontendStatus(code: string): LeadStatus {
  return DB_CODE_TO_FRONTEND_STATUS[code] || "New Lead";
}

// --- Transition matrix (mirrors Taskezy-Server's leadStatusTransitions.ts
// exactly — kept as a frontend copy, not imported, since this is a browser
// bundle with no access to backend source; any change to one must be
// mirrored to the other) ---
//
// From `Lead status view flow - Sheet1.pdf`. The backend is the real
// enforcement point (a blocked or race-condition transition surfaces as a
// toast from its 400 response) — this copy only drives which options the
// dropdown shows and which ones need a confirm step, so a user doesn't
// have to attempt a transition just to find out it's blocked.
export const LEAD_STATUS_TRANSITIONS: Record<LeadStatus, { allowed: LeadStatus[]; optional: LeadStatus[] }> = {
  "New Lead": {
    allowed: ["RNR", "Call Back", "Dead Lead", "Followup", "Site Visit Scheduled", "Low Budget", "Other requirement", "Broker"],
    optional: ["Cancelled", "Different Location"]
  },
  "RNR": {
    // Dead Lead is listed as allowed here at the matrix level — the extra
    // 7-day/3-day-gap gate is enforced server-side, surfaced as a 400 if
    // the lead hasn't had enough logged call-back attempts yet.
    allowed: ["Call Back", "Dead Lead", "Followup", "Site Visit Scheduled", "Low Budget", "Other requirement", "Broker"],
    optional: ["Cancelled", "Different Location"]
  },
  "Call Back": {
    allowed: ["RNR", "Dead Lead", "Followup", "Site Visit Scheduled", "Low Budget", "Other requirement", "Broker"],
    optional: ["Cancelled", "Different Location"]
  },
  "Dead Lead": { allowed: [], optional: [] },
  "Followup": {
    allowed: ["Dead Lead", "EOI", "Site Visit Scheduled", "Low Budget", "Other requirement", "Broker"],
    optional: ["Cancelled", "Different Location"]
  },
  "EOI": {
    allowed: ["Site Visit Scheduled", "Low Budget", "Other requirement", "Broker", "Booked"],
    optional: ["Cancelled", "Different Location"]
  },
  "Site Visit Scheduled": {
    allowed: ["RNR", "Call Back", "Followup", "EOI", "Site Visit Done", "Low Budget", "Other requirement", "Broker"],
    optional: ["Cancelled", "Different Location"]
  },
  "Site Visit Done": {
    allowed: ["Followup", "EOI", "Site Visit Scheduled", "Low Budget", "Other requirement", "Broker"],
    optional: ["Cancelled", "Different Location"]
  },
  "Low Budget": {
    allowed: ["RNR", "Call Back", "Dead Lead", "Followup", "EOI", "Site Visit Scheduled", "Broker"],
    optional: ["Cancelled", "Different Location"]
  },
  "Other requirement": {
    allowed: ["RNR", "Call Back", "Dead Lead", "Followup", "EOI", "Site Visit Scheduled", "Low Budget", "Broker"],
    optional: ["Cancelled", "Different Location"]
  },
  "Broker": { allowed: ["Dead Lead"], optional: ["Cancelled"] },
  // Read as fully locked in the source matrix (every column "No") — but a
  // real booking can fall through, confirmed 2026-10-13 that Booked ->
  // Cancelled should be reachable after all.
  "Booked": { allowed: [], optional: ["Cancelled"] },
  "Cancelled": { allowed: [], optional: [] },
  "Different Location": {
    allowed: ["RNR", "Call Back", "Dead Lead", "Followup", "EOI", "Site Visit Scheduled", "Site Visit Done", "Low Budget", "Other requirement", "Broker"],
    optional: ["Cancelled"]
  }
};

/** Every status a lead currently on `current` may move to, each tagged with whether it needs a confirm step. */
export function nextStatusOptions(current: LeadStatus): { status: LeadStatus; needsConfirm: boolean }[] {
  const rule = LEAD_STATUS_TRANSITIONS[current];
  if (!rule) return STATUS_OPTIONS.map(status => ({ status, needsConfirm: false }));
  return [
    ...rule.allowed.map(status => ({ status, needsConfirm: false })),
    ...rule.optional.map(status => ({ status, needsConfirm: true }))
  ];
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
//     X is a raw DB code like "FOLLOWUP" (real backend messages use the
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
  if (/^Reassigned\b/i.test(message)) return "Reassigned";
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
