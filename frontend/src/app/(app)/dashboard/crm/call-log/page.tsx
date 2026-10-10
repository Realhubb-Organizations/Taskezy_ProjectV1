"use client";

import React, { useEffect, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { apiListCallLogPage, ApiCallLogRow } from "@/lib/apiClient";
import { syncDeviceCallLog } from "@/lib/callLogSync";
import { maskPhone } from "@/lib/maskPII";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";
import TablePagination from "@/components/ui/TablePagination";
import DateRangePicker, { DateRangeValue } from "@/components/ui/DateRangePicker";
import { DateTimeLines, dateTimeParts } from "@/components/ui/DateTimeLines";

const ROWS_PER_PAGE = 25;

// Neutral for a normal placed/received call; warn tone for one that never
// connected — matches the colored-pill convention used elsewhere in the app
// (see leadStatusMapping.ts's statusBadgeClasses).
function callTypeBadgeClasses(callType: string): string {
  switch (callType) {
    case "MISSED":
    case "REJECTED":
    case "BLOCKED":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

// A missed/rejected call has no real talk time, even if the device logged a
// non-zero ring duration — show "—" rather than a misleading "0m 0s".
function formatDuration(seconds: number, callType: string): string {
  if (seconds === 0 && (callType === "MISSED" || callType === "REJECTED")) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default function CallLogPage() {
  const { currentUser, activeRole } = useApp();
  const isAdmin = activeRole === "ADMIN";
  // Member only ever sees their own rows anyway (server-scoped) — an Agent
  // column that's always just their own name is noise, so it's Admin/
  // Manager only, same gating convention used throughout this session.
  const showAgentColumn = isAdmin || currentUser?.role_type === "Manager";

  const [rows, setRows] = useState<ApiCallLogRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [dateRange, setDateRange] = useState<DateRangeValue | null>(null);
  const [loading, setLoading] = useState(true);

  // Sync the device's call log exactly once, before the very first fetch —
  // so freshly-synced entries show up immediately instead of one page-load
  // behind. No-ops instantly on web. Later fetches (pagination, date filter)
  // skip the sync and just re-fetch.
  const didSyncRef = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!didSyncRef.current) {
        didSyncRef.current = true;
        await syncDeviceCallLog();
      }
      if (!active) return;
      setLoading(true);
      try {
        const res = await apiListCallLogPage(page, ROWS_PER_PAGE, { dateFrom: dateRange?.start, dateTo: dateRange?.end });
        if (!active) return;
        setRows(res.rows);
        setTotalCount(res.totalCount);
      } catch (err) {
        console.warn("Could not load call log:", err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [page, dateRange]);

  const colCount = 5 + (showAgentColumn ? 1 : 0);

  return (
    <div className="space-y-4 pb-8 animate-fade-in text-slate-800">
      <div className="bg-slate-100/70 border border-slate-200/60 rounded-2xl shadow-sm p-4 flex items-center gap-3">
        <span className="text-xs font-bold text-slate-600 shrink-0">Date Range</span>
        <DateRangePicker
          value={dateRange}
          onChange={(v) => { setDateRange(v); setPage(1); }}
        />
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-bold">Date</th>
                {showAgentColumn && <th className="px-5 py-3 font-bold">Agent</th>}
                <th className="px-5 py-3 font-bold">Phone Number</th>
                <th className="px-5 py-3 font-bold">Lead</th>
                <th className="px-5 py-3 font-bold">Type</th>
                <th className="px-5 py-3 font-bold">Duration</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableRowsSkeleton rows={8} columns={colCount} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-5 py-8 text-center text-slate-400 italic">
                    No call log entries found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const { date, time } = dateTimeParts(row.callDate);
                  const showRealPhone = isAdmin || row.userId === currentUser?.id;
                  return (
                    <tr key={row.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50">
                      <td className="px-5 py-3.5 whitespace-nowrap"><DateTimeLines date={date} time={time} /></td>
                      {showAgentColumn && <td className="px-5 py-3.5 font-semibold text-slate-700">{row.userName}</td>}
                      <td className="px-5 py-3.5 tabular-nums">{showRealPhone ? row.phoneNumber : maskPhone(row.phoneNumber)}</td>
                      <td className="px-5 py-3.5">{row.leadName || <span className="text-slate-400">—</span>}</td>
                      <td className="px-5 py-3.5">
                        <span className={`border rounded-lg px-2 py-0.5 text-[11px] font-semibold ${callTypeBadgeClasses(row.callType)}`}>
                          {row.callType}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 tabular-nums">{formatDuration(row.durationSeconds, row.callType)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          totalRows={totalCount}
          page={page}
          rowsPerPage={ROWS_PER_PAGE}
          onPageChange={setPage}
          rowLabel="Call"
        />
      </div>
    </div>
  );
}
