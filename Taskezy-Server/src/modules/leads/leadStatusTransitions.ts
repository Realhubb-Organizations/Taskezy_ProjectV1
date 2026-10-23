import { query } from "../../db/pool";
import { ApiError } from "../../utils/ApiError";
import { BUSINESS_TIMEZONE } from "../../utils/businessDate";

// The 14-value Lead Status list (main Leads page only — Data Calling has
// its own, separate call_status, see leads.schema.ts). Matches
// lead_statuses' codes after migration 030.
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
    // DEAD_LEAD is listed here as "allowed" at the matrix level — the
    // minimum-call-history gate is enforced separately in
    // assertTransitionAllowed below (applies to every path to DEAD_LEAD,
    // not just this one), not by omitting it from this list.
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

// A lead can't be marked Dead Lead until it's been genuinely worked —
// called on at least this many distinct calendar days over its lifetime.
// Multiple calls on the same day only count once (an agent dialing the
// same lead 15 times in one afternoon doesn't satisfy this), so this is a
// real spread-over-time effort check, not a raw attempt count. Applies to
// every path to Dead Lead (NEW_LEAD, RNR, CALL_BACK, FOLLOWUP, etc.), not
// just RNR — replaces the earlier RNR-only 7-day-span/3-day-gap rule.
// Exported so the leads list query (leads.repository.ts) can expose the
// same threshold to the frontend for disabling the Dead Lead option in the
// status picker before it would even be rejected server-side.
export const DEAD_LEAD_MIN_CALL_DAYS = 15;

/**
 * Counts distinct business-calendar days (BUSINESS_TIMEZONE, so a late-
 * night call doesn't land on the wrong day) call_attempts has a real phone
 * call (channel = 'CALL' — WhatsApp doesn't count as "called") logged
 * against this lead, for its whole lifetime.
 */
async function assertDeadLeadCallHistorySatisfied(leadId: string): Promise<void> {
  const { rows } = await query<{ unique_days: string }>(
    `SELECT count(DISTINCT (created_at AT TIME ZONE $2)::date) AS unique_days
     FROM call_attempts
     WHERE lead_id = $1 AND channel = 'CALL'`,
    [leadId, BUSINESS_TIMEZONE]
  );
  const uniqueDays = Number(rows[0]?.unique_days ?? 0);
  if (uniqueDays < DEAD_LEAD_MIN_CALL_DAYS) {
    throw ApiError.badRequest(
      `Dead Lead isn't available yet — this lead has been called on ${uniqueDays} of the required ${DEAD_LEAD_MIN_CALL_DAYS} separate days before it can be marked Dead Lead.`
    );
  }
}

/** Single enforcement point for every lead-status change — see updateLeadStatus in leads.service.ts. */
export async function assertTransitionAllowed(fromCode: string, toCode: LeadStatusCode, leadId: string): Promise<void> {
  if (fromCode === toCode) return; // not a transition — e.g. editing dealValue without changing status

  const rule = TRANSITIONS[fromCode as LeadStatusCode];
  if (!rule) return; // fromCode predates migration 030 or is otherwise unrecognized — don't block on a status this matrix doesn't know, the FK/enum elsewhere already guards valid codes going forward

  if (rule.allowed.includes(toCode) || rule.optional.includes(toCode)) {
    if (toCode === "DEAD_LEAD") {
      await assertDeadLeadCallHistorySatisfied(leadId);
    }
    return;
  }

  throw ApiError.badRequest(`Can't move a lead from "${LABEL[fromCode as LeadStatusCode] ?? fromCode}" to "${LABEL[toCode]}".`);
}
