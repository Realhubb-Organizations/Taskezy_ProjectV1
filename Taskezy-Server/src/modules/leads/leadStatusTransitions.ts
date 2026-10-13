import { query } from "../../db/pool";
import { ApiError } from "../../utils/ApiError";

// The 14-value Lead Status list (main Leads page only — Data Calling has
// its own, separate call_status, see leads.schema.ts). Matches
// lead_statuses' codes after migration 029.
export const LEAD_STATUS_CODES = [
  "NEW_LEAD", "RNR", "CALL_BACK", "DEAD_LEAD", "FOLLOWUP", "EOI",
  "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "LOW_BUDGET",
  "OTHER_REQUIREMENT", "BROKER", "BOOKED", "CANCELLED", "DIFFERENT_LOCATION"
] as const;

export type LeadStatusCode = (typeof LEAD_STATUS_CODES)[number];

const LABEL: Record<LeadStatusCode, string> = {
  NEW_LEAD: "New Lead", RNR: "RNR", CALL_BACK: "Call Back", DEAD_LEAD: "Dead Lead",
  FOLLOWUP: "Followup", EOI: "EOI", SITE_VISIT_SCHEDULED: "Site Visit Scheduled",
  SITE_VISIT_DONE: "Site Visit Done", LOW_BUDGET: "Low Budget",
  OTHER_REQUIREMENT: "Other requirement", BROKER: "Broker", BOOKED: "Booked",
  CANCELLED: "Cancelled", DIFFERENT_LOCATION: "Different Location"
};

// From `Lead status view flow - Sheet1.pdf`, re-read carefully (13 columns
// per row: Alerts, then 12 targets — Cancelled/Different Location are
// never a column there at all, only a row; see "optional" additions below
// for how that gap is handled). "Alerts" (reminder-worthy per current
// status) is out of scope for this round, not represented here.
const TRANSITIONS: Record<LeadStatusCode, { allowed: LeadStatusCode[]; optional: LeadStatusCode[] }> = {
  NEW_LEAD: {
    allowed: ["RNR", "CALL_BACK", "DEAD_LEAD", "FOLLOWUP", "SITE_VISIT_SCHEDULED", "LOW_BUDGET", "OTHER_REQUIREMENT", "BROKER"],
    optional: ["CANCELLED", "DIFFERENT_LOCATION"]
  },
  RNR: {
    // DEAD_LEAD is listed here as "allowed" at the matrix level — the extra
    // 7-day/3-day-gap gate is enforced separately in assertTransitionAllowed
    // below, not by omitting it from this list.
    allowed: ["CALL_BACK", "DEAD_LEAD", "FOLLOWUP", "SITE_VISIT_SCHEDULED", "LOW_BUDGET", "OTHER_REQUIREMENT", "BROKER"],
    optional: ["CANCELLED", "DIFFERENT_LOCATION"]
  },
  CALL_BACK: {
    allowed: ["RNR", "DEAD_LEAD", "FOLLOWUP", "SITE_VISIT_SCHEDULED", "LOW_BUDGET", "OTHER_REQUIREMENT", "BROKER"],
    optional: ["CANCELLED", "DIFFERENT_LOCATION"]
  },
  DEAD_LEAD: { allowed: [], optional: [] }, // terminal
  FOLLOWUP: {
    allowed: ["DEAD_LEAD", "EOI", "SITE_VISIT_SCHEDULED", "LOW_BUDGET", "OTHER_REQUIREMENT", "BROKER"],
    optional: ["CANCELLED", "DIFFERENT_LOCATION"]
  },
  EOI: {
    allowed: ["SITE_VISIT_SCHEDULED", "LOW_BUDGET", "OTHER_REQUIREMENT", "BROKER", "BOOKED"],
    optional: ["CANCELLED", "DIFFERENT_LOCATION"]
  },
  SITE_VISIT_SCHEDULED: {
    allowed: ["RNR", "CALL_BACK", "FOLLOWUP", "EOI", "SITE_VISIT_DONE", "LOW_BUDGET", "OTHER_REQUIREMENT", "BROKER"],
    optional: ["CANCELLED", "DIFFERENT_LOCATION"]
  },
  SITE_VISIT_DONE: {
    allowed: ["FOLLOWUP", "EOI", "SITE_VISIT_SCHEDULED", "LOW_BUDGET", "OTHER_REQUIREMENT", "BROKER"],
    optional: ["CANCELLED", "DIFFERENT_LOCATION"]
  },
  LOW_BUDGET: {
    allowed: ["RNR", "CALL_BACK", "DEAD_LEAD", "FOLLOWUP", "EOI", "SITE_VISIT_SCHEDULED", "BROKER"],
    optional: ["CANCELLED", "DIFFERENT_LOCATION"]
  },
  OTHER_REQUIREMENT: {
    allowed: ["RNR", "CALL_BACK", "DEAD_LEAD", "FOLLOWUP", "EOI", "SITE_VISIT_SCHEDULED", "LOW_BUDGET", "BROKER"],
    optional: ["CANCELLED", "DIFFERENT_LOCATION"]
  },
  BROKER: { allowed: ["DEAD_LEAD"], optional: ["CANCELLED"] }, // not fully terminal, but near it
  // BOOKED read as fully locked in the source matrix (every column "No") —
  // flagged to the user, since a real booking can fall through; confirmed
  // 2026-10-13 that Booked -> Cancelled should be reachable after all.
  BOOKED: { allowed: [], optional: ["CANCELLED"] },
  CANCELLED: { allowed: [], optional: [] }, // terminal
  DIFFERENT_LOCATION: {
    allowed: ["RNR", "CALL_BACK", "DEAD_LEAD", "FOLLOWUP", "EOI", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "LOW_BUDGET", "OTHER_REQUIREMENT", "BROKER"],
    optional: ["CANCELLED"]
  }
};

const RNR_ATTEMPT_SPAN_DAYS = 7;
const RNR_ATTEMPT_MAX_GAP_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * RNR -> Dead Lead is only allowed once the lead has had logged call-back
 * attempts (either a real call via the native app's call-feedback gate, or
 * a scheduled callback via the shared follow-up flow — see the "Log
 * Call-Back Attempt" action on the Leads page) spanning at least 7 days
 * since it most recently entered RNR, with no gap over 3 days between any
 * two consecutive attempts. Reuses existing tables (call_attempts,
 * followup_calls) rather than a new one — both already carry a real,
 * per-attempt timestamp.
 */
async function assertRnrAttemptHistorySatisfied(leadId: string): Promise<void> {
  const { rows: rnrEntries } = await query<{ created_at: string }>(
    `SELECT created_at FROM lead_logs WHERE lead_id = $1 AND message = 'Status changed to "RNR"' ORDER BY created_at DESC LIMIT 1`,
    [leadId]
  );
  const rnrSince = rnrEntries[0]?.created_at;
  if (!rnrSince) {
    throw ApiError.badRequest('This lead has no record of entering RNR — log at least one call-back attempt before marking it Dead Lead.');
  }

  const { rows: attempts } = await query<{ created_at: string }>(
    `SELECT created_at FROM call_attempts WHERE lead_id = $1 AND created_at >= $2
     UNION ALL
     SELECT created_at FROM followup_calls WHERE lead_id = $1 AND call_type = 'CALLBACK' AND created_at >= $2
     ORDER BY created_at ASC`,
    [leadId, rnrSince]
  );

  const insufficient = () =>
    ApiError.badRequest(
      `Dead Lead isn't available yet — RNR needs at least ${RNR_ATTEMPT_SPAN_DAYS} days of logged call-back attempts, with no gap over ${RNR_ATTEMPT_MAX_GAP_DAYS} days between any two, before this lead can be marked Dead Lead.`
    );

  if (attempts.length === 0) throw insufficient();

  const times = attempts.map(a => new Date(a.created_at).getTime());
  const spanDays = (times[times.length - 1] - times[0]) / MS_PER_DAY;
  if (spanDays < RNR_ATTEMPT_SPAN_DAYS) throw insufficient();

  for (let i = 1; i < times.length; i++) {
    const gapDays = (times[i] - times[i - 1]) / MS_PER_DAY;
    if (gapDays > RNR_ATTEMPT_MAX_GAP_DAYS) throw insufficient();
  }
}

/** Single enforcement point for every lead-status change — see updateLeadStatus in leads.service.ts. */
export async function assertTransitionAllowed(fromCode: string, toCode: LeadStatusCode, leadId: string): Promise<void> {
  if (fromCode === toCode) return; // not a transition — e.g. editing dealValue without changing status

  const rule = TRANSITIONS[fromCode as LeadStatusCode];
  if (!rule) return; // fromCode predates migration 029 or is otherwise unrecognized — don't block on a status this matrix doesn't know, the FK/enum elsewhere already guards valid codes going forward

  if (rule.allowed.includes(toCode) || rule.optional.includes(toCode)) {
    if (fromCode === "RNR" && toCode === "DEAD_LEAD") {
      await assertRnrAttemptHistorySatisfied(leadId);
    }
    return;
  }

  throw ApiError.badRequest(`Can't move a lead from "${LABEL[fromCode as LeadStatusCode] ?? fromCode}" to "${LABEL[toCode]}".`);
}
