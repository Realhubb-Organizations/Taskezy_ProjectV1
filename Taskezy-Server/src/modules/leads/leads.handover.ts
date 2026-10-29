import { AccessTokenPayload } from "../../utils/tokens";

// When a user is deleted, their leads are split between several agents. Each
// lead only ever names its OWN new owner ("Reassigned from Rohan to Neha");
// the admin's typed handover note — which often lists everyone ("split
// between Neha and Richa") — is kept as a separate history entry that only
// admins and managers see, so an agent never sees who else got the leads.
export const HANDOVER_NOTE_PREFIX = "Handover note (admins & managers only): ";

// "How/where this lead came from" system notes — real for audit purposes,
// but not something a Member-level agent needs cluttering their Activity
// History (an agent doesn't act differently because a lead was a Google
// Sheet import vs. a Meta lead vs. restored from the archive). Same
// Admin-or-Manager boundary as handover notes, listed by their fixed
// opening text (see leadRevival.ts, sheet-import.lead-ingest.ts,
// leads.service.ts's archive-restore and Data Calling promotion notes).
const SYSTEM_ORIGIN_LOG_PREFIXES = [
  "Imported from Google Ads lead-form sheet",
  "Revived — a new ",
  "Restored from an archived lead deleted on ",
  "Lead qualified and transferred to main leads"
];

const seesHandoverNotes = (caller: AccessTokenPayload) => caller.role === "ADMIN" || caller.roleType === "MANAGER";

function isAdminOnlyLog(message: string): boolean {
  return message.startsWith(HANDOVER_NOTE_PREFIX) || SYSTEM_ORIGIN_LOG_PREFIXES.some(prefix => message.startsWith(prefix));
}

/**
 * Drops admin-only handover notes, system-origin notes (Google Sheet
 * import, Meta/Google revival, archive-restore, Bulk Upload promotion),
 * AND missed_task_count (migration 047, how many times this lead's
 * follow-up reminder was flagged MISSED) from a lead for an agent — none
 * of these are something a Member needs to see, including about their own
 * leads. Same Admin-or-Manager boundary throughout, reused rather than a
 * second role check.
 */
export function leadForCaller<T>(caller: AccessTokenPayload, lead: T): T {
  if (!lead) return lead;
  if (seesHandoverNotes(caller)) return lead;
  const withExtras = lead as T & { logs?: { message: string }[]; missed_task_count?: number };
  const result: T & { logs?: { message: string }[]; missed_task_count?: number } = { ...withExtras };
  if (Array.isArray(withExtras.logs)) {
    result.logs = withExtras.logs.filter(l => !isAdminOnlyLog(l.message));
  }
  if (withExtras.missed_task_count !== undefined) {
    delete result.missed_task_count;
  }
  return result;
}
