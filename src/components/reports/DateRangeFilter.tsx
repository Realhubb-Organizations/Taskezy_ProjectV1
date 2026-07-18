"use client";

import React from "react";
import { CalendarRange } from "lucide-react";

export interface DateRange {
  from: string;
  to: string;
}

interface DateRangeFilterProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

const PRESETS: { label: string; from: () => string; to: () => string }[] = [
  { label: "Last 7 Days", from: () => daysAgo(7), to: todayStr },
  { label: "Last 14 Days", from: () => daysAgo(14), to: todayStr },
  { label: "Last 30 Days", from: () => daysAgo(30), to: todayStr },
  { label: "All Time", from: () => "2000-01-01", to: todayStr }
];

export default function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  return (
    <div className="glass-card p-4 rounded-xl flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 shrink-0">
        <CalendarRange className="h-4 w-4 text-brand-600" />
        Report Date Range
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={value.from}
          max={value.to}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
          className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 focus:outline-none focus:border-brand-500"
        />
        <span className="text-slate-400 text-xs">to</span>
        <input
          type="date"
          value={value.to}
          min={value.from}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
          className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 focus:outline-none focus:border-brand-500"
        />
      </div>

      <div className="flex flex-wrap gap-1.5 sm:ml-auto">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => onChange({ from: p.from(), to: p.to() })}
            className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-slate-50 border border-slate-200 text-slate-600 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
