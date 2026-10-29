"use client";

import React from "react";

export type TaskSource = "leads" | "dataCalling";

// Leads | Data Calling tabs over a task list — Data Calling = tasks on
// bulk-uploaded leads (task.isDataCalling), Leads = everything else.
export default function TaskSourceTabs({ value, onChange }: { value: TaskSource; onChange: (v: TaskSource) => void }) {
  return (
    <div className="flex items-end gap-6 mt-5">
      {([["leads", "Leads"], ["dataCalling", "Data Calling"]] as const).map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`pb-2 text-base font-extrabold border-b-2 transition-colors ${
            value === v ? "text-[#0B1E6E] border-[#0B1E6E]" : "text-slate-400 border-slate-200 hover:text-slate-600"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
