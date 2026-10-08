"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Minus, Sliders, X } from "lucide-react";
import { Lead, FollowupCall } from "@/context/AppContext";
import { buildSalesPendingTasks, TaskBucket } from "@/lib/salesPendingTasks";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";
import { SearchableMultiSelect } from "@/components/ui/SearchableDropdown";
import TablePagination from "@/components/ui/TablePagination";

export type TeamTaskTab = "all" | "pending";
type Tab = TeamTaskTab;

// Which task buckets each tab counts (see salesPendingTasks.ts for the
// buckets themselves):
//   All Task     — every open task: upcoming + pending + missed
//   Pending Task — tasks already due with no action yet: pending + missed
export const TAB_BUCKETS: Record<Tab, TaskBucket[]> = {
  all: ["upcoming", "pending", "missed"],
  pending: ["pending", "missed"]
};

const pad = (n: number) => String(n).padStart(2, "0");
const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Columns the Filter drawer can show/hide — same toggle pattern as the
// Campaigns page's Filter drawer.
type ColumnKey = "team" | "count" | "taskType" | "date";
const columnLabel = (key: ColumnKey, tab: Tab) =>
  ({ team: "Team", count: tab === "all" ? "All Task" : "Pending Task", taskType: "Task Type", date: "Date" })[key];
const COLUMN_KEYS: ColumnKey[] = ["team", "count", "taskType", "date"];

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
  tab,
  onTabChange,
  isLoading = false
}: {
  leads: Lead[];
  followupCalls: FollowupCall[];
  teamMembers: string[]; // active sales agents, so "Show team members with no tasks" can list them
  // Owned by the dashboard so TaskInsightsCharts below follows the same tab.
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  isLoading?: boolean;
}) {
  // Buckets are time-based, so re-evaluate periodically.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [taskTypes, setTaskTypes] = useState<string[]>([]); // empty = all task types
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>({ team: true, count: true, taskType: true, date: true });
  const [showIdleMembers, setShowIdleMembers] = useState(false);

  const shownColumns = COLUMN_KEYS.filter(k => visibleColumns[k]);
  const toggleColumn = (key: ColumnKey) => setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleSelectAllColumns = () => {
    const allOn = COLUMN_KEYS.every(k => visibleColumns[k]);
    setVisibleColumns({ team: !allOn, count: !allOn, taskType: !allOn, date: !allOn });
  };
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const tasks = useMemo(() => buildSalesPendingTasks(leads, followupCalls, now), [leads, followupCalls, now]);
  const taskTypeOptions = useMemo(() => Array.from(new Set(tasks.map(t => t.taskType))).sort(), [tasks]);
  const taskTypeLabel = taskTypes.length === 0 ? "All" : taskTypes.join(", ");

  const changeTaskTypes = (next: string[]) => {
    setTaskTypes(next);
    setPage(1);
  };

  // Task list link for one agent — carries the tab and every selected task type.
  const tasksHref = (agent: string) => {
    const params = new URLSearchParams({ agent, tab });
    for (const t of taskTypes) params.append("type", t);
    return `/crm/dashboard/tasks?${params.toString()}`;
  };

  const rows = useMemo<TeamRow[]>(() => {
    const buckets = TAB_BUCKETS[tab];
    const byAgent = new Map<string, TeamRow>();
    const keyOf = (name: string) => name.trim().toLowerCase();

    if (showIdleMembers) {
      for (const name of teamMembers) byAgent.set(keyOf(name), { name, count: 0, earliest: null });
    }
    for (const t of tasks) {
      if (!buckets.includes(t.bucket)) continue;
      if (taskTypes.length > 0 && !taskTypes.includes(t.taskType)) continue;
      const name = t.assignedTo || "Unassigned";
      const row = byAgent.get(keyOf(name)) || { name, count: 0, earliest: null };
      row.count += 1;
      if (t.dueAt && (!row.earliest || t.dueAt < row.earliest)) row.earliest = t.dueAt;
      byAgent.set(keyOf(name), row);
    }
    return Array.from(byAgent.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [tasks, tab, taskTypes, showIdleMembers, teamMembers]);

  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

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
              onClick={() => { onTabChange(t.value); setPage(1); }}
              className={`pb-2 -mb-px text-base font-extrabold border-b-2 transition-colors ${
                tab === t.value ? "text-[#0B1E6E] border-[#0B1E6E]" : "text-slate-400 border-transparent hover:text-slate-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Filter button → column-visibility drawer, same as the Campaigns page */}
        <button
          type="button"
          onClick={() => setIsFilterOpen(true)}
          className="mb-1 inline-flex items-center justify-center gap-2 h-9 px-3.5 border border-slate-300/80 bg-white rounded-xl text-xs text-slate-700 font-bold hover:bg-slate-50 shadow-2xs transition-colors"
        >
          <Sliders className="h-4 w-4 text-blue-600" />
          Filter
        </button>
        {/* Full-height right-docked drawer: no dark backdrop, closes on an
            invisible click-outside catcher (Campaigns page pattern). */}
        {isFilterOpen && createPortal(
          <div className="fixed inset-0 z-[100]">
            <div className="fixed inset-0" onClick={() => setIsFilterOpen(false)} />
            <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-slide-in">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
                <h3 className="text-base font-extrabold text-slate-900">Filter</h3>
                <button onClick={() => setIsFilterOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>
              <div className="px-5 py-5 flex-1 overflow-y-auto space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-extrabold text-slate-800">Columns</span>
                    <button
                      type="button"
                      onClick={toggleSelectAllColumns}
                      className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-[#0B1E6E]"
                    >
                      <Minus className="h-3 w-3" />
                      Select All
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {COLUMN_KEYS.map(key => {
                      const isOn = visibleColumns[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleColumn(key)}
                          className={`text-left pl-3 pr-2.5 py-2.5 text-xs rounded-lg border transition-colors truncate ${
                            isOn
                              ? "border-slate-200 border-l-[3px] border-l-[#0B1E6E] font-extrabold text-slate-900"
                              : "border-slate-200 font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {columnLabel(key, tab)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>

      <div className="overflow-auto max-h-[60vh] px-5">
        <table className="w-full text-left table-fixed border-collapse" style={{ minWidth: shownColumns.length * 150 }}>
          {/* Visible columns share the full table width equally */}
          <colgroup>
            {shownColumns.map(k => (
              <col key={k} />
            ))}
          </colgroup>
          <thead>
            <tr className="text-left text-xs font-bold text-slate-800">
              {visibleColumns.team && <th className="px-4 py-3 whitespace-nowrap border-b border-slate-200 sticky top-0 z-10 bg-white">Team</th>}
              {visibleColumns.count && <th className="px-4 py-3 whitespace-nowrap border-b border-slate-200 sticky top-0 z-10 bg-white">{columnLabel("count", tab)}</th>}
              {visibleColumns.taskType && <th className="px-4 py-3 whitespace-nowrap border-b border-slate-200 sticky top-0 z-10 bg-white">
                <SearchableMultiSelect
                  variant="inline"
                  label="Task Type"
                  options={taskTypeOptions}
                  selected={taskTypes}
                  onChange={changeTaskTypes}
                  searchPlaceholder="Search task type..."
                  panelWidth={220}
                />
              </th>}
              {visibleColumns.date && <th className="px-4 py-3 whitespace-nowrap border-b border-slate-200 sticky top-0 z-10 bg-white" title="Earliest task date in this agent's queue">Date</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {shownColumns.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-400 font-semibold italic">
                  All columns are hidden — turn some back on from Filter.
                </td>
              </tr>
            ) : isLoading && tasks.length === 0 ? (
              <TableRowsSkeleton rows={4} columns={shownColumns.length} />
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={shownColumns.length} className="px-4 py-8 text-center text-slate-400 font-semibold italic">
                  {tab === "all" ? "No open tasks across the team." : "No overdue tasks — the team is all caught up."}
                </td>
              </tr>
            ) : (
              pageRows.map(r => (
                <tr key={r.name} className="hover:bg-slate-50/60 transition-colors">
                  {visibleColumns.team && <td className="px-4 py-3 text-slate-800 font-medium [overflow-wrap:anywhere]" title={r.name}>{r.name}</td>}
                  {visibleColumns.count && <td className="px-4 py-3 text-slate-800 tabular-nums">
                    {/* Opens this member's task list — same tab + task type, so it lists exactly what was counted */}
                    {r.count > 0 ? (
                      <Link
                        href={tasksHref(r.name)}
                        className="font-bold text-[#0B1E6E] hover:underline"
                        title={`View ${r.name}'s tasks`}
                      >
                        {r.count}
                      </Link>
                    ) : r.count}
                  </td>}
                  {visibleColumns.taskType && <td className="px-4 py-3 text-slate-800 [overflow-wrap:anywhere]" title={taskTypeLabel}>{taskTypeLabel}</td>}
                  {visibleColumns.date && <td className="px-4 py-3 text-slate-800 tabular-nums">{r.earliest ? formatDate(r.earliest) : "—"}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <TablePagination
        totalRows={rows.length}
        page={currentPage}
        rowsPerPage={rowsPerPage}
        onPageChange={setPage}
        onRowsPerPageChange={setRowsPerPage}
        rowLabel="Member"
      />
    </div>
  );
}
