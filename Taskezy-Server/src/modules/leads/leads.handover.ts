import { AccessTokenPayload } from "../../utils/tokens";

// When a user is deleted, their leads are split between several agents. Each
// lead only ever names its OWN new owner ("Reassigned from Rohan to Neha");
// the admin's typed handover note — which often lists everyone ("split
// between Neha and Richa") — is kept as a separate history entry that only
// admins and managers see, so an agent never sees who else got the leads.
export const HANDOVER_NOTE_PREFIX = "Handover note (admins & managers only): ";

const seesHandoverNotes = (caller: AccessTokenPayload) => caller.role === "ADMIN" || caller.roleType === "MANAGER";

/** Drops admin-only handover notes from a lead's history for agents. */
export function leadForCaller<T>(caller: AccessTokenPayload, lead: T): T {
  if (!lead || seesHandoverNotes(caller)) return lead;
  const withLogs = lead as T & { logs?: { message: string }[] };
  if (!Array.isArray(withLogs.logs)) return lead;
  return { ...withLogs, logs: withLogs.logs.filter(l => !l.message.startsWith(HANDOVER_NOTE_PREFIX)) };
}
