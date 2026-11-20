"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Search } from "lucide-react";
import TablePagination from "@/components/ui/TablePagination";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";
import { apiStListBookings, StBooking, StBookingStage } from "@/lib/apiClient";
import {
  EmptyRow, FilterState, HeaderFilters, Lookups, PageCard, StageBadge, StatusHeaderFilter, TD, TH,
  amt, pctText, toApiFilters, useDebounced
} from "./stShared";

// The design's three — cancelled bookings still show in the list, just not as a filter option.
const STAGES: StBookingStage[] = ["IN_PROGRESS", "CLOSED", "PENDING"];

const COLS = 8;

const missingTypes = (b: StBooking) => (b.is_cancelled ? [] : b.brokerage_type.filter(t => !b.brokerages.some(x => x.type === t)));

/** 2026-11-17 / 15:51:07, in the viewer's own time. */
function lastUpdated(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  };
}

export default function BookingsTab({
  filters,
  onFiltersChange,
  lookups,
  refreshSignal,
  onExplore
}: {
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  lookups: Lookups;
  refreshSignal: number;
  onExplore: (bookingId: string) => void;
}) {
  const [rows, setRows] = useState<StBooking[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);

  const search = useDebounced(filters.search);
  const apiFilters = toApiFilters({ ...filters, search });
  const filterKey = JSON.stringify(apiFilters);

  useEffect(() => setPage(1), [filterKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    apiStListBookings(apiFilters, page, rowsPerPage)
      .then(res => {
        if (!active) return;
        setRows(res.rows);
        setTotalCount(res.totalCount);
      })
      .catch(err => {
        console.warn("Could not load bookings:", err);
        if (active) { setRows([]); setTotalCount(0); setLoadError(true); }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // filterKey stands for apiFilters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, rowsPerPage, refreshSignal, retry]);

  return (
    <PageCard title="All Bookings" right={<HeaderFilters value={filters} onChange={onFiltersChange} lookups={lookups} />}>
      <div className="flex items-center gap-2 max-w-xs">
        <Search className="h-4 w-4 text-slate-400 shrink-0" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder="Search lead, phone, unit..."
          className="w-full border-0 border-b border-slate-300 bg-transparent px-1 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0B1E6E]"
        />
      </div>

      <div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className={TH}>Lead Name</th>
                <th className={TH}>Property</th>
                <th className={TH}>Agreement Value</th>
                <th className={TH}>
                  <StatusHeaderFilter
                    label="Payment Status"
                    options={STAGES}
                    selected={filters.status}
                    onChange={(v) => onFiltersChange({ ...filters, status: v })}
                    renderBadge={(stage) => <StageBadge stage={stage} />}
                  />
                </th>
                <th className={TH}>Brokerage</th>
                <th className={TH}>Booking Date</th>
                <th className={TH}>Last Updated</th>
                <th className={TH} aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {loadError ? (
                <tr>
                  <td colSpan={COLS} className="p-8">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      <p className="text-xs font-semibold text-slate-600">Couldn&apos;t load bookings.</p>
                      <button type="button" onClick={() => setRetry(n => n + 1)} className="ui-btn ui-btn-primary">Retry</button>
                    </div>
                  </td>
                </tr>
              ) : loading ? (
                <TableRowsSkeleton rows={8} columns={COLS} />
              ) : rows.length === 0 ? (
                <EmptyRow cols={COLS} text="No bookings found." />
              ) : (
                rows.map(b => {
                  const missing = missingTypes(b);
                  const basic = b.brokerages.find(x => x.type === "BASIC");
                  const updated = lastUpdated(b.updated_at);
                  return (
                    <tr
                      key={b.booking_id}
                      onClick={() => onExplore(b.booking_id)}
                      className={`border-b border-slate-200 last:border-b-0 cursor-pointer ${
                        missing.length ? "bg-red-50/60 hover:bg-red-50" : "hover:bg-slate-50"
                      } ${b.is_cancelled ? "opacity-60" : ""}`}
                    >
                      <td className={TD}>
                        <p className="font-medium text-slate-900">{b.lead_name}</p>
                        {missing.length > 0 && <p className="text-[11px] font-semibold text-red-600 mt-0.5">Brokerage not added</p>}
                      </td>
                      <td className={TD}>{b.property_name}</td>
                      <td className={TD}>{amt(b.agreement_value)}</td>
                      <td className={TD}><StageBadge stage={b.stage} /></td>
                      <td className={TD}>{basic ? pctText(basic.percentage) : "—"}</td>
                      <td className={TD}>{b.booking_date}</td>
                      <td className={`${TD} leading-tight`}>
                        <span className="block">{updated.date}</span>
                        <span className="block text-slate-500">{updated.time}</span>
                      </td>
                      <td className={`${TD} text-right`}><ChevronRight className="h-3.5 w-3.5 text-slate-400 inline" /></td>
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
          rowsPerPage={rowsPerPage}
          onPageChange={setPage}
          onRowsPerPageChange={(n) => { setRowsPerPage(n); setPage(1); }}
          rowLabel="Booking"
        />
      </div>
    </PageCard>
  );
}
