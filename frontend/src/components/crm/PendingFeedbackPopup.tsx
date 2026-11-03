"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { PhoneCall } from "lucide-react";
import { useApp } from "@/context/AppContext";

/**
 * "Call feedback pending" — shown when this user owes call feedback that was
 * held after the feedback popup got stuck or was force-closed (Taskezy-Server
 * call-attempts/feedbackLock.ts). Same look as the feedback popup
 * (CallFeedbackGate). It can't be closed: until every pending feedback is
 * filled the agent can't use the app or work on any lead (the server refuses
 * lead actions too). The list lives on the server, so closing the app,
 * logging in again or reinstalling brings it straight back. "Fill now"
 * reopens that lead's feedback form.
 */
export default function PendingFeedbackPopup() {
  const { heldCallFeedback, openHeldCallFeedback, pendingCallAttempt } = useApp();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const showing = heldCallFeedback.length > 0 && !pendingCallAttempt;

  // The Android back button/gesture must not get around it either.
  useEffect(() => {
    if (!showing || !Capacitor.isNativePlatform()) return;
    const handle = CapacitorApp.addListener("backButton", () => { /* swallowed on purpose */ });
    return () => { handle.then(h => h.remove()); };
  }, [showing]);

  // A feedback popup already on screen comes first.
  if (!showing) return null;

  const fill = async (id: string) => {
    if (openingId) return;
    setOpeningId(id);
    setError("");
    try {
      await openHeldCallFeedback(id);
    } catch {
      setError("Couldn't open the feedback. Please try again.");
    } finally {
      setOpeningId(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-6 space-y-4 animate-fade-in">
        <div className="flex items-center gap-2.5">
          <span className="h-9 w-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
            <PhoneCall className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h3 className="ui-title">Call feedback pending</h3>
            <p className="text-[11px] text-slate-500 truncate">
              {heldCallFeedback.length === 1 ? heldCallFeedback[0].lead_name ?? "A lead" : `${heldCallFeedback.length} leads`}
            </p>
          </div>
        </div>

        <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2 font-semibold">
          Feedback is pending. Fill it to continue working on your leads.
        </p>
        {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}

        <div className="space-y-2">
          {heldCallFeedback.map(h => (
            <div key={h.id} className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{h.lead_name ?? "Lead"}</p>
                <p className="text-[10px] text-slate-400">
                  {h.channel === "WHATSAPP" ? "WhatsApp" : "Call"} · {new Date(h.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => fill(h.id)}
                disabled={!!openingId}
                className="ui-btn ui-btn-primary shrink-0 disabled:opacity-60"
              >
                {openingId === h.id ? "Opening…" : "Fill now"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
