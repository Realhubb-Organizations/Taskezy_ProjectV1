import { AccessTokenPayload } from "../../utils/tokens";

// When a user is deleted, their leads are split between several agents. Each
// lead only ever names its OWN new owner ("Reassigned from Rohan to Neha");
// the admin's typed handover note — which often lists everyone ("split
// between Neha and Richa") — is kept as a separate history entry that only
// admins and managers see, so an agent never sees who else got the leads.
export const HANDOVER_NOTE_PREFIX = "Handover note (admins & managers only): ";

// "How/where this lead came from" system notes — real for audit purposes,
// but the source/campaign detail in them isn't something a Member-level
// agent should see (an agent doesn't act differently because a lead was a
// Google Sheet import vs. a Meta lead vs. restored from the archive, and
// shouldn't be able to read off which ad campaign/source it came from).
// Unlike handover notes below, these stay in the timeline for an agent —
// just reworded to a generic stub (see AGENT_VISIBLE_STUB) — rather than
// disappearing outright, so their Activity History still shows *that* and
// *when* the lead arrived. Same Admin-or-Manager boundary as handover
// notes, matched by fixed opening text (see leadRevival.ts,
// sheet-import.lead-ingest.ts, leads.service.ts's archive-restore and
// Data Calling promotion notes). Includes both the current and the
// now-retired legacy Meta wording — a message's exact text can get
// rewritten by a one-off data cleanup (see 2026-10-29's TablePlus
// updates) without this list being updated in lockstep, so both the old
// and new prefix stay listed rather than relying on the cleanup having
// been exhaustive.
const SYSTEM_ORIGIN_LOG_PREFIXES = [
  "Imported from Google Ads lead-form sheet",
  "Revived — a new ",
  "Restored from an archived lead deleted on ",
  "Lead qualified and transferred to main leads",
  "Lead received via Meta Ads",
  // Legacy formats from earlier Meta/Sheet ingest implementations — no
  // current code generates any of these three (confirmed via repo-wide
  // search); kept here since real historical rows still exist under each
  // exact wording.
  "Facebook Lead (webhook):",
  "Facebook Lead Sync:",
  "Facebook PPC",
  "Imported from GoogleSheets"
];

const AGENT_VISIBLE_STUB = "Lead received.";

// Case-insensitive — for any message that ISN'T one of the known
// SYSTEM_ORIGIN_LOG_PREFIXES shapes (e.g. a reassignment note someone
// typed as "Meta lead for MSR", or any future note mentioning one of
// these words), only the matched word itself is redacted in place —
// the rest of the note (who it was reassigned to, the rest of a call
// note, etc.) stays intact and readable.
const SOURCE_KEYWORDS = ["meta", "google", "facebook"];
const REDACTED = "[hidden]";

const seesHandoverNotes = (caller: AccessTokenPayload) => caller.role === "ADMIN" || caller.roleType === "MANAGER";

function isSystemOriginLog(message: string): boolean {
  return SYSTEM_ORIGIN_LOG_PREFIXES.some(prefix => message.startsWith(prefix));
}

function redactSourceKeywords(message: string): string {
  let result = message;
  for (const keyword of SOURCE_KEYWORDS) {
    result = result.replace(new RegExp(keyword, "gi"), REDACTED);
  }
  return result;
}

/**
 * For an agent (not Admin/Manager): drops admin-only handover notes
 * entirely; rewords a known system-origin note (Google Sheet import,
 * Meta/Google revival, archive-restore, Bulk Upload promotion) to a
 * generic "Lead received." stub; and for any OTHER message, redacts just
 * the specific source keyword(s) found (meta/google/facebook — including
 * in a human-typed note, e.g. a reassignment note reading "Meta lead for
 * MSR" becomes "[hidden] lead for MSR") while leaving the rest of that
 * note intact. Also drops missed_task_count (migration 047). None of this
 * detail is something a Member should see, including about their own
 * leads.
 */
export function leadForCaller<T>(caller: AccessTokenPayload, lead: T): T {
  if (!lead) return lead;
  if (seesHandoverNotes(caller)) return lead;
  const withExtras = lead as T & { logs?: { message: string }[]; missed_task_count?: number };
  const result: T & { logs?: { message: string }[]; missed_task_count?: number } = { ...withExtras };
  if (Array.isArray(withExtras.logs)) {
    result.logs = withExtras.logs
      .filter(l => !l.message.startsWith(HANDOVER_NOTE_PREFIX))
      .map(l => {
        if (isSystemOriginLog(l.message)) return { ...l, message: AGENT_VISIBLE_STUB };
        const redacted = redactSourceKeywords(l.message);
        return redacted === l.message ? l : { ...l, message: redacted };
      });
  }
  if (withExtras.missed_task_count !== undefined) {
    delete result.missed_task_count;
  }
  return result;
}
