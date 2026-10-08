"use client";

import React, { useRef, useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { DateRangeValue, RangeCalendarPanel, formatDisplayDate, todayIso, triggerClass } from "@/components/ui/DateRangePicker";

// The "Date Range" control used on the CRM Dashboard, Leads, Campaigns and
// Data Calling pages. One click opens a single panel: the page's quick
// presets (Today, This Week, …) beside the calendar. Picking a preset applies
// it immediately; picking dates and pressing Apply sets a custom range and
// the trigger shows "dd-mm-yyyy To dd-mm-yyyy".

export const CUSTOM_OPTION_LABEL = "Custom";

export default function DateRangeSelect<T extends string>({
  options,
  value,
  customValue,
  customRange,
  onPresetChange,
  onCustomApply,
  maxDate = todayIso(),
  className
}: {
  /** The page's presets, without Custom. */
  options: { value: T; label: string }[];
  value: T;
  /** The page's own value that means "custom range" (e.g. "custom", "Custom"). */
  customValue: T;
  customRange: DateRangeValue | null;
  onPresetChange: (v: T) => void;
  /** Called on Apply — the page should store the range and set its value to customValue. */
  onCustomApply: (range: DateRangeValue) => void;
  maxDate?: string;
  /** @deprecated kept for existing callers; the control is always the toolbar button. */
  variant?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const presets = options.filter(o => o.value !== customValue);
  const isCustom = value === customValue && !!customRange;
  const label = isCustom
    ? `${formatDisplayDate(customRange!.start)} To ${formatDisplayDate(customRange!.end)}`
    : presets.find(o => o.value === value)?.label ?? CUSTOM_OPTION_LABEL;

  return (
    <span className={`inline-flex ${className ?? ""}`}>
      <button ref={anchorRef} type="button" onClick={() => setOpen(o => !o)} className={triggerClass}>
        <Calendar className="h-4 w-4 text-blue-600" />
        <span className="tabular-nums whitespace-nowrap">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <RangeCalendarPanel
          anchorRef={anchorRef}
          initial={isCustom ? customRange : null}
          maxDate={maxDate}
          presets={presets}
          activePreset={isCustom ? undefined : value}
          onPreset={(v) => { onPresetChange(v as T); setOpen(false); }}
          onApply={(range) => { onCustomApply(range); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}
