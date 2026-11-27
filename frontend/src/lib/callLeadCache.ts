import { apiGetLead, type ApiLeadRow } from "./apiClient";
import type { Lead } from "@/context/AppContext";

// The lead an agent is calling, remembered when they tap Call / WhatsApp.
//
// The call-feedback popup (CallFeedbackGate) opens the moment the agent comes
// back from the phone call. Loading the lead right then can fail on the phone
// (the app is still coming back), which left the popup with no status options
// ("Could not load this lead's details"). So the lead is saved here before the
// call starts — the screen the Call button is on already has it — and the
// popup opens from this copy straight away, refreshing it in the background.
//
// localStorage, so it survives Android closing the app during the call. Only
// the last call is kept.

const KEY = "taskezyCallLead";
/** An older copy than this isn't used (the agent called long ago). */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

type Saved =
  | { leadId: string; savedAt: number; kind: "lead"; lead: Lead }
  | { leadId: string; savedAt: number; kind: "api"; row: ApiLeadRow };

function write(entry: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // Storage blocked — the popup then loads the lead as before.
  }
}

/** Another lead was saved since `since` (a later Call/WhatsApp tap). */
function savedAfter(since: number, leadId: string): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as Saved;
    return saved.leadId !== leadId && saved.savedAt > since;
  } catch {
    return false;
  }
}

/**
 * Remembers the lead about to be called. `lead` is whatever the Call button's
 * screen has: a full lead is saved as is; either way a fresh copy is also
 * fetched now, while the app is still in front.
 */
export function rememberCallLead(lead: { id: string; status?: unknown }): void {
  // A full lead (Leads table, lead panel, …) has its status; a task row doesn't.
  if (typeof lead.status === "string") write({ leadId: lead.id, savedAt: Date.now(), kind: "lead", lead: lead as unknown as Lead });
  const startedAt = Date.now();
  apiGetLead(lead.id)
    .then(row => {
      // Don't replace a newer call's lead (another Call tapped meanwhile).
      if (savedAfter(startedAt, lead.id)) return;
      write({ leadId: lead.id, savedAt: Date.now(), kind: "api", row });
    })
    .catch(() => { /* the copy above (if any) stays */ });
}

/** The remembered copy of this lead, if recent — a full lead or the server row to map. */
export function readCallLead(leadId: string): { lead: Lead } | { row: ApiLeadRow } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Saved;
    if (saved.leadId !== leadId || Date.now() - saved.savedAt > MAX_AGE_MS) return null;
    return saved.kind === "lead" ? { lead: saved.lead } : { row: saved.row };
  } catch {
    return null;
  }
}
