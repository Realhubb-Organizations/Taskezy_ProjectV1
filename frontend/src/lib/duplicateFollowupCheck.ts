import { apiListFollowupsPage, ApiFollowupRow } from "@/lib/apiClient";
import { todayIso } from "@/components/ui/DateRangePicker";

/**
 * Checks whether a lead already has an open (UPCOMING) follow-up scheduled
 * for TODAY, before a new one is about to be created for it — shared by
 * every popup that can schedule a follow-up (CallFeedbackGate, the status
 * scheduler, Data Calling's inline Call Status popup), so an agent and
 * their manager calling/WhatsApp-ing the same lead on the same day don't
 * silently stack up duplicate reminders for it. Returns the existing row
 * (so its time can be shown in the "already scheduled" prompt), or null.
 */
export async function findTodaysOpenFollowup(leadId: string): Promise<ApiFollowupRow | null> {
  const today = todayIso();
  const { rows } = await apiListFollowupsPage(1, 1, {
    leadId: [leadId],
    status: ["UPCOMING"],
    dateFrom: today,
    dateTo: today
  });
  return rows[0] ?? null;
}

/** "3:30 PM" from an ISO scheduled_at timestamp, for the duplicate-schedule prompt's wording. */
export function formatFollowupTime(scheduledAt: string): string {
  return new Date(scheduledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
