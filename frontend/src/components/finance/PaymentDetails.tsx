"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, FileText, Home } from "lucide-react";
import { useDialog } from "@/components/ui/DialogProvider";
import { apiStGetBooking, StBookingDetail, StPayment, StPaymentStatus } from "@/lib/apiClient";
import { AdvancePaymentModal, EditPaymentModal, PaymentForModal } from "./PaymentModals";
import { StatusChanger } from "./PaymentsTab";
import { FULL_HEIGHT, PAYMENT_STATUS_LABEL, typeLabel, inr, num } from "./stShared";


const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** 18th Nov 26 (date only) — YYYY-MM-DD dates are read as calendar days, no timezone shift. */
function shortDate(isoDate: string) {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return `${ordinal(d)} ${SHORT_MONTHS[m - 1]} ${String(y).slice(2)}`;
}
/** 18th Nov 26, 11:20:07 — a timestamp in the viewer's own time. */
function shortDateTime(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ordinal(d.getDate())} ${SHORT_MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}, ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("") || "?";

function InfoItem({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="h-11 w-11 shrink-0 rounded-2xl bg-indigo-50 flex items-center justify-center text-blue-600">{icon}</span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-slate-900 truncate">{title}</p>
        <p className="text-[11px] text-slate-400 truncate">{sub}</p>
      </div>
    </div>
  );
}

function Line({ label, value, strong, valueClass = "" }: { label: string; value: string; strong?: boolean; valueClass?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? "text-sm font-bold text-slate-900" : "text-xs text-slate-800"}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

/** One step of the Payment Status timeline. */
function Step({ tone, title, children, last }: { tone: "done" | "todo" | "partial" | "rejected"; title: React.ReactNode; children?: React.ReactNode; last?: boolean }) {
  const dot = { done: "bg-[#0B1E6E]", todo: "bg-slate-300", partial: "bg-amber-400", rejected: "bg-red-500" }[tone];
  return (
    <li className="relative pl-7 pb-7 last:pb-0">
      {!last && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-slate-200" aria-hidden="true" />}
      <span className={`absolute left-0 top-1 h-[11px] w-[11px] rounded-full ${dot}`} aria-hidden="true" />
      <div className={`text-[13px] font-semibold ${tone === "todo" ? "text-slate-400" : "text-slate-900"}`}>{title}</div>
      {children && <div className="mt-1 text-[11px] text-slate-500">{children}</div>}
    </li>
  );
}

export default function PaymentDetails({
  paymentId,
  bookingId,
  refreshSignal,
  onBack,
  onDataChanged
}: {
  paymentId: string;
  /** The payment's booking — the page reads the payment from it. */
  bookingId: string;
  refreshSignal: number;
  onBack: () => void;
  onDataChanged: () => void;
}) {
  const { toast } = useDialog();
  const [booking, setBooking] = useState<StBookingDetail | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [advancing, setAdvancing] = useState<{ payment: PaymentForModal; target: StPaymentStatus } | null>(null);

  useEffect(() => {
    let active = true;
    setError(false);
    apiStGetBooking(bookingId)
      .then(b => { if (active) setBooking(b); })
      .catch(err => { console.warn("Could not load payment:", err); if (active) setError(true); });
    return () => { active = false; };
  }, [bookingId, refreshSignal, retry]);

  const payment: StPayment | undefined = booking?.payments.find(p => p.payment_id === paymentId);
  const forModal: PaymentForModal | null =
    booking && payment ? { ...payment, lead_name: booking.lead_name, property_name: booking.property_name } : null;

  // Tax as saved with the payment: IGST 18%, or CGST 9% + SGST 9%.
  const base = num(payment?.brokerage_value);
  const taxLines = payment?.tax_type === "IGST"
    ? [{ label: "IGST @ 18%", value: num(payment.igst_amount) }]
    : payment?.tax_type === "CGST_SGST"
      ? [{ label: "CGST @ 9%", value: num(payment.cgst_amount) }, { label: "SGST @ 9%", value: num(payment.sgst_amount) }]
      : [{ label: "Tax", value: 0 }];
  const total = num(payment?.total_amount) || base;
  const status = payment?.payment_status;
  const monthIso = payment?.invoice_raised_date ?? payment?.created_at;
  const month = monthIso ? MONTHS[Number(monthIso.slice(5, 7)) - 1] : "—";
  const phone = booking && /^\d{10}$/.test(booking.lead_phone_number) ? `+91-${booking.lead_phone_number}` : booking?.lead_phone_number;
  const invoiceStepDone = status === "INVOICE_RAISED" || status === "GST_PENDING" || status === "COMPLETED" || (status === "REJECTED" && !!payment?.invoice_raised_date);

  const saved = (message: string) => {
    toast(message, "success");
    onDataChanged();
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm" style={FULL_HEIGHT}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
        <h2 className="ui-title">Payments &amp; Invoices</h2>
        {forModal && status !== "REJECTED" && (
          <button type="button" onClick={() => setEditing(true)} className="ui-btn ui-btn-primary self-start sm:self-auto">
            Edit Payment Details
          </button>
        )}
      </div>

      <div className="p-4 sm:px-6 space-y-8">
        <nav className="flex items-center gap-2 text-xs" aria-label="Breadcrumb">
          <button type="button" onClick={onBack} className="text-slate-400 hover:text-slate-700">Payments &amp; Invoices</button>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-semibold text-slate-700">Payments Details</span>
        </nav>

        {error ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <p className="text-xs font-semibold text-slate-600">Couldn&apos;t load this payment.</p>
            <button type="button" onClick={() => setRetry(n => n + 1)} className="ui-btn ui-btn-primary">Retry</button>
          </div>
        ) : !booking ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : !payment ? (
          <p className="text-xs text-slate-500">This payment no longer exists.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-4xl">
              <InfoItem icon={<FileText className="h-5 w-5" />} title={payment.invoice_number} sub="Invoice Number" />
              <InfoItem icon={<span className="text-base font-bold">{initials(booking.lead_name)}</span>} title={booking.lead_name} sub={phone ?? ""} />
              <InfoItem icon={<Home className="h-5 w-5 fill-blue-600/20" />} title={booking.property_name} sub="Property" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-8 lg:gap-16 items-start">
              {/* Payment Breakup */}
              <div className="rounded-3xl bg-slate-100 p-1.5 pb-2">
                <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-5">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Payment Breakup</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{shortDateTime(payment.created_at)}</p>
                  </div>
                  {forModal && <StatusChanger payment={forModal} onPick={(p, target) => setAdvancing({ payment: p, target })} />}
                </div>
                <div className="rounded-2xl bg-white px-5 py-6 space-y-4">
                  <div className="space-y-3">
                    <Line label={`${typeLabel(payment.brokerage_type)} Brokerage`} value={inr(base).replace("₹", "₹ ")} />
                    <Line label="Month" value={month} />
                  </div>
                  <div className="border-t border-slate-200" />
                  <div className="space-y-3">
                    <Line label="Billable Amount" value={inr(base).replace("₹", "₹ ")} />
                    {taxLines.map(t => (
                      <Line
                        key={t.label}
                        label={t.label}
                        value={inr(t.value).replace("₹", "₹ ")}
                        valueClass={status === "GST_PENDING" ? "text-red-600 font-semibold" : ""}
                      />
                    ))}
                  </div>
                  <div className="border-t border-slate-200" />
                  <Line
                    label="Invoice Amount"
                    value={inr(total).replace("₹", "₹ ")}
                    strong
                    valueClass={status === "REJECTED" ? "text-red-600" : ""}
                  />
                </div>
              </div>

              {/* Payment Status timeline */}
              <div>
                <p className="text-sm font-bold text-slate-900 mb-5">Payment Status</p>
                <ol>
                  <Step tone="done" title="Open">{shortDate(payment.created_at.slice(0, 10))}</Step>
                  <Step tone={invoiceStepDone ? "done" : "todo"} title="Invoice Raised">
                    {payment.invoice_raised_date ? shortDate(payment.invoice_raised_date) : null}
                  </Step>
                  {status === "REJECTED" ? (
                    <Step tone="rejected" title="Rejected" last>
                      {payment.rejected_at ? shortDate(payment.rejected_at.slice(0, 10)) : null}
                    </Step>
                  ) : status === "GST_PENDING" ? (
                    <Step
                      tone="partial"
                      last
                      title={
                        <span className="inline-flex items-center gap-2">
                          Paid
                          <span className="rounded border border-green-300 bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">Partial Paid</span>
                        </span>
                      }
                    >
                      <span className="text-xs text-slate-700">Basic amount paid. GST pending.</span>
                    </Step>
                  ) : (
                    <Step tone={status === "COMPLETED" ? "done" : "todo"} title="Paid" last>
                      {payment.payment_received_date ? shortDate(payment.payment_received_date) : null}
                    </Step>
                  )}
                </ol>
              </div>
            </div>
          </>
        )}
      </div>

      {editing && forModal && (
        <EditPaymentModal payment={forModal} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); saved("Payment updated."); }} />
      )}
      {advancing && (
        <AdvancePaymentModal
          payment={advancing.payment}
          target={advancing.target}
          onClose={() => setAdvancing(null)}
          onSaved={() => {
            const target = advancing.target;
            setAdvancing(null);
            saved(`Payment marked ${PAYMENT_STATUS_LABEL[target]}.`);
          }}
        />
      )}
    </div>
  );
}
