"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { Lead, FollowupCall } from "@/context/AppContext";
import { buildSalesPendingTasks, TaskBucket } from "@/lib/salesPendingTasks";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";

type Tab = "all" | "pending";

// Which task buckets each tab counts (see salesPendingTasks.ts for the
// buckets themselves):
//   All Task     — every open task: upcoming + pending + missed
//   Pending Task — tasks already due with no action yet: pending + missed
const TAB_BUCKETS: Record<Tab, TaskBucket[]> = {
  all: ["upcoming", "pending", "missed"],
  pending: ["pending", "missed"]
};

const pad = (n: number) => String(n).padStart(2, "0");
const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

interface TeamRow {
  name: string;
  count: number;
  earliest: Date | null;
}

// Admin / Manager dashboard only — per-agent task counts across the team.
// The sales agent's own dashboard uses SalesPendingTasksTable instead.
export default function TeamTasksTable({
  leads,
  followupCalls,
  teamMembers,
  isLoading = false
}: {
  leads: Lead[];
  followupCalls: FollowupCall[];
  teamMembers: string[]; // active sales agents, so "Show team members with no tasks" can list them
  isLoading?: boolean;
}) {
  // Buckets are time-based, so re-evaluate periodically.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [tab, setTab] = useState<Tab>("all");
  const [taskType, setTaskType] = useState("All");
  const [typeMenuPos, setTypeMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [settingsPos, setSettingsPos] = useState<{ top: number; left: number } | null>(null);
  const [showIdleMembers, setShowIdleMembers] = useState(false);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const tasks = useMemo(() => buildSalesPendingTasks(leads, followupCalls, now), [leads, followupCalls, now]);
  const taskTypeOptions = useMemo(() => ["All", ...Array.from(new Set(tasks.map(t => t.taskType))).sort()], [tasks]);

  const rows = useMemo<TeamRow[]>(() => {
    const buckets = TAB_BUCKETS[tab];
    const byAgent = new Map<string, TeamRow>();
    const keyOf = (name: string) => name.trim().toLowerCase();

    if (showIdleMembers) {
      for (const name of teamMembers) byAgent.set(keyOf(name), { name, count: 0, earliest: null });
    }
    for (const t of tasks) {
      if (!buckets.includes(t.bucket)) continue;
      if (taskType !== "All" && t.taskType !== taskType) continue;
      const name = t.assignedTo || "Unassigned";
      const row = byAgent.get(keyOf(name)) || { name, count: 0, earliest: null };
      row.count += 1;
      if (t.dueAt && (!row.earliest || t.dueAt < row.earliest)) row.earliest = t.dueAt;
      byAgent.set(keyOf(name), row);
    }
    return Array.from(byAgent.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [tasks, tab, taskType, showIdleMembers, teamMembers]);

  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const rangeStart = rows.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const rangeEnd = Math.min(currentPage * rowsPerPage, rows.length);

  const openMenuAt = (e: React.MouseEvent<HTMLButtonElement>, width: number, align: "left" | "right") => {
    const rect = e.currentTarget.getBoundingClientRect();
    const left = align === "left" ? rect.left : rect.right - width;
    return { top: rect.bottom + 6, left: Math.max(8, Math.min(left, window.innerWidth - width - 8)) };
  };

  const tabs: { value: Tab; label: string }[] = [
    { value: "all", label: "All Task" },
    { value: "pending", label: "Pending Task" }
  ];

  return (
    <div className="bg-white rounded-2xl shadow-md">
      <div className="px-5 pt-4 flex items-end justify-between gap-3">
        <div className="flex items-end gap-6 border-b border-slate-200 flex-1 max-w-xl">
          {tabs.map(t => (
            <button
              key={t.value}
              onClick={() => { setTab(t.value); setPage(1); }}
              className={`pb-2 -mb-px text-base font-extrabold border-b-2 transition-colors ${
                tab === t.value ? "text-[#0B1E6E] border-[#0B1E6E]" : "text-slate-400 border-transparent hover:text-slate-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={(e) => { const pos = openMenuAt(e, 256, "right"); setSettingsPos(p => (p ? null : pos)); }}
          className="mb-1 inline-flex items-center gap-2 border border-slate-300 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 transition-colors"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-[#0B1E6E]" />
          Settings
        </button>
        {settingsPos && createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setSettingsPos(null)} />
            <div className="fixed z-[70] w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-3 space-y-2.5" style={{ top: settingsPos.top, left: settingsPos.left }}>
              <p className="text-[11px] font-extrabold text-slate-500">Table settings</p>
              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={showIdleMembers} onChange={(e) => { setShowIdleMembers(e.target.checked); setPage(1); }} />
                <span>Show team members with no tasks</span>
              </label>
            </div>
          </>,
          document.body
        )}
      </div>

      <div className="overflow-auto max-h-[60vh] px-5">
        <table className="w-full text-left table-fixed min-w-[640px]">
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[22%]" />
            <col className="w-[24%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead>
            <tr className="text-xs font-bold text-slate-800">
              <th className="px-4 py-3 border-b border-slate-200 sticky top-0 z-10 bg-white">Team</th>
              <th className="px-4 py-3 border-b border-slate-200 sticky top-0 z-10 bg-white">{tab === "all" ? "All Task" : "Pending Task"}</th>
              <th className="px-4 py-3 border-b border-slate-200 sticky top-0 z-10 bg-white">
                <button
                  onClick={(e) => { const pos = openMenuAt(e, 192, "left"); setTypeMenuPos(p => (p ? null : pos)); }}
                  className="flex items-center gap-1 hover:text-brand-700 whitespace-nowrap"
                >
                  Task Type
                  <ChevronDown className="h-3 w-3" />
                </button>
                {typeMenuPos && createPortal(
                  <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setTypeMenuPos(null)} />
                    <div className="fixed z-[70] w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 max-h-60 overflow-y-auto" style={{ top: typeMenuPos.top, left: typeMenuPos.left }}>
                      {taskTypeOptions.map(opt => (
                        <button
                          key={opt}
                          onClick={() => { setTaskType(opt); setPage(1); setTypeMenuPos(null); }}
                          className={`w-full text-left px-3 py-1.5 text-xs font-semibold transition-colors ${
                            taskType === opt ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </>,
                  document.body
                )}
              </th>
              <th className="px-4 py-3 border-b border-slate-200 sticky top-0 z-10 bg-white" title="Earliest task date in this agent's queue">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {isLoading && tasks.length === 0 ? (
              <TableRowsSkeleton rows={4} columns={4} />
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400 font-semibold italic">
                  {tab === "all" ? "No open tasks across the team." : "No overdue tasks — the team is all caught up."}
                </td>
              </tr>
            ) : (
              pageRows.map(r => (
                <tr key={r.name} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3.5 text-slate-800 font-medium truncate" title={r.name}>{r.name}</td>
                  <td className="px-4 py-3.5 text-slate-800 tabular-nums">{r.count}</td>
                  <td className="px-4 py-3.5 text-slate-800">{taskType}</td>
                  <td className="px-4 py-3.5 text-slate-800 tabular-nums">{r.earliest ? formatDate(r.earliest) : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 flex flex-wrap justify-between items-center gap-3 border-t border-slate-100 text-[11px] text-slate-500 font-semibold">
        <span className="text-slate-800 font-bold">{rows.length} Row{rows.length === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            Rows per page:
            <select
              value={rowsPerPage}
              onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
              className="bg-transparent font-bold text-slate-700 focus:outline-none"
            >
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </span>
          <span>{rangeStart}-{rangeEnd} of {rows.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
