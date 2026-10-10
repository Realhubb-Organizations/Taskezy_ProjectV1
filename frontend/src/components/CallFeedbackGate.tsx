"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { PhoneCall, MessageCircle, Check, X } from "lucide-react";
import { useApp } from "@/context/AppContext";

// Full-screen, unclosable overlay — the app stays mounted behind it but
// nothing in it can be reached (no backdrop-click, no Escape, and the
// Android hardware/gesture back button is intercepted) until the agent
// submits feedback for the call/WhatsApp message they just finished.
// Deliberately NOT built on DialogProvider's confirm/prompt (those are
// dismissable by design and shared by the whole app — repurposing them
// would make every other caller dismissable-or-not inconsistently).
// Mounted once at the root layout; see project_crm_role_based_lead_scoping
// memory (2026-10-10, call-feedback + WhatsApp-feedback rounds) for the
// full design.
const CALL_OUTCOMES = ["Connected", "No Answer", "Wrong Number", "Not Interested", "Call Back Later"];

export default function CallFeedbackGate() {
  const { pendingCallAttempt, submitCallFeedback } = useApp();
  const isWhatsApp = pendingCallAttempt?.channel === "WHATSAPP";

  const [outcome, setOutcome] = useState(CALL_OUTCOMES[0]);
  const [notes, setNotes] = useState("");
  // WhatsApp only: "ask" = Yes/No buttons, "reason" = the required
  // why-not text box shown after answering No.
  const [waStep, setWaStep] = useState<"ask" | "reason">("ask");
  const [waReason, setWaReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!pendingCallAttempt) return;
    setOutcome(CALL_OUTCOMES[0]);
    setNotes("");
    setWaStep("ask");
    setWaReason("");
    setError("");
  }, [pendingCallAttempt]);

  // Android back button/gesture must not be able to dismiss this — only a
  // submitted form clears pendingCallAttempt.
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

  const submit = async (finalOutcome: string, finalNotes: string) => {
    setSubmitting(true);
    setError("");
    try {
      await submitCallFeedback(finalOutcome, finalNotes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // "Sent" needs no typed note — the activity-log entry itself (who + when,
  // via the same attribution every log entry already gets) is the record
  // the user asked for; typing one would just be busywork for a yes answer.
  const handleWhatsAppSent = () => submit("Sent", "Message sent via WhatsApp.");

  const handleWhatsAppReasonSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waReason.trim()) {
      setError("Please add a reason before continuing.");
      return;
    }
    submit("Not Sent", waReason.trim());
  };

  const handleCallSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) {
      setError("Please add a note about this call before continuing.");
      return;
    }
    submit(outcome, notes.trim());
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-fade-in">
        <div className="flex items-center gap-2.5">
          <span className="h-9 w-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
            {isWhatsApp ? <MessageCircle className="h-4.5 w-4.5" /> : <PhoneCall className="h-4.5 w-4.5" />}
          </span>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              {isWhatsApp ? "Did you send the WhatsApp message?" : "Call finished"}
            </h3>
            {!isWhatsApp && <p className="text-[11px] text-slate-500">Log what happened before continuing.</p>}
          </div>
        </div>

        {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}

        {isWhatsApp ? (
          waStep === "ask" ? (
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={handleWhatsAppSent}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-all"
              >
                <Check className="h-4 w-4" /> Yes
              </button>
              <button
                type="button"
                onClick={() => setWaStep("reason")}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-sm transition-all"
              >
                <X className="h-4 w-4" /> No
              </button>
            </div>
          ) : (
            <form onSubmit={handleWhatsAppReasonSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Why not?</label>
                <textarea
                  value={waReason}
                  onChange={(e) => setWaReason(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="What happened?"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-brand-500 resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#0B1E6E] hover:bg-[#081650] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all"
              >
                {submitting ? "Submitting..." : "Submit & Continue"}
              </button>
            </form>
          )
        ) : (
          <form onSubmit={handleCallSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Outcome</label>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-brand-500"
              >
                {CALL_OUTCOMES.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="What happened on this call?"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-brand-500 resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-[#0B1E6E] hover:bg-[#081650] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all"
            >
              {submitting ? "Submitting..." : "Submit & Continue"}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
