"use client";

import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MinusSquare, Search, SlidersHorizontal, X } from "lucide-react";
import TablePagination, { usePagination } from "@/components/ui/TablePagination";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";

// One per-project report card on the Marketing tab (Project-wise Lead Report,
// Project-wise Site Visits Report): title, Columns → Manage Columns panel,
// a search on the project column and pagination. The project column comes
// first and can be hidden like any other.

export interface ProjectReportColumn<R> {
  key: string;
  label: string;
  /** Name in Manage Columns, if different from the header. */
  menuLabel?: string;
  /** Starts hidden; listed on the right in Manage Columns. */
  extra?: boolean;
  render: (row: R) => React.ReactNode;
}

const NOT_SET = "Not set";
const PROJECT_KEY = "__project";

export default function ProjectReportTable<R extends { propertyId: string | null; propertyName: string | null }>({
  title,
  projectLabel,
  columns,
  rows,
  loading,
  resetKey,
  emptyText
}: {
  title: string;
  projectLabel: string;
  columns: ProjectReportColumn<R>[];
  rows: R[];
  loading: boolean;
  /** Changes when the page's filters change (back to page 1). */
  resetKey: string;
  emptyText: string;
}) {
  const allColumns = useMemo(
    () => [{ key: PROJECT_KEY, label: projectLabel, menuLabel: "Project", extra: false }, ...columns],
    [projectLabel, columns]
  );

  // ---- Project search (same look as the Leads page's Lead Name search) ----
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter(r => (r.propertyName ?? NOT_SET).toLowerCase().includes(q)) : rows;
  }, [rows, search]);
  const closeSearch = () => { setSearch(""); setSearchOpen(false); };
  const { pageRows, paginationProps } = usePagination(visibleRows, 100, `${resetKey}|${search}`);

  // ---- Manage Columns ----
  const [visible, setVisible] = useState<Record<string, boolean>>(() => Object.fromEntries(allColumns.map(c => [c.key, !c.extra])));
  const [columnsOpen, setColumnsOpen] = useState(false);
  const toggleColumn = (key: string) => setVisible(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleAll = () => {
    const allOn = allColumns.every(c => visible[c.key]);
    setVisible(Object.fromEntries(allColumns.map(c => [c.key, !allOn])));
  };
  const showProject = visible[PROJECT_KEY];
  const shownColumns = columns.filter(c => visible[c.key]);
  const colCount = Math.max(shownColumns.length + (showProject ? 1 : 0), 1);

  return (
    <div className="border border-slate-300 rounded-3xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 pb-3">
        <h3 className="ui-section-title">{title}</h3>
        <button type="button" onClick={() => setColumnsOpen(true)} className="ui-btn ui-btn-secondary border">
          <SlidersHorizontal className="h-4 w-4 text-blue-600" />
          Columns
        </button>
      </div>
      <div className="overflow-x-auto px-5 sm:px-6">
        {/* table-fixed: every column gets the same width, so the gaps match */}
        <table className="w-full table-fixed text-left border-collapse" style={{ minWidth: `${colCount * 140}px` }}>
          <thead>
            <tr className="border-b border-slate-200 text-xs font-bold text-slate-800">
              {showProject && (
                <th className="py-3 pr-4 whitespace-nowrap">
                  {searchOpen ? (
                    <div className="flex items-center gap-1 max-w-[200px]">
                      <input
                        autoFocus
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        // Stays open while it has text, so the filter keeps applying.
                        onBlur={() => { if (!search.trim()) closeSearch(); }}
                        placeholder="Search project..."
                        className="min-w-0 flex-1 bg-white border border-brand-400 rounded-md px-1.5 py-1 text-[11px] font-normal focus:outline-none"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={closeSearch}
                        className="text-slate-400 hover:text-slate-700 shrink-0"
                        title="Close search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      {projectLabel}
                      <button type="button" onClick={() => setSearchOpen(true)} className="text-slate-400 hover:text-brand-700" title="Search">
                        <Search className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </th>
              )}
              {shownColumns.map(c => <th key={c.key} className="py-3 pr-4">{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading && rows.length === 0 ? (
              <TableRowsSkeleton rows={4} columns={colCount} />
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="py-10 text-center text-xs text-slate-400 italic">
                  {search.trim() ? `No project matches "${search.trim()}".` : emptyText}
                </td>
              </tr>
            ) : (
              pageRows.map(r => (
                <tr key={r.propertyId ?? NOT_SET}>
                  {showProject && (
                    <td className={`py-3.5 pr-4 text-xs font-semibold [overflow-wrap:anywhere] ${r.propertyId ? "text-slate-800" : "text-slate-400"}`}>{r.propertyName ?? NOT_SET}</td>
                  )}
                  {shownColumns.map(c => <td key={c.key} className="py-3.5 pr-4 text-xs text-slate-700 tabular-nums">{c.render(r)}</td>)}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <TablePagination {...paginationProps} rowLabel="Row" />

      {columnsOpen && createPortal(
        <div className="fixed inset-0 z-[100]">
          <div className="fixed inset-0 bg-slate-900/25" onClick={() => setColumnsOpen(false)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl rounded-l-2xl flex flex-col animate-slide-in">
            <div className="flex items-center justify-end px-5 py-3 border-b border-slate-100 shrink-0">
              <button onClick={() => setColumnsOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="px-6 py-5 flex-1 overflow-y-auto">
              <h3 className="ui-title">Manage Columns</h3>
              <div className="flex items-center justify-between mt-5 mb-4">
                <span className="text-xs font-extrabold text-slate-800">Columns</span>
                <button type="button" onClick={toggleAll} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-[#0B1E6E]">
                  <MinusSquare className="h-4 w-4 text-slate-500" />
                  Select All
                </button>
              </div>
              {/* Left: the report's usual columns. Right: extra ones (hidden at first). */}
              <div className="grid grid-cols-2 gap-x-5">
                {[allColumns.filter(c => !c.extra), allColumns.filter(c => c.extra)].map((group, i) => (
                  <div key={i} className="space-y-3.5">
                    {group.map(c => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => toggleColumn(c.key)}
                        className={`w-full text-left pl-3 pr-2.5 py-2 text-xs rounded-md border transition-colors truncate ${
                          visible[c.key]
                            ? "border-slate-200 border-l-[3px] border-l-[#0B1E6E] font-semibold text-slate-900"
                            : "border-slate-200 font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {c.menuLabel ?? c.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
