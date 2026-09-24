"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, ChevronDown, Copy, Check, X } from "lucide-react";
import { Lead, FollowupCall, LeadStatus } from "@/context/AppContext";
import { STATUS_OPTIONS } from "@/lib/leadStatusMapping";
import { buildSalesPendingTasks, PendingTask, TaskBucket } from "@/lib/salesPendingTasks";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";
import { useCloseOnScroll } from "@/lib/useCloseOnScroll";

// Row colors per the sales-dashboard design: missed (no action taken),
// pending (due now — becomes missed if not acted on within 10 min),
// upcoming (not due yet).
const BUCKET_STYLES: Record<TaskBucket, { row: string; dot: string; label: string }> = {
  missed: { row: "bg-[#FFECE5DE] border-[#F2C4B3]", dot: "border-[#E8906F]", label: "Missed" },
  pending: { row: "bg-[#FEFFE5] border-[#E4E79A]", dot: "border-[#C9CD3C]", label: "Pending" },
  upcoming: { row: "bg-[#E5F8FFBA] border-[#A9DDF2]", dot: "border-[#3FA9D6]", label: "Upcoming" }
};

const pad = (n: number) => String(n).padStart(2, "0");
const formatTaskDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const formatTaskClock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

// Sales-agent (Member) only — replaces the Pending Follow ups / Pending
// Call Backs tables on /crm/dashboard for that role. Admin and Manager
// views don't render this.
export default function SalesPendingTasksTable({
  leads,
  followupCalls,
  onViewLead,
  onStatusChange,
  isLoading = false
}: {
  leads: Lead[];
  followupCalls: FollowupCall[];
  onViewLead: (leadId: string) => void;
  onStatusChange: (leadId: string, status: LeadStatus) => void;
  isLoading?: boolean;
}) {
  // Buckets are time-based (pending → missed after 10 min), so re-evaluate
  // periodically rather than only when data changes.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [bucketFilter, setBucketFilter] = useState<TaskBucket | null>(null);
  const [statusMenuPos, setStatusMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ taskId: string; top: number; left: number } | null>(null);
  const [rowMenuSearch, setRowMenuSearch] = useState("");
  const [statusMenuSearch, setStatusMenuSearch] = useState("");
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);
  // Both menus are fixed-position portals — close them when the page or the
  // table scrolls rather than leaving them floating in place.
  useCloseOnScroll(!!statusMenuPos, () => setStatusMenuPos(null), statusMenuRef);
  useCloseOnScroll(!!rowMenu, () => setRowMenu(null), rowMenuRef);
  const [copied, setCopied] = useState<string | null>(null);

  const tasks = useMemo(() => buildSalesPendingTasks(leads, followupCalls, now), [leads, followupCalls, now]);
  const statusOptions = useMemo(() => Array.from(new Set(tasks.map(t => t.status))), [tasks]);
  const filteredStatusOptions = statusOptions.filter(o => o.toLowerCase().includes(statusMenuSearch.trim().toLowerCase()));

  const visibleTasks = tasks.filter(t => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || t.name.toLowerCase().includes(q) || t.phone.includes(q);
    const matchesStatus = statusFilter.length === 0 || statusFilter.includes(t.status);
    const matchesBucket = !bucketFilter || t.bucket === bucketFilter;
    return matchesSearch && matchesStatus && matchesBucket;
  });

  const bucketCounts = tasks.reduce<Record<TaskBucket, number>>(
    (acc, t) => ({ ...acc, [t.bucket]: acc[t.bucket] + 1 }),
    { missed: 0, pending: 0, upcoming: 0 }
  );

  const copy = (key: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {
      // Clipboard permission denied — not worth surfacing an error for.
    });
  };

  const renderStatusCell = (t: PendingTask) => {
    if (!t.leadId) return <span className="font-bold text-slate-900">{t.status}</span>;
    const isOpen = rowMenu?.taskId === t.id;
    const allOptions: string[] = STATUS_OPTIONS.includes(t.status as LeadStatus) ? STATUS_OPTIONS : [t.status, ...STATUS_OPTIONS];
    const query = rowMenuSearch.trim().toLowerCase();
    const options = query ? allOptions.filter(s => s.toLowerCase().includes(query)) : allOptions;
    return (
      <>
        <button
          type="button"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const panelWidth = 176;
            setRowMenuSearch("");
            setRowMenu(isOpen ? null : { taskId: t.id, top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8)) });
          }}
          className="inline-flex items-center gap-1 font-bold text-slate-900 hover:text-[#0B1E6E] max-w-full"
        >
          <span className="truncate">{t.status}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen && rowMenu && createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setRowMenu(null)} />
            <div ref={rowMenuRef} className="fixed z-[70] w-44 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden" style={{ top: rowMenu.top, left: rowMenu.left }}>
              <div className="p-1.5 border-b border-slate-100">
                <div className="relative">
                  <Search className="h-3 w-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    autoFocus
                    value={rowMenuSearch}
                    onChange={(e) => setRowMenuSearch(e.target.value)}
                    placeholder="Search status..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-6 pr-2 py-1 text-[11px] font-semibold text-slate-700 focus:outline-none focus:border-[#0B1E6E]"
                  />
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                {options.length === 0 ? (
                  <p className="px-3 py-2 text-[11px] text-slate-400 italic">No matching status</p>
                ) : (
                  options.map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => { onStatusChange(t.leadId!, st as LeadStatus); setRowMenu(null); }}
                      className={`w-full text-left px-3 py-1.5 text-xs font-semibold transition-colors ${
                        t.status === st ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {st}
                    </button>
                  ))
                )}
              </div>
            </div>
          </>,
          document.body
        )}
      </>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-md">
      <div className="px-5 pt-5 pb-3 flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-lg font-extrabold text-slate-900">Pending Tasks</h3>
        {/* Legend doubles as a filter — click a bucket to show only its
            tasks, click it again (or "All") to clear. */}
        <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
          {bucketFilter && (
            <button onClick={() => setBucketFilter(null)} className="px-2 py-1 rounded-md hover:bg-slate-100 hover:text-slate-800">
              All
            </button>
          )}
          {(Object.keys(BUCKET_STYLES) as TaskBucket[]).map(b => {
            const isActive = bucketFilter === b;
            return (
              <button
                key={b}
                onClick={() => setBucketFilter(prev => (prev === b ? null : b))}
                aria-pressed={isActive}
                className={`flex items-center gap-1 px-2 py-1 rounded-md border transition-colors ${
                  isActive ? `${BUCKET_STYLES[b].row} text-slate-900 font-bold` : "border-transparent hover:bg-slate-100 hover:text-slate-800"
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full border-[1.5px] bg-white ${BUCKET_STYLES[b].dot}`} />
                {BUCKET_STYLES[b].label}
                <span className="text-slate-400 font-semibold">({bucketCounts[b]})</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-auto max-h-[70vh] px-3 pb-3">
        <table className="w-full text-left table-fixed min-w-[860px] border-separate border-spacing-y-1.5">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[22%]" />
            <col className="w-[20%]" />
            <col className="w-[18%]" />
            <col className="w-[22%]" />
          </colgroup>
          {/* Header cells are sticky so the column labels stay in place while
              the task rows scroll underneath them. */}
          <thead>
            <tr className="text-xs font-bold text-slate-800">
              <th className="px-4 py-2.5 whitespace-nowrap border-b border-slate-200 sticky top-0 z-10 bg-white">Task Time</th>
              <th className="px-4 py-2.5 border-b border-slate-200 sticky top-0 z-10 bg-white">
                {searchOpen ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onBlur={() => { if (!search) setSearchOpen(false); }}
                      placeholder="Search name or phone..."
                      className="min-w-0 flex-1 bg-white border border-brand-400 rounded-md px-1.5 py-1 text-[11px] font-normal focus:outline-none"
                    />
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setSearch(""); setSearchOpen(false); }}
                      className="text-slate-400 hover:text-slate-700 shrink-0"
                      title="Close search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    Lead Name
                    <button onClick={() => setSearchOpen(true)} className="text-slate-400 hover:text-brand-700" title="Search">
                      <Search className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </th>
              <th className="px-4 py-2.5 whitespace-nowrap border-b border-slate-200 sticky top-0 z-10 bg-white">Email</th>
              <th className="px-4 py-2.5 border-b border-slate-200 sticky top-0 z-10 bg-white">
                <button
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setStatusMenuSearch("");
                    setStatusMenuPos(p => (p ? null : { top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - 208 - 8)) }));
                  }}
                  className="flex items-center gap-1.5 hover:text-brand-700 whitespace-nowrap"
                >
                  Status
                  <ChevronDown className="h-3 w-3" />
                  {statusFilter.length > 0 && (
                    <span className="text-[9px] bg-brand-50 text-brand-700 rounded-full px-1.5 py-0.5 font-bold">{statusFilter.length}</span>
                  )}
                </button>
                {statusMenuPos && createPortal(
                  <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setStatusMenuPos(null)} />
                    <div ref={statusMenuRef} className="fixed z-[70] w-52 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden" style={{ top: statusMenuPos.top, left: statusMenuPos.left }}>
                      <div className="p-1.5 border-b border-slate-100">
                        <div className="relative">
                          <Search className="h-3 w-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                          <input
                            autoFocus
                            value={statusMenuSearch}
                            onChange={(e) => setStatusMenuSearch(e.target.value)}
                            placeholder="Search status..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-6 pr-2 py-1 text-[11px] font-semibold text-slate-700 focus:outline-none focus:border-[#0B1E6E]"
                          />
                        </div>
                      </div>
                      <div className="max-h-56 overflow-y-auto py-1">
                      {statusOptions.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-400 italic font-normal">No data yet</p>
                      ) : filteredStatusOptions.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-400 italic font-normal">No matching status</p>
                      ) : (
                        filteredStatusOptions.map(opt => (
                          <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-xs font-normal text-slate-700 hover:bg-slate-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={statusFilter.includes(opt)}
                              onChange={() => setStatusFilter(f => (f.includes(opt) ? f.filter(v => v !== opt) : [...f, opt]))}
                            />
                            {opt}
                          </label>
                        ))
                      )}
                      </div>
                      {statusFilter.length > 0 && (
                        <div className="border-t border-slate-100 px-3 py-1.5 flex justify-between items-center text-[11px]">
                          <span className="text-slate-500 font-semibold">{statusFilter.length} selected</span>
                          <button onClick={() => setStatusFilter([])} className="font-bold text-blue-600 hover:underline">Clear</button>
                        </div>
                      )}
                    </div>
                  </>,
                  document.body
                )}
              </th>
              <th className="px-4 py-2.5 whitespace-nowrap border-b border-slate-200 sticky top-0 z-10 bg-white">Feedback</th>
            </tr>
          </thead>
          <tbody className="text-xs">
            {isLoading && tasks.length === 0 ? (
              <TableRowsSkeleton rows={5} columns={5} />
            ) : visibleTasks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400 font-semibold italic">
                  {tasks.length === 0
                    ? "No pending tasks — you're all caught up."
                    : bucketFilter && bucketCounts[bucketFilter] === 0
                      ? `No ${BUCKET_STYLES[bucketFilter].label.toLowerCase()} tasks.`
                      : "No tasks match the current search/filters."}
                </td>
              </tr>
            ) : (
              visibleTasks.map(t => {
                const cell = `py-3.5 align-middle border-y ${BUCKET_STYLES[t.bucket].row}`;
                return (
                  <tr key={t.id}>
                    <td className={`${cell} px-4 border-l rounded-l-lg text-slate-700`}>
                      {t.dueAt ? (
                        <>
                          <span className="block">{formatTaskDate(t.dueAt)}</span>
                          <span className="block">{formatTaskClock(t.dueAt)}</span>
                        </>
                      ) : "—"}
                    </td>
                    <td className={`${cell} px-4 overflow-hidden`}>
                      {t.leadId ? (
                        <button onClick={() => onViewLead(t.leadId!)} className="font-bold text-slate-900 hover:underline text-left truncate block max-w-full" title={t.name}>
                          {t.name}
                        </button>
                      ) : (
                        <p className="font-bold text-slate-900 truncate" title={t.name}>{t.name}</p>
                      )}
                      {t.phone && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] text-slate-600 truncate">{t.phone}</span>
                          <button onClick={() => copy(`${t.id}-phone`, t.phone)} className="text-slate-400 hover:text-brand-700 shrink-0" title="Copy phone number">
                            {copied === `${t.id}-phone` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className={`${cell} px-4 overflow-hidden`}>
                      {t.email ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-700 truncate" title={t.email}>{t.email}</span>
                          <button onClick={() => copy(`${t.id}-email`, t.email)} className="text-slate-400 hover:text-brand-700 shrink-0" title="Copy email">
                            {copied === `${t.id}-email` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className={`${cell} px-4 overflow-hidden`}>{renderStatusCell(t)}</td>
                    <td className={`${cell} px-4 border-r rounded-r-lg text-slate-700`}>
                      <p className="line-clamp-2" title={t.feedback}>{t.feedback}</p>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
