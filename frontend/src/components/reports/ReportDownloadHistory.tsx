"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { History, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import DateRangePicker from "@/components/ui/DateRangePicker";
import { SearchableMultiSelect } from "@/components/ui/SearchableDropdown";
import TablePagination from "@/components/ui/TablePagination";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";
import { DateTimeLines, dateTimeParts } from "@/components/ui/DateTimeLines";
import { isLeadAssignableUser } from "@/lib/leadAssignment";
import { apiListReportExportNames, apiListReportExports, type ReportExportFilters, type ReportExportRow } from "@/lib/apiClient";

// Reports → Download History (Admin only): who downloaded which report,
// when, how many rows and with which filters — from the record each
// Reports page download saves first (lib/csv.ts downloadReportCsv).

const filterLines = (filters: ReportExportFilters) =>
  Object.entries(filters)
    .filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);

export default function ReportDownloadHistory() {
  const { users } = useApp();
  const [open, setOpen] = useState(false);

  // ---- Filters ----
  const [userFilter, setUserFilter] = useState<string[]>([]);
  const [reportFilter, setReportFilter] = useState<string[]>([]);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [reportNames, setReportNames] = useState<string[]>([]);
  const userOptions = useMemo(
    () => users.filter(u => u.role === "ADMIN" || isLeadAssignableUser(u)).map(u => ({ value: u.id, label: u.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [users]
  );

  // ---- Rows ----
  const [rows, setRows] = useState<ReportExportRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify({ userFilter, reportFilter, range });
  useEffect(() => { setPage(1); }, [key]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    apiListReportExports(page, rowsPerPage, {
      userId: userFilter.length > 0 ? userFilter : undefined,
      report: reportFilter.length > 0 ? reportFilter : undefined,
      dateFrom: range?.start,
      dateTo: range?.end
    })
      .then(result => { if (!cancelled) { setRows(result.rows); setTotalCount(result.totalCount); } })
      .catch(() => { /* keep the last page on a transient failure */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // key covers the filters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, page, rowsPerPage]);
  useEffect(() => {
    if (!open) return;
    apiListReportExportNames().then(setReportNames).catch(() => { /* filter just stays empty */ });
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="ui-btn ui-btn-secondary border shrink-0">
        <History className="h-4 w-4 text-blue-600" />
        Download History
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[100]">
          <div className="fixed inset-0 bg-slate-900/25" onClick={() => setOpen(false)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-3xl bg-white border-l border-slate-200 shadow-2xl rounded-l-2xl flex flex-col animate-slide-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <h3 className="ui-title">Download History</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-slate-100 shrink-0">
              <SearchableMultiSelect variant="pill"
                label="Person"
                options={userOptions}
                selected={userFilter}
                onChange={setUserFilter}
                searchPlaceholder="Search people..."
                panelWidth={240}
              />
              <SearchableMultiSelect variant="pill"
                label="Report"
                options={reportNames}
                selected={reportFilter}
                onChange={setReportFilter}
                searchPlaceholder="Search reports..."
                panelWidth={360}
              />
              <DateRangePicker value={range} onChange={setRange} emptyLabel="All Dates" />
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[640px]">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200 font-bold text-slate-800">
                    <th className="px-6 py-3 whitespace-nowrap">Downloaded</th>
                    <th className="px-3 py-3 whitespace-nowrap">By</th>
                    <th className="px-3 py-3 whitespace-nowrap">Report</th>
                    <th className="px-3 py-3 whitespace-nowrap">Rows</th>
                    <th className="px-3 py-3 pr-6 whitespace-nowrap">Filters</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && rows.length === 0 ? (
                    <TableRowsSkeleton rows={5} columns={5} />
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">No report downloads yet.</td></tr>
                  ) : (
                    rows.map(r => (
                      <tr key={r.id} className="align-top text-slate-700">
                        <td className="px-6 py-3 text-slate-500 whitespace-nowrap"><DateTimeLines {...dateTimeParts(r.created_at)} /></td>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-slate-800">{r.user_name}</p>
                          {r.role && <p className="text-[10px] text-slate-400">{r.role}</p>}
                        </td>
                        <td className="px-3 py-3 [overflow-wrap:anywhere]">{r.report}</td>
                        <td className="px-3 py-3 tabular-nums">{r.row_count ?? "—"}</td>
                        <td className="px-3 py-3 pr-6 text-[11px] text-slate-500">
                          {filterLines(r.filters).map(line => <p key={line} className="[overflow-wrap:anywhere]">{line}</p>)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              totalRows={totalCount}
              page={page}
              rowsPerPage={rowsPerPage}
              onPageChange={setPage}
              onRowsPerPageChange={(n) => { setRowsPerPage(n); setPage(1); }}
              rowLabel="Download"
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
