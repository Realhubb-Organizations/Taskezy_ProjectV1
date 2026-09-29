"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableDropdown";

// The one pagination footer used across CRM (every role):
//   "N Rows"  ·  Rows per page [10 ▾]  ·  a-b of N  ·  « ‹ 1 2 … 9 › »
// Controlled — the owner keeps page/rowsPerPage (usePagination below does
// that for the common case), so tables with extra behaviour on page change
// (e.g. scroll-synced pages) can pass their own onPageChange.

export const DEFAULT_ROWS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

// "Lead" → "Leads", "Property" → "Properties", "Activity" → "Activities".
const pluralize = (word: string) => (/[^aeiou]y$/i.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`);

// Page buttons to show: always first/last, the current page ±1, gaps as "…".
const pageItems = (current: number, total: number): (number | "gap")[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = Array.from(pages).filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
};

export default function TablePagination({
  totalRows,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  rowsPerPageOptions = DEFAULT_ROWS_PER_PAGE_OPTIONS,
  rowLabel = "Row",
  className = ""
}: {
  totalRows: number;
  page: number;
  rowsPerPage: number;
  onPageChange: (page: number) => void;
  /** Omit to hide the Rows per page picker. */
  onRowsPerPageChange?: (rowsPerPage: number) => void;
  rowsPerPageOptions?: number[];
  /** Singular noun for the total, e.g. "Lead" → "12 Leads". */
  rowLabel?: string;
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const current = Math.min(Math.max(1, page), totalPages);
  const rangeStart = totalRows === 0 ? 0 : (current - 1) * rowsPerPage + 1;
  const rangeEnd = Math.min(current * rowsPerPage, totalRows);
  const go = (p: number) => onPageChange(Math.min(Math.max(1, p), totalPages));

  const navBtn = "p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent";

  return (
    <div className={`px-5 py-3 flex flex-wrap justify-between items-center gap-3 border-t border-slate-100 text-[11px] text-slate-500 font-semibold ${className}`}>
      <span className="text-slate-800 font-bold">
        {totalRows} {totalRows === 1 ? rowLabel : pluralize(rowLabel)}
      </span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {onRowsPerPageChange && (
          <span className="flex items-center gap-1.5">
            Rows per page:
            <SearchableSelect
              variant="inline"
              options={rowsPerPageOptions.map(String)}
              value={String(rowsPerPage)}
              onChange={(v) => { onRowsPerPageChange(Number(v)); onPageChange(1); }}
              panelWidth={100}
              className="text-slate-700"
            />
          </span>
        )}
        <span className="tabular-nums">{rangeStart}-{rangeEnd} of {totalRows}</span>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={() => go(1)} disabled={current <= 1} className={navBtn} title="First page">
            <ChevronsLeft className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => go(current - 1)} disabled={current <= 1} className={navBtn} title="Previous page">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          {pageItems(current, totalPages).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-slate-400">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => go(p)}
                className={`min-w-[24px] h-6 px-1.5 rounded-md tabular-nums transition-colors ${
                  p === current ? "bg-[#0B1E6E] text-white font-bold" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {p}
              </button>
            )
          )}
          <button type="button" onClick={() => go(current + 1)} disabled={current >= totalPages} className={navBtn} title="Next page">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => go(totalPages)} disabled={current >= totalPages} className={navBtn} title="Last page">
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Page state + the current page's slice for a client-side list. Jumps back to
 * page 1 whenever `resetKey` changes (pass the active filters/search), and
 * clamps the page when the list shrinks.
 */
export function usePagination<T>(items: T[], initialRowsPerPage = DEFAULT_ROWS_PER_PAGE_OPTIONS[0], resetKey?: unknown) {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const totalPages = Math.max(1, Math.ceil(items.length / rowsPerPage));
  const current = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => items.slice((current - 1) * rowsPerPage, current * rowsPerPage),
    [items, current, rowsPerPage]
  );

  return {
    pageRows,
    page: current,
    setPage,
    rowsPerPage,
    setRowsPerPage,
    /** Spread onto <TablePagination />. */
    paginationProps: {
      totalRows: items.length,
      page: current,
      rowsPerPage,
      onPageChange: setPage,
      onRowsPerPageChange: setRowsPerPage
    }
  };
}
