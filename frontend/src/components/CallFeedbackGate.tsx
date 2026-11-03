"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { PhoneCall, MessageCircle, Check, X } from "lucide-react";
import { useApp, LeadStatus, Lead, mapApiLeadToFrontendLead } from "@/context/AppContext";
import { apiUpdateLeadStatus, apiUpdateCallStatus, apiUpdateLeadNote, apiGetLead, apiGetSiteVisitHistory } from "@/lib/apiClient";
import { nextStatusOptions, frontendStatusToDbCode } from "@/lib/leadStatusMapping";
import { CALL_SUB_STATUS_OPTIONS, CallSubStatus, callSubStatusOf } from "@/lib/callSubStatus";
import { SCHEDULER_REQUIRED_STATUSES } from "@/lib/leadScheduler";
import { findAgentScheduleConflict, agentConflictMessage } from "@/lib/duplicateFollowupCheck";

// Full-screen, unclosable overlay — the app stays mounted behind it but
// nothing in it can be reached (no backdrop-click, no Escape, and the
// Android hardware/gesture back button is intercepted) until the agent
// finishes it for the call/WhatsApp message they just made.
// Deliberately NOT built on DialogProvider's confirm/prompt (those are
// dismissable by design and shared by the whole app).
//
// Calls and WhatsApp work the same way, in two steps:
//   1. Did it happen? — "Did the call connect?" / "Did you send the
//      message?" — Yes, or No with a reason.
//   2. Update the lead's status (current one pre-selected, may be kept).
//      A Data Calling lead (source === "Bulk Upload" — matches
//      AppContext's own dataCallingLeads split, not just the presence of a
//      subSource label, which survives promotion) picks its own
//      independent Call Status (migration 030) instead of the main Lead
//      Status — Connected/Called/Not Reachable/Wrong Number, with
//      Qualification Status derived automatically, never asked here.
//      Every other lead picks from the real 14-value Lead Status list,
//      narrowed to what the transition matrix actually allows from its
//      current status (leadStatusMapping.ts's nextStatusOptions). RNR /
//      Call Back / Followup / Site Visit Scheduled (regular leads, see
//      leadScheduler.ts's SCHEDULER_REQUIRED_STATUSES) or Not Reachable
//      (Data Calling leads) need the next call's date and time after a
//      call (never after a WhatsApp message); Booked needs the deal value.
// The status and note are saved, then the attempt is closed — only then
// does the app unlock. Scheduling the next call happens on the backend's
// job queue afterward, not awaited here — see finish()'s own comment.

const CALL_NOT_CONNECTED_REASONS = ["No answer", "Switched off", "Busy", "Wrong number", "Other"];
const CALL_STATUS_OPTIONS = ["Connected", "Called", "Not Reachable", "Wrong Number"] as const;
// Same status list the status-change popup (LeadScheduleModal) gates on —
// kept in one place (leadScheduler.ts) so this and every other status-
// change entry point can't drift onto different lists.
const NEEDS_NEXT_CALL: LeadStatus[] = SCHEDULER_REQUIRED_STATUSES;

// How long a stuck feedback screen counts down before it closes and the
// feedback is held on the lead instead (see "Stuck screen" below).
const HOLD_AFTER_SECONDS = 5;

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function CallFeedbackGate() {
  const { pendingCallAttempt, submitCallFeedback, holdCallFeedbackOnLead, users } = useApp();
  const isWhatsApp = pendingCallAttempt?.channel === "WHATSAPP";

  // Fetched directly by id instead of scanning the bulk leads/dataCallingLeads
  // arrays — this overlay only ever needs the one lead the call attempt is for.
  const [lead, setLead] = useState<Lead | null>(null);
  // Doesn't block finishing — step 3 (closing the attempt) never actually
  // needs `lead`, only a note — but without this the status dropdown would
  // just silently render empty with no explanation, which looks exactly
  // like the stuck state this whole file exists to prevent.
  const [leadLoadFailed, setLeadLoadFailed] = useState(false);
  useEffect(() => {
    const leadId = pendingCallAttempt?.lead_id;
    if (!leadId) { setLead(null); return; }
    let cancelled = false;
    setLeadLoadFailed(false);
    apiGetLead(leadId)
      .then(row => { if (!cancelled) setLead(mapApiLeadToFrontendLead(row)); })
      .catch(() => { if (!cancelled) { setLead(null); setLeadLoadFailed(true); } });
    return () => { cancelled = true; };
  }, [pendingCallAttempt?.lead_id]);
  const isDataCallingLead = lead?.source === "Bulk Upload";

  // Regular leads: only what the transition matrix allows from the lead's
  // current status — mirrors LeadDetailDrawer, just without its separate
  // confirm-step for "Optional" picks (this form already has its own
  // explicit Save & Continue + inline error, and a stale pick here still
  // can't actually commit anything the backend wouldn't also reject).
  const statusOptions = useMemo(() => {
    if (!lead || isDataCallingLead) return [];
    const choices = nextStatusOptions(lead.status).map(c => c.status);
    return [lead.status, ...choices];
  }, [lead, isDataCallingLead]);

  // Has this lead had a site visit before? Then a new Site Visit Scheduled
  // date is a reschedule and we ask why (Reports → Team Reports). If the
  // check fails the field just doesn't show; it never blocks the save.
  const [hadSiteVisit, setHadSiteVisit] = useState(false);
  useEffect(() => {
    setHadSiteVisit(false);
    if (!lead?.id || isDataCallingLead) return;
    let cancelled = false;
    apiGetSiteVisitHistory(lead.id)
      .then(({ hadSiteVisit: had }) => { if (!cancelled) setHadSiteVisit(had); })
      .catch(() => { /* field stays hidden */ });
    return () => { cancelled = true; };
  }, [lead?.id, isDataCallingLead]);
  const [rescheduleReason, setRescheduleReason] = useState("");

  // Step 1: did it happen?
  const [step, setStep] = useState<"ask" | "reason" | "status">("ask");
  const [happened, setHappened] = useState(true);
  const [reason, setReason] = useState("");
  const [reasonText, setReasonText] = useState("");
  // Step 2: the lead's status (regular leads) or call status (Data Calling).
  const [status, setStatus] = useState<LeadStatus>("New Lead");
  const [callStatus, setCallStatus] = useState<"" | (typeof CALL_STATUS_OPTIONS)[number]>("");
  // Data Calling only: optional Qualified / Unqualified, shown only for Connected.
  const [callSubStatus, setCallSubStatus] = useState<CallSubStatus | null>(null);
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!pendingCallAttempt) return;
    setStep("ask");
    setHappened(true);
    setReason("");
    setReasonText("");
    setNextDate("");
    setNextTime("");
    setDealValue("");
    setNote("");
    setRescheduleReason("");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCallAttempt?.id]);

  // Pre-select the lead's current status/call status once it's known.
  useEffect(() => {
    if (lead) {
      setStatus(lead.status);
      setCallStatus(lead.callStatus ?? "");
      setCallSubStatus(callSubStatusOf(lead));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  // Android back button/gesture must not be able to dismiss this — only a
  // completed form clears pendingCallAttempt.
  useEffect(() => {
    if (!pendingCallAttempt || !Capacitor.isNativePlatform()) return;
    const handle = CapacitorApp.addListener("backButton", () => {
      // Deliberately a no-op: swallows the event instead of letting the
      // default (navigate back / exit app) happen.
    });
    return () => {
      handle.then((h) => h.remove());
    };
  }, [pendingCallAttempt]);

  // ---- Stuck screen ----
  // A click that never reaches this popup (something covering it), or a tap
  // on Save that's been "Saving…" for over 15s, is a dead click. After 3,
  // count down HOLD_AFTER_SECONDS; if nothing in the popup responds by then, free the
  // agent's app and hold this feedback on its lead instead (the server then
  // blocks only that lead until it's filled — feedbackLock.ts). Any click
  // the popup does handle cancels it.
  const overlayRef = useRef<HTMLDivElement>(null);
  const handledClicksRef = useRef(0);
  const deadClicksRef = useRef(0);
  const savingSinceRef = useRef<number | null>(null);
  const [holdIn, setHoldIn] = useState<number | null>(null);
  useEffect(() => { savingSinceRef.current = submitting ? Date.now() : null; }, [submitting]);
  useEffect(() => {
    deadClicksRef.current = 0;
    setHoldIn(null);
    if (!pendingCallAttempt) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target === overlayRef.current) return; // a tap on the dark background, not a stuck screen
      if (target?.closest("input, select, textarea, label")) return;
      const handledBefore = handledClicksRef.current;
      timers.push(setTimeout(() => {
        const stuckSaving = savingSinceRef.current !== null && Date.now() - savingSinceRef.current > 15_000;
        if (handledClicksRef.current !== handledBefore && !stuckSaving) {
          deadClicksRef.current = 0;
          setHoldIn(null);
          return;
        }
        deadClicksRef.current += 1;
        if (deadClicksRef.current >= 3) setHoldIn(prev => prev ?? HOLD_AFTER_SECONDS);
      }, 1500));
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      timers.forEach(clearTimeout);
    };
  }, [pendingCallAttempt?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (holdIn === null) return;
    if (holdIn <= 0) {
      // The "Call feedback pending" popup (PendingFeedbackPopup) takes over.
      holdCallFeedbackOnLead().catch(() => setHoldIn(null)); // offline: keep the popup
      return;
    }
    const t = setTimeout(() => setHoldIn(n => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [holdIn]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!pendingCallAttempt) return null;

  const notHappenedReason = () => (isWhatsApp ? reasonText.trim() : reason === "Other" ? reasonText.trim() : reason);

  const answerYes = () => { setHappened(true); setError(""); setStep("status"); };
  const answerNo = () => { setHappened(false); setError(""); setStep("reason"); };
  const confirmReason = () => {
    if (!notHappenedReason()) {
      setError(isWhatsApp || reason === "Other" ? "Please add a reason before continuing." : "Please pick a reason.");
      return;
    }
    setError("");
    setStep("status");
  };

  const statusChanged = !!lead && !isDataCallingLead && status !== lead.status;
  const nextCallSubStatus = callStatus === "Connected" ? callSubStatus : null;
  const callStatusChanged = !!lead && isDataCallingLead && callStatus !== "" &&
    (callStatus !== (lead.callStatus ?? "") || nextCallSubStatus !== callSubStatusOf(lead));
  // Regular leads: asked whenever the status IS one of these (not just
  // when it's CHANGING to one) — a repeat RNR call (still no answer,
  // status kept as RNR) still needs its own next-call date/time, or the
  // agent could keep calling the same lead with no follow-up ever
  // scheduled. Data Calling's own "Not Reachable" branch is unchanged
  // (narrower scope, not what was reported).
  // WhatsApp never asks for a next call: only a call is scheduled, and the
  // message doesn't make the lead Pending/Missed (tasks.routes.ts) or drop
  // a call that's already booked (keepSchedule below).
  const nextCallApplicable = !isWhatsApp && (isDataCallingLead
    ? callStatus === "Not Reachable" && callStatusChanged
    : NEEDS_NEXT_CALL.includes(status));
  const isSiteVisitReschedule = !isDataCallingLead && status === "Site Visit Scheduled" && hadSiteVisit;
  const needsDealValue = !isDataCallingLead && status === "Booked" && statusChanged;
  const somethingChanged = statusChanged || callStatusChanged;

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    let scheduledAt: Date | null = null;
    if (nextCallApplicable) {
      if (!nextDate || !nextTime) return setError("Pick the date and time of the next call.");
      scheduledAt = new Date(`${nextDate}T${nextTime}`);
      if (isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now()) return setError("The next call must be in the future.");
    }
    if (isSiteVisitReschedule && scheduledAt && !rescheduleReason.trim()) return setError("Please add the reason for rescheduling the site visit.");
    const deal = needsDealValue ? parseFloat(dealValue.replace(/[^0-9.]/g, "")) : undefined;
    if (needsDealValue && (!deal || deal <= 0)) return setError("Enter the booking's deal value.");
    // Data Calling: a note is always required (it's saved as the lead's note).
    if (isDataCallingLead && !note.trim()) return setError("Please add a note about the call.");
    if (!somethingChanged && !note.trim()) return setError("Status is unchanged — add a note about what happened.");

    setSubmitting(true);
    setError("");
    try {
      // 0. Same rule as the status popup: an agent can't be on two calls at
      // once, so a time within 5 minutes of another lead's scheduled call is
      // refused here, before anything is saved, with the nearest free time.
      // (Shown inline — never a dialog, which could open hidden behind this
      // popup.) If the check itself can't run, the save goes ahead.
      if (scheduledAt && lead) {
        const ownerId = lead.assignedAgentId ?? users.find(u => u.name === lead.assignedAgent)?.id;
        const conflict = ownerId ? await findAgentScheduleConflict(ownerId, scheduledAt.toISOString(), lead.id).catch(() => null) : null;
        if (conflict) {
          setError(agentConflictMessage(conflict));
          return;
        }
      }
      // 1. The lead's status (or call status) — must succeed before the app unlocks.
      if (lead && isDataCallingLead && callStatusChanged) {
        await apiUpdateCallStatus(lead.id, callStatus as (typeof CALL_STATUS_OPTIONS)[number], nextCallSubStatus, note.trim());
      } else if (lead && statusChanged) {
        const code = frontendStatusToDbCode(status);
        if (!code) throw new Error(`"${status}" can't be set here.`);
        await apiUpdateLeadStatus(lead.id, code, deal, isWhatsApp);
      }
      // 1b. Regular leads: this note also becomes the lead's actual Notes
      // field (same as the Notes column's pencil-edit), not just a line in
      // the call-attempt's own activity entry below — Data Calling already
      // did this as part of apiUpdateCallStatus above.
      if (lead && !isDataCallingLead && note.trim()) {
        await apiUpdateLeadNote(lead.id, note.trim());
      }
      // 2. Close the attempt (logged on the lead's timeline) — unlocks the
      // app immediately. Scheduling the next call (the conflict check +
      // actually creating the follow-up — previously awaited here, several
      // sequential round trips plus a confirm() dialog) now happens on the
      // backend's job queue instead, kicked off by passing scheduledAt
      // through to this same call — see call-attempts.routes.ts's PATCH
      // /:id and scheduleFollowupJob.ts. The agent isn't held waiting on
      // it. A clash with another lead's call is caught in step 0 above (inline,
      // never a dialog that could render invisibly underneath this popup).
      const outcome = isWhatsApp ? (happened ? "Sent" : "Not Sent") : happened ? "Connected" : "Not connected";
      const statusLine = isDataCallingLead
        ? callStatusChanged
          ? `Call status → ${callStatus}${nextCallSubStatus ? ` (${nextCallSubStatus})` : ""}`
          : `Call status kept: ${lead?.callStatus ?? "—"}`
        : statusChanged ? `Status → ${status}` : `Status kept: ${lead?.status ?? "—"}`;
      const parts = [!happened ? `Reason: ${notHappenedReason()}` : "", statusLine, note.trim()].filter(Boolean);
      await submitCallFeedback(
        outcome,
        parts.join(". ") || (isWhatsApp ? "Message sent via WhatsApp." : "Call completed."),
        scheduledAt?.toISOString(),
        isSiteVisitReschedule && scheduledAt ? rescheduleReason.trim() : undefined
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const title = step === "status"
    ? isDataCallingLead ? "Update the call status" : "Update the lead's status"
    : isWhatsApp ? "Did you send the WhatsApp message?" : "Did the call connect?";
  const inputClass = "w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-brand-500";

  return createPortal(
    <div ref={overlayRef} className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        onClickCapture={() => { handledClicksRef.current += 1; }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-6 space-y-4 animate-fade-in"
      >
        <div className="flex items-center gap-2.5">
          <span className="h-9 w-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
            {isWhatsApp ? <MessageCircle className="h-4.5 w-4.5" /> : <PhoneCall className="h-4.5 w-4.5" />}
          </span>
          <div className="min-w-0">
            <h3 className="ui-title">{title}</h3>
            {lead && (
              <p className="text-[11px] text-slate-500 truncate">
                {lead.name}
                {step === "status" ? ` · now: ${isDataCallingLead ? lead.callStatus ?? "Not called yet" : lead.status}` : ""}
              </p>
            )}
          </div>
        </div>

        {holdIn !== null && (
          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
            This screen isn&apos;t responding. It will close in {Math.max(holdIn, 0)}s. Then press Fill now to fill this feedback. You can&apos;t work on your leads until it&apos;s filled.
          </p>
        )}
        {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}

        {step === "ask" && (
          <div className="flex gap-2.5">
            <button type="button" onClick={answerYes} className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-all">
              <Check className="h-4 w-4" /> Yes
            </button>
            <button type="button" onClick={answerNo} className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-sm transition-all">
              <X className="h-4 w-4" /> No
            </button>
          </div>
        )}

        {step === "reason" && (
          <div className="space-y-3">
            {!isWhatsApp && (
              <div className="flex flex-wrap gap-1.5">
                {CALL_NOT_CONNECTED_REASONS.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => { setReason(r); setError(""); }}
                    className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${reason === r ? "bg-[#0B1E6E] border-[#0B1E6E] text-white" : "bg-white border-slate-200 text-slate-700"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
            {(isWhatsApp || reason === "Other") && (
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Why not?</label>
                <textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} rows={3} autoFocus maxLength={500} placeholder="What happened?" className={`${inputClass} font-normal resize-none`} />
              </div>
            )}
            <div className="flex gap-2.5">
              <button type="button" onClick={() => { setStep("ask"); setError(""); }} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100">Back</button>
              <button type="button" onClick={confirmReason} className="ui-btn ui-btn-primary flex-1">Next</button>
            </div>
          </div>
        )}

        {step === "status" && (
          <form onSubmit={finish} className="space-y-3">
            {leadLoadFailed && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                Could not load this lead&apos;s details. You can still add a note below and continue — status/scheduling can be updated later from the lead itself.
              </p>
            )}
            {isDataCallingLead ? (
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Call status</label>
                <select value={callStatus} onChange={(e) => { setCallStatus(e.target.value as (typeof CALL_STATUS_OPTIONS)[number]); setError(""); }} className={inputClass}>
                  <option value="" disabled>Not called yet</option>
                  {CALL_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ) : null}
            {isDataCallingLead && callStatus === "Connected" && (
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Sub-status (optional)</label>
                <div className="flex gap-2">
                  {CALL_SUB_STATUS_OPTIONS.map(o => {
                    const selected = callSubStatus === o;
                    return (
                      <button
                        key={o}
                        type="button"
                        onClick={() => { setCallSubStatus(cur => (cur === o ? null : o)); setError(""); }}
                        className={`flex-1 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                          selected
                            ? o === "Qualified" ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-red-50 border-red-300 text-red-600"
                            : "bg-slate-50 border-slate-200 text-slate-600"
                        }`}
                      >
                        {o}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {!isDataCallingLead && (
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Lead status</label>
                <select value={status} onChange={(e) => { setStatus(e.target.value as LeadStatus); setError(""); }} className={inputClass}>
                  {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {nextCallApplicable && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Next call date</label>
                  <input type="date" min={todayIso()} value={nextDate} onChange={(e) => setNextDate(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase">Time</label>
                  <input type="time" value={nextTime} onChange={(e) => setNextTime(e.target.value)} className={inputClass} />
                </div>
              </div>
            )}
            {isSiteVisitReschedule && (
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Reschedule reason</label>
                <input value={rescheduleReason} onChange={(e) => setRescheduleReason(e.target.value)} maxLength={500} placeholder="e.g. Out of station" className={`${inputClass} font-normal`} />
              </div>
            )}
            {needsDealValue && (
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Deal value (₹)</label>
                <input inputMode="decimal" value={dealValue} onChange={(e) => setDealValue(e.target.value)} placeholder="e.g. 8500000" className={inputClass} />
              </div>
            )}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Note {isDataCallingLead || !somethingChanged ? "(required)" : "(optional)"}</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="What happened?" className={`${inputClass} font-normal resize-none`} />
            </div>
            <div className="flex gap-2.5">
              <button type="button" disabled={submitting} onClick={() => { setStep(happened ? "ask" : "reason"); setError(""); }} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 disabled:opacity-60">Back</button>
              <button type="submit" disabled={submitting} className="ui-btn ui-btn-primary flex-1 disabled:opacity-60">
                {submitting ? "Saving..." : "Save & Continue"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
