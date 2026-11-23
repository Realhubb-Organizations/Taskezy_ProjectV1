"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import TablePagination from "@/components/ui/TablePagination";
import { LineSkeleton, TableRowsSkeleton } from "@/components/ui/Skeletons";
import { apiStListBookings, apiStListOverdue, apiStSummary, StBooking, StFilters, StOverdueRow, StSummary } from "@/lib/apiClient";
import {
  EmptyRow, FilterState, HeaderFilters, Lookups, MonthSelect, PageCard, StageBadge, TD, TH, TableCard,
  amt, inr, num, pctText, toApiFilters
} from "./stShared";

// --- Booking-level figures shown in the Overview tables -------------------

/** The booking's Basic brokerage % — what the design's "Brokerage" column shows. */
const basicPct = (b: StBooking) => {
  const basic = b.brokerages.find(x => x.type === "BASIC");
  return basic ? pctText(basic.percentage) : "—";
};
const outstanding = (b: StBooking) => Math.max(0, num(b.total_brokerage) - num(b.received));

interface Column {
  label: string;
  cell: (b: StBooking) => React.ReactNode;
}

const C = {
  lead: { label: "Lead Name", cell: (b: StBooking) => <span className="font-medium text-slate-900">{b.lead_name}</span> },
  phone: { label: "Phone Number", cell: (b: StBooking) => b.lead_phone_number },
  property: { label: "Property Purchased", cell: (b: StBooking) => b.property_name },
  agreement: { label: "Agreement Value", cell: (b: StBooking) => amt(b.agreement_value) },
  bookingDate: { label: "Booking Date", cell: (b: StBooking) => b.booking_date },
  cashback: { label: "Cashback", cell: (b: StBooking) => (b.cashback ? amt(b.cashback_amount) : "No") },
  pct: { label: "Brokerage Percentage", cell: basicPct },
  value: { label: "Brokerage Value", cell: (b: StBooking) => amt(b.total_brokerage) },
  received: { label: "Brokerage Received", cell: (b: StBooking) => <span className="text-green-700">{amt(b.received)}</span> },
  outstanding: { label: "Brokerage Outstanding", cell: (b: StBooking) => <span className="text-red-600">{amt(outstanding(b))}</span> },
  invoiced: { label: "Invoice Raised", cell: (b: StBooking) => <span className="text-amber-600">{amt(b.invoiced)}</span> }
};

type CardKey = keyof StSummary;

/** Each card: its number, its colour, and the table it opens (columns from Bhavuk's notes). */
const CARDS: { key: CardKey; label: string; color: string; money: boolean; status: string[]; columns: Column[] }[] = [
  {
    key: "totalBookings", label: "Total Bookings", color: "text-slate-900", money: false,
    status: ["PENDING", "IN_PROGRESS", "CLOSED"],
    columns: [C.lead, C.phone, C.property, C.agreement, C.bookingDate, C.cashback]
  },
  {
    key: "totalBrokerage", label: "Total Brokerage", color: "text-blue-500", money: true,
    status: ["HAS_BROKERAGE"],
    columns: [C.lead, C.property, C.agreement, C.pct, C.value, C.bookingDate]
  },
  {
    key: "received", label: "Received", color: "text-green-700", money: true,
    status: ["HAS_RECEIVED"],
    columns: [C.lead, C.property, C.agreement, C.pct, C.value, C.received, C.outstanding, C.bookingDate]
  },
  {
    key: "outstanding", label: "Outstanding", color: "text-red-600", money: true,
    status: ["HAS_OUTSTANDING"],
    columns: [C.lead, C.property, C.agreement, C.pct, C.value, C.received, C.outstanding, C.bookingDate]
  },
  {
    key: "invoiceRaised", label: "Invoice Raised", color: "text-amber-500", money: true,
    status: ["HAS_INVOICE"],
    columns: [C.lead, C.property, C.agreement, C.pct, C.value, C.received, C.outstanding, C.invoiced, C.bookingDate]
  }
];

const RECENT_COLUMNS: Column[] = [
  { label: "Lead Name", cell: C.lead.cell },
  { label: "Property", cell: (b) => b.property_name },
  C.agreement,
  { label: "Payment Status", cell: (b) => <StageBadge stage={b.stage} /> },
  { label: "Brokerage", cell: basicPct },
  C.bookingDate
];

// --- A paged list that reloads when its inputs change -----------------------

function usePaged<T>(load: (page: number, size: number) => Promise<{ rows: T[]; totalCount: number }>, key: string, refreshSignal: number) {
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => setPage(1), [key]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    load(page, size)
      .then(r => { if (active) { setRows(r.rows); setTotal(r.totalCount); } })
      .catch(err => { console.warn("Could not load Sales Tracker list:", err); if (active) { setRows([]); setTotal(0); setError(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // key stands for everything `load` closes over
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page, size, refreshSignal, retry]);

  return { rows, total, page, setPage, size, setSize, loading, error, retry: () => setRetry(n => n + 1) };
}

function ErrorRow({ cols, onRetry }: { cols: number; onRetry: () => void }) {
  return (
    <tr>
      <td colSpan={cols} className="p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <p className="text-xs font-semibold text-slate-600">Couldn&apos;t load this list.</p>
          <button type="button" onClick={onRetry} className="ui-btn ui-btn-primary">Retry</button>
        </div>
      </td>
    </tr>
  );
}

const ExploreCell = () => (
  <td className={`${TD} text-right`}>
    <ChevronRight className="h-3.5 w-3.5 text-slate-400 inline" />
  </td>
);

// ---------------------------------------------------------------------------

export default function OverviewTab({
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
  /** Opens a booking's details page. */
  onExplore: (bookingId: string) => void;
}) {
  const [summary, setSummary] = useState<StSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [selected, setSelected] = useState<CardKey | null>(null);
  const [recentMonth, setRecentMonth] = useState("");
  const [overdueMonth, setOverdueMonth] = useState("");

  const base: StFilters = toApiFilters(filters);
  const baseKey = JSON.stringify(base);

  useEffect(() => {
    let active = true;
    setSummary(null);
    setSummaryError(false);
    apiStSummary(base)
      .then(s => { if (active) setSummary(s); })
      .catch(err => { console.warn("Could not load the Sales Tracker totals:", err); if (active) setSummaryError(true); });
    return () => { active = false; };
    // baseKey stands for base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey, refreshSignal]);

  const card = CARDS.find(c => c.key === selected) ?? null;
  // The open table: a card's list, or Recent bookings (its own Month overrides the header's).
  const listFilters: StFilters = card ? { ...base, status: card.status } : { ...base, month: recentMonth || base.month };
  const list = usePaged<StBooking>(
    (page, size) => apiStListBookings(listFilters, page, size),
    JSON.stringify(listFilters),
    refreshSignal
  );
  const overdue = usePaged<StOverdueRow>(
    (page, size) => apiStListOverdue(base, page, size, overdueMonth || undefined),
    `${baseKey}|${overdueMonth}`,
    refreshSignal
  );

  const columns = card ? card.columns : RECENT_COLUMNS;

  return (
    <PageCard title="Sales PNL" right={<HeaderFilters value={filters} onChange={onFiltersChange} lookups={lookups} />}>
      {/* Totals */}
      <div>
        <div className="h-6 rounded-t-2xl bg-[#0B0B4A]" />
        {summaryError ? (
          <div className="border border-t-0 border-slate-300 py-6 text-center text-xs font-semibold text-slate-600">
            Couldn&apos;t load the totals.
          </div>
        ) : (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-5 gap-px bg-slate-300 border border-t-0 border-slate-300">
            {CARDS.map((c, i) => {
              const active = selected === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setSelected(active ? null : c.key)}
                  aria-pressed={active}
                  className={`group text-left bg-white p-3 min-h-[70px] transition-colors hover:bg-slate-50 ${
                    active ? "ring-2 ring-inset ring-blue-500" : ""
                  } ${i === CARDS.length - 1 ? "min-[480px]:max-lg:col-span-2" : ""}`}
                >
                  <p className="text-[11px] font-medium text-slate-500">{c.label}</p>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    {summary ? (
                      <p className={`text-lg font-extrabold tabular-nums whitespace-nowrap ${c.color}`}>
                        {c.money ? inr(summary[c.key]).replace("₹", "₹ ") : summary[c.key].toLocaleString("en-IN")}
                      </p>
                    ) : (
                      <LineSkeleton width={90} height={20} />
                    )}
                    <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${active ? "rotate-90 text-blue-500" : "text-slate-300"}`} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* The selected card's list, or Recent bookings */}
      <TableCard
        title={card ? card.label : "Recent bookings"}
        right={
          card ? (
            <button type="button" onClick={() => setSelected(null)} className="text-[11px] font-bold text-slate-400 hover:text-slate-700">
              Back to recent bookings
            </button>
          ) : (
            <MonthSelect value={recentMonth} onChange={setRecentMonth} />
          )
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                {columns.map(col => <th key={col.label} className={TH}>{col.label}</th>)}
                <th className={`${TH} text-right`}>Explore</th>
              </tr>
            </thead>
            <tbody>
              {list.error ? (
                <ErrorRow cols={columns.length + 1} onRetry={list.retry} />
              ) : list.loading ? (
                <TableRowsSkeleton rows={4} columns={columns.length + 1} />
              ) : list.rows.length === 0 ? (
                <EmptyRow cols={columns.length + 1} text="No bookings found." />
              ) : (
                list.rows.map(b => (
                  <tr
                    key={b.booking_id}
                    onClick={() => onExplore(b.booking_id)}
                    className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50 cursor-pointer"
                  >
                    {columns.map(col => <td key={col.label} className={TD}>{col.cell(b)}</td>)}
                    <ExploreCell />
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          totalRows={list.total}
          page={list.page}
          rowsPerPage={list.size}
          onPageChange={list.setPage}
          onRowsPerPageChange={(n) => { list.setSize(n); list.setPage(1); }}
          rowLabel="Row"
        />
      </TableCard>

      {/* Overdue payments: invoices raised, money not yet received */}
      <TableCard title="Overdue payments" right={<MonthSelect value={overdueMonth} onChange={setOverdueMonth} />}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                {["Lead Name", "Property", "Agreement Value", "Brokerage Value", "Invoice Raised", "Delayed by", "Invoice raised at"].map(h => (
                  <th key={h} className={TH}>{h}</th>
                ))}
                <th className={`${TH} text-right`}>Explore</th>
              </tr>
            </thead>
            <tbody>
              {overdue.error ? (
                <ErrorRow cols={8} onRetry={overdue.retry} />
              ) : overdue.loading ? (
                <TableRowsSkeleton rows={3} columns={8} />
              ) : overdue.rows.length === 0 ? (
                <EmptyRow cols={8} text="No invoices waiting for payment." />
              ) : (
                overdue.rows.map(o => {
                  const days = num(o.days_delayed);
                  return (
                    <tr
                      key={o.payment_id}
                      onClick={() => onExplore(o.booking_id)}
                      className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className={TD}><span className="font-medium text-slate-900">{o.lead_name}</span></td>
                      <td className={TD}>{o.property_name}</td>
                      <td className={TD}>{amt(o.agreement_value)}</td>
                      <td className={TD}>{amt(o.brokerage_total)}</td>
                      <td className={TD}>{amt(o.brokerage_value)}</td>
                      <td className={TD}>
                        {/* 1–29 days: yellow · 30 days and more: red */}
                        <span className={`font-semibold ${days >= 30 ? "text-red-600" : "text-amber-500"}`}>
                          {days === 0 ? "Today" : `${days} Day${days === 1 ? "" : "s"}`}
                        </span>
                      </td>
                      <td className={TD}>{o.invoice_raised_date}</td>
                      <ExploreCell />
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          totalRows={overdue.total}
          page={overdue.page}
          rowsPerPage={overdue.size}
          onPageChange={overdue.setPage}
          onRowsPerPageChange={(n) => { overdue.setSize(n); overdue.setPage(1); }}
          rowLabel="Row"
        />
      </TableCard>
    </PageCard>
  );
}
