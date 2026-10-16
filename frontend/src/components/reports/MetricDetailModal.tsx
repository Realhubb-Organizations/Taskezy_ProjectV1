"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Search, X } from "lucide-react";
import TablePagination from "@/components/ui/TablePagination";

export interface MetricDetailRow {
  key: string;
  /** One node per column, in the same order as `columns`. */
  cells: React.ReactNode[];
  /** Lead to open in the Lead Detail drawer when the row is clicked. */
  leadId?: string;
}

// Spreads straight onto <TablePagination /> — same shape
// useServerLeadList's paginationProps already returns.
export interface MetricDetailPaginationProps {
  totalRows: number;
  page: number;
  rowsPerPage: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange?: (rowsPerPage: number) => void;
}

interface MetricDetailModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  columns: string[];
  /** Just the current page's rows — pagination/search are controlled by the caller now (see search/onSearchChange/paginationProps), not computed here from a full in-memory list. */
  rows: MetricDetailRow[];
  loading?: boolean;
  search: string;
  onSearchChange: (query: string) => void;
  paginationProps: MetricDetailPaginationProps;
  emptyText: string;
  onRowClick?: (leadId: string) => void;
  rowLabel?: string;
}

// The list behind one of the agent report's KPI cards: centered card on
// desktop / bottom sheet on phones, with search + pagination.
// Sits below the Lead Detail drawer (z-50), so a clicked row opens the
// drawer on top and closing it comes straight back here.
export default function MetricDetailModal({
  open, onClose, title, subtitle, columns, rows, loading, search, onSearchChange, paginationProps, emptyText, onRowClick, rowLabel = "Lead"
}: MetricDetailModalProps) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) setClosing(false);
  }, [open, title]);

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 180);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Leave Esc to the drawer while it's open on top of this.
      if (e.key === "Escape" && !document.querySelector("[data-lead-drawer]")) close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[45] flex items-end sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div
        className={`absolute inset-0 bg-slate-900/40 ${closing ? "animate-metric-fade-out" : "animate-metric-fade-in"}`}
        onClick={close}
      />
      <div
        className={`relative w-full sm:max-w-3xl max-h-[88vh] sm:max-h-[80vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden ${closing ? "animate-metric-out" : "animate-metric-in"}`}
      >
        {/* Grab handle (phones) */}
        <div className="sm:hidden flex justify-center pt-2.5">
          <span className="h-1 w-10 rounded-full bg-slate-200" />
        </div>

        {/* Header — same plain style as the app's other popups */}
        <div className="px-5 sm:px-6 pt-4 sm:pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-extrabold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
            <button type="button" onClick={close} className="text-slate-400 hover:text-slate-700 p-1 -mr-1 shrink-0" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative mt-3">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search leads"
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 placeholder:text-slate-400 outline-none focus:border-[#0B1E6E] transition-colors"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto">
          {/* Phones: one card per row, column names as small labels */}
          <ul className="sm:hidden divide-y divide-slate-100">
            {rows.length === 0 ? (
              <li className="px-5 py-14 text-center text-xs text-slate-400 font-semibold">{loading ? "Loading..." : search ? `No results for "${search}".` : emptyText}</li>
            ) : (
              rows.map(r => {
                const clickable = !!(onRowClick && r.leadId);
                return (
                  <li
                    key={r.key}
                    onClick={clickable ? () => onRowClick!(r.leadId!) : undefined}
                    className={`px-5 py-3.5 flex items-center gap-3 text-xs ${clickable ? "cursor-pointer active:bg-slate-50" : ""}`}
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>{r.cells[0]}</div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                        {r.cells.slice(1).map((cell, i) => (
                          <div key={i} className="min-w-0">
                            <span className="block text-[10px] font-semibold text-slate-400">{columns[i + 1]}</span>
                            <div className="text-slate-600 [overflow-wrap:anywhere]">{cell}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {clickable && <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />}
                  </li>
                );
              })
            )}
          </ul>
          <table className="hidden sm:table w-full text-xs border-collapse" style={{ minWidth: columns.length * 130 }}>
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-200">
                {columns.map(c => (
                  <th key={c} className="px-5 sm:px-6 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">{c}</th>
                ))}
                {onRowClick && <th className="w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-6 py-14 text-center text-slate-400 font-semibold">
                    {loading ? "Loading..." : search ? `No results for "${search}".` : emptyText}
                  </td>
                </tr>
              ) : (
                rows.map(r => {
                  const clickable = !!(onRowClick && r.leadId);
                  return (
                    <tr
                      key={r.key}
                      onClick={clickable ? () => onRowClick!(r.leadId!) : undefined}
                      className={`group transition-colors ${clickable ? "cursor-pointer hover:bg-slate-50" : ""}`}
                    >
                      {r.cells.map((cell, i) => (
                        <td key={i} className="px-5 sm:px-6 py-3 text-slate-600 align-middle">{cell}</td>
                      ))}
                      {onRowClick && (
                        <td className="pr-4 text-slate-300">
                          {clickable && <ChevronRight className="h-4 w-4 group-hover:text-slate-500" />}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {paginationProps.totalRows > 0 && (
          <div className="border-t border-slate-100 pb-[env(safe-area-inset-bottom)]">
            <TablePagination {...paginationProps} rowLabel={rowLabel} />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
