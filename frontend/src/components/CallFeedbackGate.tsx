"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { PhoneCall, MessageCircle, Check, X } from "lucide-react";
import { useApp, LeadStatus } from "@/context/AppContext";
import { apiCreateFollowup, apiUpdateLeadStatus } from "@/lib/apiClient";
import { PICKABLE_STATUS_OPTIONS, frontendStatusToDbCode } from "@/lib/leadStatusMapping";

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
//      RNR / Call Back need the next call's date and time; Booked needs the
//      deal value; a Data Calling lead marked Connected needs Qualified /
//      Not Qualified.
// The status is saved first (and must succeed), then the next call is
// scheduled, then the attempt is closed — only then does the app unlock.

const CALL_NOT_CONNECTED_REASONS = ["No answer", "Switched off", "Busy", "Wrong number", "Other"];
// Data Calling leads use their own short pipeline (see data-calling/page.tsx).
const DATA_CALLING_STATUSES: LeadStatus[] = ["New Lead", "RNR", "Connected"];
const NEEDS_NEXT_CALL: LeadStatus[] = ["RNR", "Call Back"];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function CallFeedbackGate() {
  const { pendingCallAttempt, submitCallFeedback, leads, dataCallingLeads, users, currentUser } = useApp();
  const isWhatsApp = pendingCallAttempt?.channel === "WHATSAPP";

  const lead = useMemo(
    () => (pendingCallAttempt ? [...leads, ...dataCallingLeads].find(l => l.id === pendingCallAttempt.lead_id) ?? null : null),
    [pendingCallAttempt, leads, dataCallingLeads]
  );
  const isDataCallingLead = !!lead?.subSource;
  const statusOptions = useMemo(() => {
    const base = isDataCallingLead ? DATA_CALLING_STATUSES : PICKABLE_STATUS_OPTIONS;
    return lead && !base.includes(lead.status) ? [lead.status, ...base] : base;
  }, [isDataCallingLead, lead]);

  // Step 1: did it happen?
  const [step, setStep] = useState<"ask" | "reason" | "status">("ask");
  const [happened, setHappened] = useState(true);
  const [reason, setReason] = useState("");
  const [reasonText, setReasonText] = useState("");
  // Step 2: the lead's status.
  const [status, setStatus] = useState<LeadStatus>("New Lead");
  const [subStatus, setSubStatus] = useState<"" | "Qualified" | "Not Qualified">("");
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
    setSubStatus("");
    setNextDate("");
    setNextTime("");
    setDealValue("");
    setNote("");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCallAttempt?.id]);

  // Pre-select the lead's current status once it's known.
  useEffect(() => {
    if (lead) {
      setStatus(lead.status);
      setSubStatus(lead.subStatus ?? "");
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

  const statusChanged = !!lead && (status !== lead.status || (status === "Connected" && subStatus !== (lead.subStatus ?? "")));
  const needsNextCall = NEEDS_NEXT_CALL.includes(status) && statusChanged;
  const needsSubStatus = isDataCallingLead && status === "Connected";
  const needsDealValue = status === "Booked" && statusChanged;

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (needsSubStatus && !subStatus) return setError("Pick Qualified or Not Qualified.");
    let scheduledAt: Date | null = null;
    if (needsNextCall) {
      if (!nextDate || !nextTime) return setError("Pick the date and time of the next call.");
      scheduledAt = new Date(`${nextDate}T${nextTime}`);
      if (isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now()) return setError("The next call must be in the future.");
    }
    const deal = needsDealValue ? parseFloat(dealValue.replace(/[^0-9.]/g, "")) : undefined;
    if (needsDealValue && (!deal || deal <= 0)) return setError("Enter the booking's deal value.");
    if (!statusChanged && !note.trim()) return setError("Status is unchanged — add a note about what happened.");

    setSubmitting(true);
    setError("");
    try {
      // 1. The lead's status — must succeed before the app unlocks.
      if (lead && statusChanged) {
        const code = frontendStatusToDbCode(status);
        if (!code) throw new Error(`"${status}" can't be set here.`);
        await apiUpdateLeadStatus(lead.id, code, deal, needsSubStatus ? (subStatus || undefined) : undefined);
      }
      // 2. Next call — after the status change, which closes older pending follow-ups.
      if (lead && scheduledAt) {
        const ownerId = users.find(u => u.name === lead.assignedAgent)?.id ?? currentUser?.id;
        if (ownerId) {
          await apiCreateFollowup({ scheduledAt: scheduledAt.toISOString(), leadId: lead.id, leadName: lead.name, phone: lead.phone, callType: "CALLBACK", assignedToId: ownerId });
        }
      }
      // 3. Close the attempt (logged on the lead's timeline) — unlocks the app.
      const outcome = isWhatsApp ? (happened ? "Sent" : "Not Sent") : happened ? "Connected" : "Not connected";
      const parts = [
        !happened ? `Reason: ${notHappenedReason()}` : "",
        statusChanged ? `Status → ${status}${needsSubStatus && subStatus ? ` (${subStatus})` : ""}` : `Status kept: ${lead?.status ?? "—"}`,
        note.trim()
      ].filter(Boolean);
      await submitCallFeedback(outcome, parts.join(". ") || (isWhatsApp ? "Message sent via WhatsApp." : "Call completed."));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const title = step === "status"
    ? "Update the lead's status"
    : isWhatsApp ? "Did you send the WhatsApp message?" : "Did the call connect?";
  const inputClass = "w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-brand-500";

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-6 space-y-4 animate-fade-in">
        <div className="flex items-center gap-2.5">
          <span className="h-9 w-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
            {isWhatsApp ? <MessageCircle className="h-4.5 w-4.5" /> : <PhoneCall className="h-4.5 w-4.5" />}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
            {lead && <p className="text-[11px] text-slate-500 truncate">{lead.name}{step === "status" ? ` · now: ${lead.status}` : ""}</p>}
          </div>
        </div>

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
              <button type="button" onClick={confirmReason} className="flex-1 bg-[#0B1E6E] hover:bg-[#081650] text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all">Next</button>
            </div>
          </div>
        )}

        {step === "status" && (
          <form onSubmit={finish} className="space-y-3">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Lead status</label>
              <select value={status} onChange={(e) => { setStatus(e.target.value as LeadStatus); setError(""); }} className={inputClass}>
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {needsSubStatus && (
              <div className="flex gap-2">
                {(["Qualified", "Not Qualified"] as const).map(s => (
                  <button key={s} type="button" onClick={() => { setSubStatus(s); setError(""); }}
                    className={`flex-1 py-2 rounded-lg border text-xs font-bold ${subStatus === s ? "bg-[#0B1E6E] border-[#0B1E6E] text-white" : "bg-white border-slate-200 text-slate-700"}`}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {needsNextCall && (
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
            {needsDealValue && (
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Deal value (₹)</label>
                <input inputMode="decimal" value={dealValue} onChange={(e) => setDealValue(e.target.value)} placeholder="e.g. 8500000" className={inputClass} />
              </div>
            )}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Note {statusChanged ? "(optional)" : "(required)"}</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="What happened?" className={`${inputClass} font-normal resize-none`} />
            </div>
            <div className="flex gap-2.5">
              <button type="button" disabled={submitting} onClick={() => { setStep(happened ? "ask" : "reason"); setError(""); }} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 disabled:opacity-60">Back</button>
              <button type="submit" disabled={submitting} className="flex-1 bg-[#0B1E6E] hover:bg-[#081650] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all">
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
