"use client";

import { useEffect, useState } from "react";
import { apiListLeadsPage, LeadListFilters } from "./apiClient";
import { Lead, mapApiLeadToFrontendLead } from "@/context/AppContext";
import { DEFAULT_ROWS_PER_PAGE_OPTIONS } from "@/components/ui/TablePagination";

/**
 * Real server-side pagination + debounced search for a filtered lead list
 * — replaces "receive a full pre-filtered Lead[] array, slice/search it
 * client-side" wherever a drill-down table's row count needs to genuinely
 * match its own headline number (a single capped fetch would silently
 * undercount any category/agent with more real rows than the server's
 * page-size cap). Built on the same GET /leads apiListLeadsPage already
 * uses for LeadDashboard.tsx's main table.
 */
export function useServerLeadList(
  filters: LeadListFilters,
  initialRowsPerPage = DEFAULT_ROWS_PER_PAGE_OPTIONS[0],
  /** False skips the fetch entirely (e.g. a lazily-opened KPI popup whose tab isn't the current one) — rows/totalCount just stay empty, no request fires. */
  enabled = true
) {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rows, setRows] = useState<Lead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // 350ms debounce — same convention LeadDashboard.tsx's admin Leads tab
  // search already uses.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const filtersKey = JSON.stringify(filters);
  // Any filter or search change starts back at page 1.
  useEffect(() => { setPage(1); }, [filtersKey, debouncedSearch]);

  useEffect(() => {
    if (!enabled) { setRows([]); setTotalCount(0); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    apiListLeadsPage(page, rowsPerPage, { ...filters, search: debouncedSearch || undefined })
      .then(result => {
        if (cancelled) return;
        setRows(result.rows.map(mapApiLeadToFrontendLead));
        setTotalCount(result.totalCount);
      })
      .catch(() => { if (!cancelled) { setRows([]); setTotalCount(0); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, debouncedSearch, page, rowsPerPage, enabled]);

  return {
    rows,
    totalCount,
    loading,
    page,
    setPage,
    rowsPerPage,
    setRowsPerPage,
    search,
    setSearch,
    /** Spread onto <TablePagination />. */
    paginationProps: {
      totalRows: totalCount,
      page,
      rowsPerPage,
      onPageChange: setPage,
      onRowsPerPageChange: setRowsPerPage
    }
  };
}
