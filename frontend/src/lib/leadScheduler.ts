import { useState } from "react";
import { useApp, LeadStatus } from "@/context/AppContext";
import { apiUpdateLeadNote } from "@/lib/apiClient";
import { useDialog } from "@/components/ui/DialogProvider";
import { findOpenFollowup, formatFollowupWhen, findAgentScheduleConflict, agentConflictMessage, isTooCloseToExistingSchedule } from "@/lib/duplicateFollowupCheck";

// Shared by every status-change entry point (LeadDetailDrawer, the inline
// table-row dropdowns, Pending Tasks tables) and CallFeedbackGate's
// after-call popup, so they can't drift onto different status lists.
// REQUIRED: the popup always shows and date+time must be filled before the
// status actually changes. OPTIONAL: the popup still shows (the same
// useful "when's the next step" prompt), but date+time can be left blank —
// Save & Continue still changes the status either way.
export const SCHEDULER_REQUIRED_STATUSES: LeadStatus[] = ["RNR", "Call Back", "Followup", "EOI", "Site Visit Scheduled"];
export const SCHEDULER_OPTIONAL_STATUSES: LeadStatus[] = ["Low Budget", "Other requirement"];
// A lead sitting in one of these can have its next call booked straight
// from the lead details panel's Schedule Call ▾, without a status change.
export const CALL_SCHEDULE_STATUSES: LeadStatus[] = [
  "RNR", "Call Back", "Followup", "Site Visit Scheduled",
  "Site Visit Done", "Low Budget", "EOI", "Other requirement", "Different Location"
];

export interface PendingLeadSchedule {
  leadId: string;
  leadName: string;
  phone?: string;
  property?: string;
  assignedAgent?: string;
  status: LeadStatus;
  /** false for SCHEDULER_OPTIONAL_STATUSES — date/time can be left blank. */
  required: boolean;
  /** Booking a call only (Schedule Call ▾) — the status stays as it is. */
  scheduleOnly?: boolean;
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
  const { addNotification, addCalendarEvent, addFollowupCall, users } = useApp();
  const { confirm } = useDialog();
  const [pendingSchedule, setPendingSchedule] = useState<PendingLeadSchedule | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Every status changes straight away, no popup — the next call is booked
  // from the lead details panel's Schedule Call ▾ instead.
  const requestChange = (lead: SchedulableLead, status: LeadStatus) => {
    commit(lead.id, status);
  };

  const cancelSchedule = () => {
    if (submitting) return;
    setPendingSchedule(null);
    setError("");
  };

  type ScheduleInput = { date: string; time: string; note: string; rescheduleReason?: string };
  // Returns true once saved. `target` is the popup's pending lead, or a
  // Schedule Call ▾ booking (scheduleOnly) that never opens the popup.
  const runSchedule = async (target: PendingLeadSchedule, { date, time, note, rescheduleReason }: ScheduleInput): Promise<boolean> => {
    if (submitting) return false;
    // Validated once, reused below — LeadScheduleModal's own date/time
    // inputs should always produce a real date, but CallFeedbackGate's
    // equivalent check already guards this defensively and this one didn't.
    let scheduledAtIso: string | null = null;
    if (date && time) {
      const parsed = new Date(`${date}T${time}`);
      if (isNaN(parsed.getTime())) {
        setError("That date/time isn't valid. Please pick it again.");
        return false;
      }
      if (parsed.getTime() < Date.now()) {
        setError("The scheduled time must be in the future.");
        return false;
      }
      scheduledAtIso = parsed.toISOString();
    }
    setSubmitting(true);
    setError("");
    try {
      // An agent can't be on two calls at once — block the whole save
      // (status included) if the picked time is within 5 minutes of
      // another lead's already-scheduled follow-up for this same agent.
      if (scheduledAtIso) {
        const ownerId = users.find(u => u.name === target.assignedAgent)?.id;
        if (ownerId) {
          const conflict = await findAgentScheduleConflict(ownerId, scheduledAtIso, target.leadId);
          if (conflict) {
            setError(agentConflictMessage(conflict));
            return false;
          }
        }
      }
      if (!target.scheduleOnly) await commit(target.leadId, target.status);
      // Same Notes field the Notes column's pencil-edit and CallFeedbackGate's
      // own note field both write to (PATCH /leads/:id/notes, a straight
      // replace) — saved whenever something was typed, independent of
      // whether a reminder was also scheduled below. Previously this note
      // was only ever used as decoration inside the reminder notification's
      // message and the calendar event's description, never actually
      // persisted onto the lead itself — so the status changed but the
      // agent's comment never showed up anywhere a user would look for it.
      if (note.trim()) {
        await apiUpdateLeadNote(target.leadId, note.trim());
      }
      // Optional statuses can be submitted with no date/time at all — just
      // a status change with maybe a note, no reminder to schedule.
      if (scheduledAtIso) {
        // An agent or their manager working the same lead again shouldn't
        // silently stack up a second reminder on top of one that's already
        // open — today, tomorrow, next week, any date — ask first. "Keep
        // Existing" discards this pick entirely (no notification/calendar
        // event/follow-up created, the original stays untouched); the
        // status change and note above have already been saved either way.
        // Schedule Call ▾ is itself the deliberate change of an existing
        // booking, so it skips this ask (the new time replaces the old one).
        const existing = target.scheduleOnly ? null : await findOpenFollowup(target.leadId);
        if (existing) {
          const scheduleAgain = await confirm({
            title: "Already scheduled",
            message: `${target.leadName} already has a follow-up scheduled ${formatFollowupWhen(existing.scheduled_at)}. Schedule again, or keep the existing one?`,
            confirmLabel: "Schedule Again",
            cancelLabel: "Keep Existing"
          });
          if (!scheduleAgain) {
            setPendingSchedule(null);
            return false;
          }
          // Rescheduling the same lead is always allowed (no 5-minute rule
          // here, that's cross-lead only) — but picking the exact same
          // minute as the one just kept open is almost certainly a mistake.
          if (isTooCloseToExistingSchedule(scheduledAtIso, existing.scheduled_at)) {
            setError("Pick a time at least 1 minute apart from the existing schedule.");
            return false;
          }
        }
        const isSiteVisit = target.status === "Site Visit Scheduled";
        // Saved first — if it fails, no reminder or calendar entry is left behind.
        await addFollowupCall({
          scheduledAt: scheduledAtIso,
          leadId: target.leadId,
          leadName: target.leadName,
          phone: target.phone,
          callType: isSiteVisit ? "SITE_VISIT" : "CALLBACK",
          assignedToName: target.assignedAgent || "",
          rescheduleReason: isSiteVisit ? rescheduleReason : undefined,
          logActivity: target.scheduleOnly
        });
        addNotification({
          system: "CRM",
          category: "REMINDER",
          title: `${target.status} Reminder Set`,
          message: `${target.leadName} • ${date} at ${time}${note.trim() ? ` — ${note.trim()}` : ""}`,
          leadId: target.leadId
        });
        addCalendarEvent({
          system: "CRM",
          type: isSiteVisit ? "SITE_VISIT" : "FOLLOWUP",
          title: `${target.status} — ${target.leadName}`,
          date,
          time,
          description: note.trim() || target.property || "Property",
          leadId: target.leadId
        });
      }
      setPendingSchedule(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const confirmSchedule = async (input: ScheduleInput) => {
    if (pendingSchedule) await runSchedule(pendingSchedule, input);
  };

  // Schedule Call ▾: book the lead's next call, leaving its status unchanged.
  const scheduleCall = (lead: SchedulableLead, status: LeadStatus, at: { date: string; time: string; rescheduleReason?: string }) => {
    setError("");
    return runSchedule(
      { leadId: lead.id, leadName: lead.name, phone: lead.phone, property: lead.property, assignedAgent: lead.assignedAgent, status, required: true, scheduleOnly: true },
      { ...at, note: "" }
    );
  };

  return { requestChange, scheduleCall, pendingSchedule, cancelSchedule, confirmSchedule, submitting, error };
}
