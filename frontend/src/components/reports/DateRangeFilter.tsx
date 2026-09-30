"use client";

import React from "react";
import { CalendarRange } from "lucide-react";
import DateRangePicker from "@/components/ui/DateRangePicker";

export interface DateRange {
  from: string;
  to: string;
}

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

// Reports always have a range, so the shared calendar is used without the
// clear (×) control — the range can only be replaced, never removed.
export default function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  return (
    <div className="bg-slate-100/70 border border-slate-200/60 rounded-2xl shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 shrink-0">
        <CalendarRange className="h-4 w-4 text-brand-600" />
        Report Date Range
      </div>

      <DateRangePicker
        value={{ start: value.from, end: value.to }}
        onChange={(v) => { if (v) onChange({ from: v.start, to: v.end }); }}
        clearable={false}
      />
    </div>
  );
}
