"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useApp, Lead } from "@/context/AppContext";
import { useDialog } from "@/components/ui/DialogProvider";
import { DatePicker, todayIso } from "@/components/ui/DateRangePicker";
import { findOpenFollowup, formatFollowupWhen, findAgentScheduleConflict, agentConflictMessage, isTooCloseToExistingSchedule } from "@/lib/duplicateFollowupCheck";
import { CALL_SUB_STATUS_OPTIONS, CallSubStatus, callSubStatusOf } from "@/lib/callSubStatus";

// Data Calling's own, independent Call Status (migration 030) — completely
// separate from the main 14-value Lead Status. "Not Reachable" always
// requires picking a next-call date before it commits (same callback-
// scheduling mechanism the rest of the CRM uses via follow-ups); Connected
// and Called commit immediately, Qualification Status is auto-derived from
// which one was picked (see callStatusMapping.ts), never asked separately.
// Connected + Qualified promotes the lead out of Data Calling entirely (see
// updateCallStatus's source flip), so there's nothing further to pick here
// — the rest of its journey happens in the main CRM pipeline.
export const ROW_CALL_STATUS_OPTIONS: NonNullable<Lead["callStatus"]>[] = ["Connected", "Called", "Not Reachable", "Wrong Number"];

type CallStatusValue = NonNullable<Lead["callStatus"]>;

/** What the popup needs about the lead — a Data Calling page row or a Dashboard task. */
export type CallStatusLead = Pick<Lead, "id" | "name" | "callStatus" | "callSubStatus"> & { phone?: string; assignedAgent?: string };

/**
 * The Data Calling "Update Call Status" popup, shared by the Data Calling
 * page and the Dashboard's Data Calling tasks. Render `callStatusModal`
 * once; call `openCallStatusChange` from a row's call-status dropdown.
 */
export function useCallStatusUpdate() {
  const { users, updateCallStatus, addFollowupCall } = useApp();
  const { toast, confirm } = useDialog();

  // Every Call Status change opens this popup instead of committing straight
  // from the row: a note is always required, Sub-status (Qualified /
  // Unqualified) is optional and only shown for Connected, and Not
  // Reachable also needs the next call's date (scheduled via
  // addFollowupCall, same as Follow-up/Call Back elsewhere). Picking a
  // Sub-status from the table opens it too, with Connected preselected.
  const [callUpdate, setCallUpdate] = useState<{ leadId: string; leadName: string; phone?: string; assignedAgent?: string; callStatus: CallStatusValue; subStatus: CallSubStatus | null } | null>(null);
  const [callUpdateNote, setCallUpdateNote] = useState("");
  const [rnrDate, setRnrDate] = useState("");
  const [rnrTime, setRnrTime] = useState("10:00");
  const [pendingActionError, setPendingActionError] = useState<string | null>(null);
  const [callUpdateSaving, setCallUpdateSaving] = useState(false);

  const openCallStatusChange = (lead: CallStatusLead, callStatus: CallStatusValue, subStatus?: CallSubStatus) => {
    setPendingActionError(null);
    setCallUpdateNote("");
    setRnrDate("");
    setRnrTime("10:00");
    setCallUpdate({
      leadId: lead.id,
      leadName: lead.name,
      phone: lead.phone,
      assignedAgent: lead.assignedAgent,
      callStatus,
      subStatus: subStatus ?? (callStatus === "Connected" ? callSubStatusOf(lead) : null)
    });
  };

  const confirmCallUpdate = async () => {
    if (!callUpdate || callUpdateSaving) return;
    const note = callUpdateNote.trim();
    if (!note) return setPendingActionError("Please write a note.");
    const needsNextCall = callUpdate.callStatus === "Not Reachable";
    if (needsNextCall && !rnrDate) return setPendingActionError("Please select the next calling date.");
    let scheduledAtIso: string | null = null;
    if (needsNextCall) {
      const parsed = new Date(`${rnrDate}T${rnrTime}`);
      if (isNaN(parsed.getTime())) return setPendingActionError("That date/time isn't valid. Please pick it again.");
      if (parsed.getTime() < Date.now()) return setPendingActionError("The next calling time must be in the future.");
      scheduledAtIso = parsed.toISOString();
    }
    const lead = callUpdate;
    setCallUpdateSaving(true);
    setPendingActionError(null);
    try {
      // An agent can't be on two calls at once — block the whole save
      // (call status included) if the picked next-call time is within 5
      // minutes of another lead's already-scheduled follow-up for this
      // same agent.
      if (scheduledAtIso) {
        const ownerId = users.find(u => u.name === lead?.assignedAgent)?.id;
        if (ownerId) {
          const conflict = await findAgentScheduleConflict(ownerId, scheduledAtIso, callUpdate.leadId);
          if (conflict) {
            setPendingActionError(agentConflictMessage(conflict));
            return;
          }
        }
      }
      await updateCallStatus(
        callUpdate.leadId,
        callUpdate.callStatus,
        callUpdate.callStatus === "Connected" ? callUpdate.subStatus : null,
        note
      );
      if (needsNextCall) {
        // Same duplicate-schedule guard as CallFeedbackGate/the status
        // scheduler popup — don't silently stack a second reminder on top
        // of one that's already open, today or any future date. "Keep
        // Existing" skips creating a new follow-up; the call status/note
        // above are already saved either way.
        const existing = await findOpenFollowup(callUpdate.leadId);
        const scheduleAgain = existing
          ? await confirm({
              title: "Already scheduled",
              message: `${callUpdate.leadName} already has a follow-up scheduled ${formatFollowupWhen(existing.scheduled_at)}. Schedule again, or keep the existing one?`,
              confirmLabel: "Schedule Again",
              cancelLabel: "Keep Existing"
            })
          : true;
        if (existing && scheduleAgain && isTooCloseToExistingSchedule(scheduledAtIso!, existing.scheduled_at)) {
          return setPendingActionError("Pick a time at least 1 minute apart from the existing schedule.");
        }
        if (scheduleAgain) {
          addFollowupCall({
            scheduledAt: scheduledAtIso!,
            leadId: callUpdate.leadId,
            leadName: callUpdate.leadName,
            phone: lead?.phone,
            callType: "CALLBACK",
            assignedToName: lead?.assignedAgent || ""
          });
        }
      }
      toast(`${callUpdate.leadName}: call status saved.`, "success");
      setCallUpdate(null);
    } catch (err) {
      setPendingActionError(err instanceof Error ? err.message : "Could not save. Please try again.");
    } finally {
      setCallUpdateSaving(false);
    }
  };


  const callStatusModal = callUpdate && createPortal(
    <>
      <div className="fixed inset-0 bg-slate-900/40 z-[80]" onClick={() => !callUpdateSaving && setCallUpdate(null)} />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 pointer-events-auto">
          <h3 className="ui-title">Update Call Status</h3>
          <p className="ui-desc mt-1">
            {callUpdate.leadName} · <span className="font-semibold text-slate-700">{callUpdate.callStatus}</span>
          </p>

          <div className="mt-4 space-y-3">
            {/* Sub-status is shown only for Connected, and is optional —
                click the selected one again to clear it. */}
            {callUpdate.callStatus === "Connected" && (
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700">
                  Sub-status <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <div className="flex gap-2">
                  {CALL_SUB_STATUS_OPTIONS.map(o => {
                    const selected = callUpdate.subStatus === o;
                    return (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setCallUpdate(u => (u ? { ...u, subStatus: u.subStatus === o ? null : o } : u))}
                        className={`flex-1 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                          selected
                            ? o === "Qualified" ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-red-50 border-red-300 text-red-600"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-white"
                        }`}
                      >
                        {o}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {callUpdate.callStatus === "Not Reachable" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">Next Call Date</label>
                  <DatePicker
                    value={rnrDate}
                    minDate={todayIso()}
                    onChange={(v) => { setRnrDate(v); setPendingActionError(null); }}
                    className="w-full flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:bg-white focus:border-[#0B1E6E]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700">Time</label>
                  <input
                    type="time"
                    value={rnrTime}
                    onChange={(e) => setRnrTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:bg-white focus:border-[#0B1E6E]"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-700">Notes</label>
              <textarea
                value={callUpdateNote}
                onChange={(e) => { setCallUpdateNote(e.target.value); setPendingActionError(null); }}
                rows={3}
                maxLength={2000}
                placeholder="What happened on the call?"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:bg-white focus:border-[#0B1E6E] font-normal resize-none"
              />
            </div>

            {pendingActionError && <p className="text-[11px] text-red-600 font-semibold">{pendingActionError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={callUpdateSaving}
                onClick={() => setCallUpdate(null)}
                className="ui-btn ui-btn-secondary border disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={callUpdateSaving}
                onClick={confirmCallUpdate}
                className="ui-btn ui-btn-primary disabled:opacity-60"
              >
                {callUpdateSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );

  return { openCallStatusChange, callStatusModal };
}
