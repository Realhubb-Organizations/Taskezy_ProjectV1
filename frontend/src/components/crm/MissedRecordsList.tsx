"use client";

import React, { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { apiListMissedRecords, ApiMissedRecord, MissedRecordFilters } from "@/lib/apiClient";
import { dbCodeToFrontendStatus } from "@/lib/leadStatusMapping";
import { maskPhone } from "@/lib/maskPII";
import { DateTimeLines, dateTimeParts } from "@/components/ui/DateTimeLines";
import TablePagination, { DEFAULT_ROWS_PER_PAGE_OPTIONS } from "@/components/ui/TablePagination";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";
import { useLeadQuickView } from "./useLeadQuickView";

// A missed alert's leads exactly as they were when they were missed — the
// frozen missed_lead_records (migration 053), never their live data. Read
// only; clicking a row opens the live lead's details panel right here (the
// same panel as the Leads page) to work it.

const missLabel = (r: ApiMissedRecord) =>
  r.miss_type === "LEAD" ? "No reply in 20 min" : `Missed ${r.call_type ? r.call_type.replace("_", " ").toLowerCase() : "call"}`;

// A Data Calling lead's status is its call status.
const missedStatusLabel = (r: ApiMissedRecord) =>
  r.source === "Bulk Upload" ? (r.call_status || "Not called yet") : r.status_code ? dbCodeToFrontendStatus(r.status_code) : "—";

export default function MissedRecordsList({ title, filters, onClose }: {
  title: string;
  filters: MissedRecordFilters;
  onClose: () => void;
}) {
  const { activeRole } = useApp();
  const quickView = useLeadQuickView();
  const isAdmin = activeRole === "ADMIN";
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE_OPTIONS[0]);
  const [rows, setRows] = useState<ApiMissedRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const filtersKey = JSON.stringify(filters);
  useEffect(() => { setPage(1); }, [filtersKey]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiListMissedRecords(filters, page, rowsPerPage)
      .then(r => { if (!cancelled) { setRows(r.rows); setTotalCount(r.totalCount); } })
      .catch(() => { if (!cancelled) { setRows([]); setTotalCount(0); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // filtersKey stands for filters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, page, rowsPerPage]);

  const openLead = (leadId: string) => quickView.open(leadId);

  return (
    <div className="bg-white rounded-2xl shadow-md animate-fade-in">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="ui-title">{title}</h3>
          <p className="ui-desc mt-0.5">Each lead as it was when it was missed.</p>
        </div>
        <button onClick={onClose} className="text-[11px] font-bold text-slate-400 hover:text-slate-700 shrink-0">
          Close ✕
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1100px]">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-800">
              <th className="px-4 py-3 whitespace-nowrap">Lead Name</th>
              <th className="px-4 py-3 whitespace-nowrap">Missed At</th>
              <th className="px-4 py-3 whitespace-nowrap">Missed</th>
              <th className="px-4 py-3 whitespace-nowrap">Missed Status</th>
              <th className="px-4 py-3 whitespace-nowrap">Assigned To</th>
              <th className="px-4 py-3 whitespace-nowrap">Next Call Date</th>
              <th className="px-4 py-3 whitespace-nowrap">Feedback</th>
              <th className="px-4 py-3 whitespace-nowrap">Property</th>
              {isAdmin && <th className="px-4 py-3 whitespace-nowrap">Campaign</th>}
            </tr>
          </thead>
          <tbody className="text-xs">
            {loading ? (
              <TableRowsSkeleton rows={5} columns={isAdmin ? 9 : 8} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 9 : 8} className="px-4 py-8 text-center text-slate-400 italic">No missed leads for this notification.</td>
              </tr>
            ) : (
              rows.map(r => (
                <tr
                  key={r.id}
                  onClick={r.lead_id ? () => openLead(r.lead_id!) : undefined}
                  title={r.lead_id ? "Open this lead" : "This lead was deleted"}
                  className={`border-b border-slate-100 last:border-0 ${r.lead_id ? "cursor-pointer hover:bg-slate-50" : ""}`}
                >
                  <td className="px-4 py-3 align-top">
                    <p className="font-bold text-slate-900 [overflow-wrap:anywhere]">{r.lead_name}</p>
                    {r.lead_phone && <p className="text-[11px] text-slate-500 font-mono mt-0.5">{isAdmin ? r.lead_phone : maskPhone(r.lead_phone)}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 align-top"><DateTimeLines {...dateTimeParts(r.missed_at)} /></td>
                  <td className="px-4 py-3 text-slate-700 align-top">{missLabel(r)}</td>
                  <td className="px-4 py-3 text-slate-700 align-top">{missedStatusLabel(r)}</td>
                  <td className="px-4 py-3 text-slate-700 font-medium align-top">{r.agent_name || "Unassigned"}</td>
                  <td className="px-4 py-3 align-top">
                    {r.next_call_at ? (
                      <span className="block text-red-600">
                        <span className="block text-[10px] font-bold uppercase tracking-wide">Overdue</span>
                        <DateTimeLines {...dateTimeParts(r.next_call_at)} />
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 align-top"><div className="line-clamp-3 [overflow-wrap:anywhere]" title={r.feedback || undefined}>{r.feedback || "—"}</div></td>
                  <td className="px-4 py-3 text-slate-700 align-top">{r.property_name || "—"}</td>
                  {isAdmin && <td className="px-4 py-3 text-slate-700 align-top [overflow-wrap:anywhere]">{r.campaign || "—"}</td>}
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
        rowLabel="Missed lead"
      />
      {quickView.drawer}
    </div>
  );
}
