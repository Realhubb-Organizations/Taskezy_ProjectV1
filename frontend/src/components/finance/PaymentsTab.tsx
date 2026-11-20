"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ChevronRight, Search } from "lucide-react";
import TablePagination from "@/components/ui/TablePagination";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";
import { useDialog } from "@/components/ui/DialogProvider";
import { useCloseOnScroll } from "@/lib/useCloseOnScroll";
import { apiStListPayments, StPaymentRow, StPaymentStatus } from "@/lib/apiClient";
import { AdvancePaymentModal, PaymentForModal } from "./PaymentModals";
import {
  EmptyRow, FilterState, HeaderFilters, Lookups, PAYMENT_STATUS_LABEL, PageCard, PaymentStatusBadge, StatusHeaderFilter,
  TD, TH, typeLabel, inr, pctText, toApiFilters, useDebounced
} from "./stShared";

// Filter order as in the design, plus Rejected (Bhavuk).
const FILTER_STATUSES: StPaymentStatus[] = ["INVOICE_RAISED", "COMPLETED", "PENDING", "REJECTED"];
// Status order a payment moves through — forward only, one step at a time.
const FLOW: StPaymentStatus[] = ["PENDING", "INVOICE_RAISED", "GST_PENDING", "COMPLETED"];

/** Statuses a payment can be moved to from `status` (one step; GST Pending is optional; Reject before Completed). */
export function nextStatuses(status: StPaymentStatus): StPaymentStatus[] {
  switch (status) {
    case "PENDING": return ["INVOICE_RAISED", "REJECTED"];
    case "INVOICE_RAISED": return ["GST_PENDING", "COMPLETED", "REJECTED"];
    case "GST_PENDING": return ["COMPLETED", "REJECTED"];
    default: return [];
  }
}

const COLS = 8;

/** 2026-11-17 / 15:51:07, in the viewer's own time. */
function dateTime(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` };
}

/**
 * The row's status badge with a ▾ — the user changes the status from here.
 * Only the next step is pickable (Pending → Invoice Raised → (GST Pending)
 * → Completed, or Rejected before Completed); earlier steps are greyed,
 * since a payment never goes back.
 */
export function StatusChanger<P extends PaymentForModal>({ payment, onPick }: { payment: P; onPick: (p: P, target: StPaymentStatus) => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = () => setPos(null);
  useCloseOnScroll(!!pos, close, panelRef);

  useEffect(() => {
    if (!pos) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !triggerRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pos]);

  const current = FLOW.indexOf(payment.payment_status);
  const allowed = nextStatuses(payment.payment_status);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (pos) return close();
          const r = triggerRef.current!.getBoundingClientRect();
          setPos({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 220) });
        }}
        className="inline-flex items-center gap-1 rounded-full focus:outline-none"
        aria-haspopup="menu"
        aria-expanded={!!pos}
        title="Change status"
      >
        <PaymentStatusBadge status={payment.payment_status} />
        <svg viewBox="0 0 10 6" className="h-1.5 w-2.5 fill-slate-800" aria-hidden="true"><path d="M0 0h10L5 6z" /></svg>
      </button>
      {pos &&
        createPortal(
          // Same look as the Payment Status filter: dark border, a checkbox +
          // badge per row. The current status is ticked; only the next step
          // can be picked — the rest explain why on hover.
          <div
            ref={panelRef}
            role="menu"
            style={{ top: pos.top, left: pos.left, width: 200 }}
            className="fixed z-[210] rounded-xl border border-slate-900 bg-white p-3 shadow-md space-y-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            {[...FLOW, "REJECTED" as StPaymentStatus].map((s, i) => {
              const isCurrent = s === payment.payment_status;
              const isNext = allowed.includes(s);
              const hint = isCurrent
                ? "Current status"
                : payment.payment_status === "COMPLETED" || payment.payment_status === "REJECTED"
                  ? "This payment can't change any more"
                  : i < current
                    ? "A payment can't go back"
                    : "Move one step at a time";
              return (
                <label
                  key={s}
                  role="menuitemcheckbox"
                  aria-checked={isCurrent}
                  title={isNext ? undefined : hint}
                  className={`flex items-center gap-2.5 ${isNext ? "cursor-pointer" : "cursor-not-allowed"}`}
                >
                  <input
                    type="checkbox"
                    checked={isCurrent}
                    disabled={!isNext}
                    onChange={() => { close(); onPick(payment, s); }}
                    className="h-4 w-4 rounded border-slate-400 text-[#0B1E6E] focus:ring-0 disabled:cursor-not-allowed"
                  />
                  <span className={isNext || isCurrent ? "" : "opacity-50"}>
                    <PaymentStatusBadge status={s} />
                  </span>
                </label>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

export default function PaymentsTab({
  filters,
  onFiltersChange,
  lookups,
  refreshSignal,
  onDataChanged,
  onOpenPayment
}: {
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  lookups: Lookups;
  refreshSignal: number;
  onDataChanged: () => void;
  /** Opens the payment's own details page. */
  onOpenPayment: (p: StPaymentRow) => void;
}) {
  const { toast } = useDialog();
  const [rows, setRows] = useState<StPaymentRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [advancing, setAdvancing] = useState<{ payment: StPaymentRow; target: StPaymentStatus } | null>(null);

  const search = useDebounced(filters.search);
  const apiFilters = toApiFilters({ ...filters, search });
  const filterKey = JSON.stringify(apiFilters);

  useEffect(() => setPage(1), [filterKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    apiStListPayments(apiFilters, page, rowsPerPage)
      .then(res => {
        if (!active) return;
        setRows(res.rows);
        setTotalCount(res.totalCount);
      })
      .catch(err => {
        console.warn("Could not load payments:", err);
        if (active) { setRows([]); setTotalCount(0); setLoadError(true); }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // filterKey stands for apiFilters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, rowsPerPage, refreshSignal, retry]);

  return (
    <PageCard title="Payments & Invoices" right={<HeaderFilters value={filters} onChange={onFiltersChange} lookups={lookups} />}>
      <div className="flex items-center gap-2 max-w-xs">
        <Search className="h-4 w-4 text-slate-400 shrink-0" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder="Search invoice, lead, property..."
          className="w-full border-0 border-b border-slate-300 bg-transparent px-1 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0B1E6E]"
        />
      </div>

      <div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className={TH}>Invoice Number</th>
                <th className={TH}>Property</th>
                <th className={TH}>Invoice Amount</th>
                <th className={TH}>
                  <StatusHeaderFilter
                    label="Payment Status"
                    options={FILTER_STATUSES}
                    selected={filters.status}
                    onChange={(v) => onFiltersChange({ ...filters, status: v })}
                    renderBadge={(s) => <PaymentStatusBadge status={s} />}
                  />
                </th>
                <th className={TH}>Brokerage %</th>
                <th className={TH}>Brokerage Type</th>
                <th className={TH}>Created Date</th>
                <th className={TH} aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {loadError ? (
                <tr>
                  <td colSpan={COLS} className="p-8">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      <p className="text-xs font-semibold text-slate-600">Couldn&apos;t load payments.</p>
                      <button type="button" onClick={() => setRetry(n => n + 1)} className="ui-btn ui-btn-primary">Retry</button>
                    </div>
                  </td>
                </tr>
              ) : loading ? (
                <TableRowsSkeleton rows={8} columns={COLS} />
              ) : rows.length === 0 ? (
                <EmptyRow cols={COLS} text="No payments found." />
              ) : (
                rows.map(p => {
                  const created = dateTime(p.created_at);
                  return (
                    <tr
                      key={p.payment_id}
                      onClick={() => onOpenPayment(p)}
                      className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50 cursor-pointer"
                      title={`${p.lead_name} · ${PAYMENT_STATUS_LABEL[p.payment_status]}`}
                    >
                      <td className={TD}><span className="font-medium text-slate-900">{p.invoice_number || "-"}</span></td>
                      <td className={TD}>{p.property_name}</td>
                      <td className={TD}>{inr(p.brokerage_value).replace("₹", "₹ ")}</td>
                      {/* Only the badge + ▾ opens the status menu (it stops the click itself);
                          the rest of the cell opens the payment like any other cell. */}
                      <td className={TD}>
                        <StatusChanger payment={p} onPick={(payment, target) => setAdvancing({ payment, target })} />
                      </td>
                      <td className={TD}>{pctText(p.brokerage_percentage)}</td>
                      <td className={TD}>{typeLabel(p.brokerage_type)}</td>
                      <td className={`${TD} leading-tight`}>
                        <span className="block">{created.date}</span>
                        <span className="block text-slate-500">{created.time}</span>
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
          rowLabel="Payment"
        />
      </div>

      {advancing && (
        <AdvancePaymentModal
          payment={advancing.payment}
          target={advancing.target}
          onClose={() => setAdvancing(null)}
          onSaved={() => {
            const target = advancing.target;
            setAdvancing(null);
            toast(`Payment marked ${PAYMENT_STATUS_LABEL[target]}.`, "success");
            onDataChanged();
          }}
        />
      )}
    </PageCard>
  );
}
