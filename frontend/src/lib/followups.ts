import type { FollowupCall } from "@/context/AppContext";
import { TASK_GRACE_MS } from "@/lib/salesPendingTasks";

export interface NextFollowup {
  at: Date;
  /** Missed: past its time by more than the 10-minute window (red). */
  overdue: boolean;
  /** Due now: its time has come but it's still inside the 10-minute window (yellow). */
  due?: boolean;
}

/**
 * Next Call Date for a lead: its task time from the server (Taskezy-Server
 * tasks/taskDue.ts) — the same date and time Pending Tasks shows: due now
 * for its first 10 minutes (Pending there), then overdue (Missed there).
 * Null when the lead has no task.
 */
export function nextCallFor(lead: { taskDueAt?: string }, now = Date.now()): NextFollowup | null {
  if (!lead.taskDueAt) return null;
  const at = new Date(lead.taskDueAt);
  if (isNaN(at.getTime())) return null;
  const overdue = at.getTime() + TASK_GRACE_MS < now;
  return { at, overdue, due: !overdue && at.getTime() <= now };
}

// Exact time of a follow-up. Prefers the raw ISO timestamp; falls back to the
// display date ("YYYY-MM-DD") + time ("03:30 pm"), which `new Date()` can't parse as one string.
export function followupTime(f: FollowupCall): number {
  if (f.scheduledAt) {
    const t = new Date(f.scheduledAt).getTime();
    if (!isNaN(t)) return t;
  }
  const [y, m, d] = f.date.split("-").map(Number);
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(f.time.trim());
  if (!y || !m || !d || !match) return NaN;
  let hours = Number(match[1]) % 12;
  if (match[3]?.toLowerCase() === "pm") hours += 12;
  if (!match[3]) hours = Number(match[1]);
  return new Date(y, m - 1, d, hours, Number(match[2])).getTime();
}

// The follow-up to show for a lead: the most recent overdue one if any is
// pending past its time (or marked Missed), otherwise the soonest upcoming one.
export function nextFollowupFor(leadId: string, followupCalls: FollowupCall[], now = Date.now()): NextFollowup | null {
  const pending = followupCalls
    .filter(f => f.leadId === leadId && f.status !== "Completed")
    .map(f => ({ f, t: followupTime(f) }))
    .filter(x => !isNaN(x.t));

  const overdue = pending.filter(x => x.f.status === "Missed" || x.t < now).sort((a, b) => b.t - a.t);
  if (overdue.length > 0) return { at: new Date(overdue[0].t), overdue: true };

  const upcoming = pending.filter(x => x.t >= now).sort((a, b) => a.t - b.t);
  return upcoming.length > 0 ? { at: new Date(upcoming[0].t), overdue: false } : null;
}

export function formatFollowupDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatFollowupTime(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

/** One-line text version, e.g. for CSV export. */
export function formatNextFollowup(next: NextFollowup | null): string {
  if (!next) return "—";
  const text = `${formatFollowupDate(next.at)}, ${formatFollowupTime(next.at)}`;
  return next.overdue ? `Overdue: ${text}` : text;
}
