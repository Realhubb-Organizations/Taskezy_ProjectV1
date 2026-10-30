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
