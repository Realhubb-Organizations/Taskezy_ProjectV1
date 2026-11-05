import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { apiGetSiteVisitHistory } from "@/lib/apiClient";

// Schedule Call ▾ in the lead details panel: a small dropdown (same look as
// SearchableSelect's panel) with a date + time to book the lead's next call.
export default function NextCallDropdown({
  label,
  leadId,
  siteVisit,
  saving,
  error,
  onSave
}: {
  label: React.ReactNode;
  leadId: string;
  /** Lead is Site Visit Scheduled — moving an earlier visit needs a reason (same as LeadScheduleModal). */
  siteVisit: boolean;
  saving: boolean;
  error: string;
  /** Resolves true once saved — the dropdown then closes. */
  onSave: (at: { date: string; time: string; rescheduleReason?: string }) => Promise<boolean>;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [localError, setLocalError] = useState("");
  // Same rule as LeadScheduleModal: a lead that already had a site visit is
  // being rescheduled — ask why. If the check fails the field stays hidden.
  const [isReschedule, setIsReschedule] = useState(false);
  const [rescheduleReason, setRescheduleReason] = useState("");
  useEffect(() => {
    setIsReschedule(false);
    if (!siteVisit) return;
    let cancelled = false;
    apiGetSiteVisitHistory(leadId)
      .then(({ hadSiteVisit }) => { if (!cancelled) setIsReschedule(hadSiteVisit); })
      .catch(() => { /* field stays hidden */ });
    return () => { cancelled = true; };
  }, [leadId, siteVisit]);

  const open = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 240;
    setDate("");
    setTime("");
    setRescheduleReason("");
    setLocalError("");
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
  };
  const close = () => { if (!saving) setPos(null); };

  const save = async () => {
    if (!date || !time) return setLocalError("Pick a date and time.");
    if (isReschedule && !rescheduleReason.trim()) return setLocalError("Please add the reason for rescheduling the site visit.");
    setLocalError("");
    if (await onSave({ date, time, rescheduleReason: isReschedule ? rescheduleReason.trim() : undefined })) setPos(null);
  };

  const inputClass = "w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-brand-500";
  const shownError = localError || (pos ? error : "");

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        className="inline-flex items-center gap-1 max-w-full text-left text-xs font-semibold text-slate-800 hover:text-brand-700 focus:outline-none"
        title="Schedule the next call"
      >
        <span>{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {pos && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={close} />
          <div
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}
            className="fixed z-[210] w-[240px] bg-white border border-slate-200 rounded-xl shadow-lg p-3 space-y-2 text-left normal-case tracking-normal"
            style={{ top: pos.top, left: pos.left }}
          >
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
            </div>
            {isReschedule && (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Reschedule reason</label>
                <input value={rescheduleReason} onChange={(e) => setRescheduleReason(e.target.value)} maxLength={500} placeholder="e.g. Out of station" className={`${inputClass} font-normal`} />
              </div>
            )}
            {shownError && <p className="text-[11px] font-semibold text-red-600">{shownError}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={close} disabled={saving} className="ui-btn ui-btn-secondary border flex-1 disabled:opacity-60">Cancel</button>
              <button type="button" onClick={save} disabled={saving} className="ui-btn ui-btn-primary flex-1 disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
