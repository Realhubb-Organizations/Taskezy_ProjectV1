"use client";

import React, { useRef, useState } from "react";
import { SearchableSelect, DropdownVariant } from "@/components/ui/SearchableDropdown";
import { DateRangeValue, RangeCalendarPanel, formatDisplayDate, todayIso } from "@/components/ui/DateRangePicker";

// The "Date Range" preset dropdown used on the CRM Dashboard, Leads,
// Campaigns and Data Calling pages: the page's presets (Today, This Week, …)
// plus a "Custom" option that opens the shared calendar right under the
// dropdown. Apply → the page switches to its custom value with the picked
// range and the trigger shows "dd-mm-yyyy To dd-mm-yyyy"; Close → nothing
// changes (the previous preset stays).

export const CUSTOM_OPTION_LABEL = "Custom";

export default function DateRangeSelect<T extends string>({
  options,
  value,
  customValue,
  customRange,
  onPresetChange,
  onCustomApply,
  maxDate = todayIso(),
  variant = "pill",
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
  variant?: DropdownVariant;
  className?: string;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);

  const isCustom = value === customValue && !!customRange;
  const allOptions = [
    ...options.filter(o => o.value !== customValue),
    { value: customValue, label: CUSTOM_OPTION_LABEL }
  ];

  return (
    <span ref={anchorRef} className={`inline-flex ${className ?? ""}`}>
      <SearchableSelect
        variant={variant}
        options={allOptions}
        value={value}
        // Custom always (re)opens the calendar — even when it's already the
        // selection — so a new range can be picked.
        onChange={(v) => (v === customValue ? setCalendarOpen(true) : onPresetChange(v as T))}
        label={isCustom ? `${formatDisplayDate(customRange!.start)} To ${formatDisplayDate(customRange!.end)}` : undefined}
        panelWidth={180}
      />
      {calendarOpen && (
        <RangeCalendarPanel
          anchorRef={anchorRef}
          initial={isCustom ? customRange : null}
          maxDate={maxDate}
          onApply={(range) => { onCustomApply(range); setCalendarOpen(false); }}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </span>
  );
}
