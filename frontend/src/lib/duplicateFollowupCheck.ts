import { apiListFollowupsPage, ApiFollowupRow } from "@/lib/apiClient";

/**
 * Checks whether a lead already has an open (UPCOMING) follow-up — today,
 * tomorrow, next week, any date — before a new one is about to be created
 * for it. Shared by every popup that can schedule a follow-up
 * (CallFeedbackGate, the status scheduler, Data Calling's inline Call
 * Status popup), so an agent and their manager working the same lead (or
 * the same agent calling it again) don't silently stack up duplicate
 * reminders for it, no matter how far out the existing one is. Returns the
 * nearest upcoming row (so its date/time can be shown in the "already
 * scheduled" prompt), or null.
 */
export async function findOpenFollowup(leadId: string): Promise<ApiFollowupRow | null> {
  const { rows } = await apiListFollowupsPage(1, 1, {
    leadId: [leadId],
    status: ["UPCOMING"]
  });
  return rows[0] ?? null;
}

/** "today at 3:30 PM" / "on 5 Nov at 10:00 AM" from an ISO scheduled_at timestamp, for the duplicate-schedule prompt's wording. */
export function formatFollowupWhen(scheduledAt: string): string {
  const d = new Date(scheduledAt);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const isToday = d.toDateString() === new Date().toDateString();
  if (isToday) return `today at ${time}`;
  return `on ${d.toLocaleDateString([], { day: "numeric", month: "short" })} at ${time}`;
}

const AGENT_CONFLICT_WINDOW_MS = 5 * 60 * 1000;

export interface AgentScheduleConflict {
  conflictingLeadName: string;
  conflictingAt: string;
  /** Nearest genuinely free slot at/after the picked time, or null if nothing's free the rest of that day. */
  suggestedAt: string | null;
}

/**
 * An agent can't physically be on two calls at once — checks whether the
 * same agent already has another lead's UPCOMING follow-up within 5
 * minutes of a newly-picked time, before it's saved. Bounded to the picked
 * time's own calendar date (same-day pageSize=100 is far more than any one
 * agent realistically has scheduled in a day).
 *
 * When there IS a conflict, also walks forward in 5-minute steps from the
 * picked time — re-checking against every one of that agent's OTHER
 * follow-ups that day, not just the one conflict found — to suggest a
 * genuinely free slot. A busy agent's day can have several back-to-back
 * reminders; without this, "pick a time 5 minutes apart" is a dead end
 * with no indication of where that time actually is, which is exactly
 * what left agents stuck on the blocking popup with nowhere to go.
 *
 * ponytail: a conflict within 5 minutes of midnight against a follow-up on
 * the adjacent calendar date isn't caught (day-bounded query), and the
 * walk-forward stops at day's end rather than spilling into tomorrow —
 * vanishingly rare edge, "nothing free today" is still an honest answer.
 */
export async function findAgentScheduleConflict(
  agentId: string,
  newScheduledAtIso: string,
  excludeLeadId?: string
): Promise<AgentScheduleConflict | null> {
  const newTime = new Date(newScheduledAtIso).getTime();
  const dayIso = newScheduledAtIso.slice(0, 10);
  const { rows } = await apiListFollowupsPage(1, 100, {
    assignedToId: [agentId],
    status: ["UPCOMING"],
    dateFrom: dayIso,
    dateTo: dayIso
  });
  const others = rows.filter(r => r.lead_id !== excludeLeadId);
  const conflict = others.find(r => Math.abs(new Date(r.scheduled_at).getTime() - newTime) < AGENT_CONFLICT_WINDOW_MS);
  if (!conflict) return null;

  const otherTimes = others.map(r => new Date(r.scheduled_at).getTime());
  const dayEnd = new Date(`${dayIso}T23:59:59`).getTime();
  let suggestedAt: string | null = null;
  for (let candidate = newTime; candidate <= dayEnd; candidate += AGENT_CONFLICT_WINDOW_MS) {
    if (!otherTimes.some(t => Math.abs(t - candidate) < AGENT_CONFLICT_WINDOW_MS)) {
      suggestedAt = new Date(candidate).toISOString();
      break;
    }
  }
  return { conflictingLeadName: conflict.lead_name, conflictingAt: conflict.scheduled_at, suggestedAt };
}

/** Builds the full "already scheduled, try this instead" error message, shared by every scheduling popup. */
export function agentConflictMessage(conflict: AgentScheduleConflict): string {
  const base = `You already have "${conflict.conflictingLeadName}" scheduled ${formatFollowupWhen(conflict.conflictingAt)}.`;
  if (conflict.suggestedAt) return `${base} Try ${formatFollowupWhen(conflict.suggestedAt)} instead.`;
  return `${base} Nothing's free the rest of today — try tomorrow.`;
}
