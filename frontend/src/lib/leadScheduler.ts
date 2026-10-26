import { useState } from "react";
import { useApp, LeadStatus } from "@/context/AppContext";

// Shared by every status-change entry point (LeadDetailDrawer, the inline
// table-row dropdowns, Pending Tasks tables) and CallFeedbackGate's
// after-call popup, so they can't drift onto different status lists.
// REQUIRED: the popup always shows and date+time must be filled before the
// status actually changes. OPTIONAL: the popup still shows (the same
// useful "when's the next step" prompt), but date+time can be left blank —
// Save & Continue still changes the status either way.
export const SCHEDULER_REQUIRED_STATUSES: LeadStatus[] = ["RNR", "Call Back", "Followup", "EOI", "Site Visit Scheduled"];
export const SCHEDULER_OPTIONAL_STATUSES: LeadStatus[] = ["Low Budget", "Other requirement"];

export interface PendingLeadSchedule {
  leadId: string;
  leadName: string;
  phone?: string;
  property?: string;
  assignedAgent?: string;
  status: LeadStatus;
  /** false for SCHEDULER_OPTIONAL_STATUSES — date/time can be left blank. */
  required: boolean;
}

interface SchedulableLead {
  id: string;
  name: string;
  phone?: string;
  property?: string;
  assignedAgent?: string;
}

/**
 * Gates the 4 SCHEDULER_REQUIRED_STATUSES behind a blocking popup (date,
 * time, notes) before the status actually changes — every other status
 * commits immediately, exactly as before. `commit` is whatever status-
 * update function the caller already has (already wraps its own side
 * effects — Booked's deal-value prompt, a table's local-row sync — none of
 * that is bypassed, this only decides WHEN commit runs).
 */
export function useLeadStatusScheduler(commit: (leadId: string, status: LeadStatus) => void | Promise<void>) {
  const { addNotification, addCalendarEvent, addFollowupCall } = useApp();
  const [pendingSchedule, setPendingSchedule] = useState<PendingLeadSchedule | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const requestChange = (lead: SchedulableLead, status: LeadStatus) => {
    const required = SCHEDULER_REQUIRED_STATUSES.includes(status);
    const optional = SCHEDULER_OPTIONAL_STATUSES.includes(status);
    if (required || optional) {
      setError("");
      setPendingSchedule({ leadId: lead.id, leadName: lead.name, phone: lead.phone, property: lead.property, assignedAgent: lead.assignedAgent, status, required });
      return;
    }
    commit(lead.id, status);
  };

  const cancelSchedule = () => {
    if (submitting) return;
    setPendingSchedule(null);
    setError("");
  };

  const confirmSchedule = async ({ date, time, note }: { date: string; time: string; note: string }) => {
    if (!pendingSchedule || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await commit(pendingSchedule.leadId, pendingSchedule.status);
      // Optional statuses can be submitted with no date/time at all — just
      // a status change with maybe a note, no reminder to schedule.
      if (date && time) {
        const isSiteVisit = pendingSchedule.status === "Site Visit Scheduled";
        addNotification({
          system: "CRM",
          category: "REMINDER",
          title: `${pendingSchedule.status} Reminder Set`,
          message: `${pendingSchedule.leadName} • ${date} at ${time}${note.trim() ? ` — ${note.trim()}` : ""}`,
          leadId: pendingSchedule.leadId
        });
        addCalendarEvent({
          system: "CRM",
          type: isSiteVisit ? "SITE_VISIT" : "FOLLOWUP",
          title: `${pendingSchedule.status} — ${pendingSchedule.leadName}`,
          date,
          time,
          description: note.trim() || pendingSchedule.property || "Property",
          leadId: pendingSchedule.leadId
        });
        addFollowupCall({
          scheduledAt: new Date(`${date}T${time}`).toISOString(),
          leadId: pendingSchedule.leadId,
          leadName: pendingSchedule.leadName,
          phone: pendingSchedule.phone,
          callType: isSiteVisit ? "SITE_VISIT" : "CALLBACK",
          assignedToName: pendingSchedule.assignedAgent || ""
        });
      }
      setPendingSchedule(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return { requestChange, pendingSchedule, cancelSchedule, confirmSchedule, submitting, error };
}
