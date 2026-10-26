"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock } from "lucide-react";
import { DatePicker } from "@/components/ui/DateRangePicker";
import { PendingLeadSchedule } from "@/lib/leadScheduler";

interface LeadScheduleModalProps {
  pending: PendingLeadSchedule;
  submitting: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (input: { date: string; time: string; note: string }) => void;
}

// Blocking popup for every SCHEDULER_REQUIRED_STATUSES status (RNR/Call
// Back/Followup/EOI/Site Visit Scheduled) — the status change doesn't
// commit until this is submitted, and date+time are mandatory. Also shown
// (same popup, same useful prompt) for SCHEDULER_OPTIONAL_STATUSES
// (Low Budget/Other requirement) — there date+time can be left blank;
// Save & Continue still changes the status either way, just skips
// creating a reminder if nothing was filled in.
export default function LeadScheduleModal({ pending, submitting, error, onCancel, onConfirm }: LeadScheduleModalProps) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending.required && (!date || !time)) {
      setLocalError("Please select both date and time.");
      return;
    }
    // Optional: either both or neither — picking just one is almost
    // certainly a mistake (a date with no time, or vice versa).
    if (!pending.required && (date || time) && !(date && time)) {
      setLocalError("Please select both date and time, or leave both blank.");
      return;
    }
    setLocalError("");
    onConfirm({ date, time, note });
  };

  const inputClass = "w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-brand-500";

  // z-[60], not the z-[9999] CallFeedbackGate uses — this modal contains the
  // custom DatePicker (@/components/ui/DateRangePicker), whose own
  // portaled dropdown panel tops out at z-[210] (by design, so it clears
  // "modals, drawers and scrolling tables" — see that file's own comment).
  // At z-9999 this modal's backdrop sat ON TOP of that panel instead,
  // making the calendar unopenable. Every other modal in this app (the
  // Lead Detail drawer, MetricDetailModal) already sits well under 200,
  // consistent with that design intent — this just matches them.
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 animate-fade-in">
        <div className="flex items-center gap-2.5">
          <span className="h-9 w-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
            <CalendarClock className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-slate-900">Schedule {pending.status}</h3>
            <p className="text-[11px] text-slate-500 truncate">{pending.leadName}</p>
          </div>
        </div>

        {(localError || error) && <p className="text-[11px] text-red-600 font-semibold">{localError || error}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Date{pending.required ? "" : " (optional)"}</label>
              <DatePicker value={date} onChange={setDate} className={inputClass} />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Time{pending.required ? "" : " (optional)"}</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-slate-500 uppercase">Note (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="What happened?" className={`${inputClass} font-normal resize-none`} />
          </div>
          <div className="flex gap-2.5">
            <button type="button" disabled={submitting} onClick={onCancel} className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 disabled:opacity-60">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex-1 bg-[#0B1E6E] hover:bg-[#081650] disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all">
              {submitting ? "Saving..." : "Save & Continue"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
