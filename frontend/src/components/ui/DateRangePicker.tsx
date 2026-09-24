"use client";

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar } from "lucide-react";
import { useCloseOnScroll } from "@/lib/useCloseOnScroll";

export interface DateRangeValue {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

// Calendar button + Start/End date popover with Reset / Apply — the same
// look and behavior as the Campaigns page's date range picker, as a
// reusable component. `value` null means no range is applied.
export default function DateRangePicker({
  value,
  onChange,
  emptyLabel = "All Dates",
  heading = "Filter by date range"
}: {
  value: DateRangeValue | null;
  onChange: (v: DateRangeValue | null) => void;
  emptyLabel?: string;
  heading?: string;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [startDraft, setStartDraft] = useState("");
  const [endDraft, setEndDraft] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useCloseOnScroll(!!pos, () => setPos(null), panelRef);

  const canApply = !!startDraft && !!endDraft && endDraft >= startDraft;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          const rect = btnRef.current?.getBoundingClientRect();
          if (!rect) return;
          const panelWidth = 260;
          setStartDraft(value?.start || "");
          setEndDraft(value?.end || "");
          setPos(p => (p ? null : { top: rect.bottom + 6, left: Math.max(8, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 8)) }));
        }}
        className="flex items-center gap-2 bg-white border border-slate-300/80 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-medium shadow-2xs hover:bg-slate-50 transition-colors"
      >
        <Calendar className="h-3.5 w-3.5 text-blue-600" />
        <span>{value ? `${value.start} - ${value.end}` : emptyLabel}</span>
      </button>
      {pos && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setPos(null)} />
          <div
            ref={panelRef}
            className="fixed z-[70] w-64 max-w-[calc(100vw-1rem)] bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3"
            style={{ top: pos.top, left: pos.left }}
          >
            <p className="text-[11px] font-bold text-slate-700">{heading}</p>
            <div className="space-y-1.5">
              <label className="block text-[9px] font-bold text-slate-400 uppercase">Start Date</label>
              <input
                type="date"
                value={startDraft}
                onChange={(e) => {
                  setStartDraft(e.target.value);
                  if (endDraft && e.target.value && endDraft < e.target.value) setEndDraft("");
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0B1E6E]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[9px] font-bold text-slate-400 uppercase">End Date</label>
              <input
                type="date"
                value={endDraft}
                min={startDraft || undefined}
                onChange={(e) => setEndDraft(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0B1E6E]"
              />
              {startDraft && endDraft && endDraft < startDraft && (
                <p className="text-[10px] font-semibold text-red-500">End date can&apos;t be before the start date.</p>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { onChange(null); setPos(null); }}
                className="flex-1 bg-slate-100 text-slate-600 font-bold text-[11px] py-1.5 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => { if (!canApply) return; onChange({ start: startDraft, end: endDraft }); setPos(null); }}
                disabled={!canApply}
                className="flex-1 bg-[#0B1E6E] hover:bg-[#081650] text-white font-bold text-[11px] py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
