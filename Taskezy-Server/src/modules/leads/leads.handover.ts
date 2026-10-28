import { AccessTokenPayload } from "../../utils/tokens";

// When a user is deleted, their leads are split between several agents. Each
// lead only ever names its OWN new owner ("Reassigned from Rohan to Neha");
// the admin's typed handover note — which often lists everyone ("split
// between Neha and Richa") — is kept as a separate history entry that only
// admins and managers see, so an agent never sees who else got the leads.
export const HANDOVER_NOTE_PREFIX = "Handover note (admins & managers only): ";

const seesHandoverNotes = (caller: AccessTokenPayload) => caller.role === "ADMIN" || caller.roleType === "MANAGER";

/**
 * Drops admin-only handover notes AND missed_task_count (migration 047,
 * how many times this lead's follow-up reminder was flagged MISSED) from
 * a lead for an agent — a Manager/Admin-only count, never shown to the
 * agent whose own misses it's counting. Same Admin-or-Manager boundary as
 * the handover notes above, reused rather than a second role check.
 */
export function leadForCaller<T>(caller: AccessTokenPayload, lead: T): T {
  if (!lead) return lead;
  if (seesHandoverNotes(caller)) return lead;
  const withExtras = lead as T & { logs?: { message: string }[]; missed_task_count?: number };
  const result: T & { logs?: { message: string }[]; missed_task_count?: number } = { ...withExtras };
  if (Array.isArray(withExtras.logs)) {
    result.logs = withExtras.logs.filter(l => !l.message.startsWith(HANDOVER_NOTE_PREFIX));
  }
  if (withExtras.missed_task_count !== undefined) {
    delete result.missed_task_count;
  }
  return result;
}
