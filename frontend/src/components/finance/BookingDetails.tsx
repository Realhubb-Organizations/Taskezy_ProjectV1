"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, Plus, UserCircle2 } from "lucide-react";
import { useDialog } from "@/components/ui/DialogProvider";
import { apiStCancelBooking, apiStGetBooking, StBookingBrokerage, StBookingDetail, StBrokerageRow, StBrokerageType, StPayment } from "@/lib/apiClient";
import { BookingModal } from "./BookingModals";
import { AddPaymentModal, AdvancePaymentModal, EditPaymentModal, PaymentForModal } from "./PaymentModals";
import { BrokerageStatusBadge, FULL_HEIGHT, Lookups, PaymentStatusBadge, typeLabel, amt, inr, num, pctText } from "./stShared";

/** Label over value, as in the design's details grid. */
function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <div className="mt-1.5 text-[13px] text-slate-900 break-words">{children}</div>
    </div>
  );
}

const dash = <span className="text-slate-400">-</span>;

/** What AddPaymentModal needs to open pre-set on one brokerage. */
const brokerageRowFor = (b: StBookingDetail, d: StBookingBrokerage): StBrokerageRow => ({
  brokerage_id: d.brokerageId,
  booking_id: b.booking_id,
  brokerage_type: d.type,
  broker_percentage: String(d.percentage),
  value: String(d.value),
  status: d.status,
  created_date: "",
  updated_at: "",
  lead_name: b.lead_name,
  lead_phone_number: b.lead_phone_number,
  property_name: b.property_name,
  unit_number: b.unit_number,
  salesperson_name: b.salesperson_name,
  agreement_value: b.agreement_value,
  booking_date: b.booking_date,
  allocated: String(d.allocated),
  allocated_percentage: String(d.allocatedPercentage),
  received: String(d.received),
  invoiced: String(d.invoiced),
  payment_count: String(d.paymentCount)
});

export default function BookingDetails({
  bookingId,
  lookups,
  refreshSignal,
  onBack,
  onDataChanged
}: {
  bookingId: string;
  lookups: Lookups;
  refreshSignal: number;
  onBack: () => void;
  onDataChanged: () => void;
}) {
  const { confirm, toast } = useDialog();
  const [detail, setDetail] = useState<StBookingDetail | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  // Brokerage types whose invoice list is folded away (click the type's row).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const [payFor, setPayFor] = useState<StBrokerageRow | null>(null);
  const [advancing, setAdvancing] = useState<PaymentForModal | null>(null);
  const [editingPayment, setEditingPayment] = useState<PaymentForModal | null>(null);

  useEffect(() => {
    let active = true;
    setError(false);
    apiStGetBooking(bookingId)
      .then(d => { if (active) setDetail(d); })
      .catch(err => { console.warn("Could not load booking:", err); if (active) setError(true); });
    return () => { active = false; };
  }, [bookingId, refreshSignal, retry]);

  const saved = (message: string) => {
    toast(message, "success");
    onDataChanged();
  };

  const cancelBooking = async () => {
    if (!detail) return;
    const ok = await confirm({
      title: "Cancel this booking?",
      message: "It stays in the tracker marked Cancelled and stops counting in the totals. This can't be undone.",
      confirmLabel: "Cancel Booking",
      cancelLabel: "Keep Booking",
      danger: true
    });
    if (!ok) return;
    try {
      await apiStCancelBooking(detail.booking_id);
      saved("Booking cancelled.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not cancel the booking.", "error");
    }
  };

  const forModal = (p: StPayment): PaymentForModal => ({ ...p, lead_name: detail!.lead_name, property_name: detail!.property_name });
  const openPayment = (p: StPayment) => {
    if (p.payment_status === "REJECTED") return; // final — nothing to change
    if (p.payment_status === "COMPLETED") setEditingPayment(forModal(p));
    else setAdvancing(forModal(p));
  };

  const brokerageOf = (t: StBrokerageType) => detail?.brokerages.find(x => x.type === t);
  const missing = detail && !detail.is_cancelled ? detail.brokerage_type.filter(t => !brokerageOf(t)) : [];
  const basic = brokerageOf("BASIC");

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm" style={FULL_HEIGHT}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
        <h2 className="ui-title">Booking Details</h2>
        {detail && !detail.is_cancelled && (
          <button type="button" onClick={() => setEditing(true)} className="ui-btn ui-btn-primary self-start sm:self-auto">
            Edit Booking Details
          </button>
        )}
      </div>

      <div className="p-4 sm:px-6 space-y-8">
        <nav className="flex items-center gap-2 text-xs" aria-label="Breadcrumb">
          <button type="button" onClick={onBack} className="text-slate-400 hover:text-slate-700">All Bookings</button>
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          <span className="font-semibold text-slate-700">Booking Details</span>
        </nav>

        {error ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <p className="text-xs font-semibold text-slate-600">Couldn&apos;t load this booking.</p>
            <button type="button" onClick={() => setRetry(n => n + 1)} className="ui-btn ui-btn-primary">Retry</button>
          </div>
        ) : !detail ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : (
          <>
            <section className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <UserCircle2 className="h-6 w-6 text-slate-700" strokeWidth={1.5} />
                <h3 className="text-base font-semibold text-slate-900">{detail.lead_name}</h3>
                {detail.is_cancelled && <span className="text-[11px] font-semibold text-slate-500">(Cancelled)</span>}
              </div>

              {missing.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[11px] font-semibold text-red-700">
                  Brokerage not added for {missing.map(t => typeLabel(t)).join(", ")}. Add it from Edit Booking Details.
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-6 gap-y-7">
                <Item label="Phone Number">{/^\d{10}$/.test(detail.lead_phone_number) ? `+91-${detail.lead_phone_number}` : detail.lead_phone_number}</Item>
                <Item label="Email Id">
                  {detail.lead_email ? (
                    <a href={`mailto:${detail.lead_email}`} title={detail.lead_email} className="block truncate underline underline-offset-4">
                      {detail.lead_email}
                    </a>
                  ) : dash}
                </Item>
                <Item label="Property Purchased">{detail.property_name}</Item>
                <Item label="Agreement Value">{inr(detail.agreement_value).replace("₹", "₹ ")}</Item>
                <Item label="Cashback">{detail.cashback ? inr(detail.cashback_amount).replace("₹", "₹ ") : "No"}</Item>
                <Item label="Booking Date">{detail.booking_date}</Item>
                <Item label="Unit Number">{detail.unit_number}</Item>
                <Item label="Property Type">{detail.bhk_type}</Item>
                <Item label="Brokerage %age">{basic ? pctText(basic.percentage) : dash}</Item>
                <Item label="Property Area">{detail.property_area ? `${amt(detail.property_area)} Sqft.` : dash}</Item>
                <Item label="Salesperson">{detail.salesperson_name}</Item>
                <Item label="Source">{detail.source || dash}</Item>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="ui-subheading">Brokerage Details</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-x-6 gap-y-7">
                {([["BASIC", "Brokerage"], ["AOP", "AOP"], ["NRI", "NRI"]] as const).map(([t, label]) => {
                  const b = brokerageOf(t);
                  return (
                    <React.Fragment key={t}>
                      <Item label={`${label} Percent`}>{b ? pctText(b.percentage) : dash}</Item>
                      <Item label={`${label} Value`}>{b ? amt(b.value) : dash}</Item>
                    </React.Fragment>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="ui-subheading">Payments &amp; Invoicing Details</h3>
              {detail.brokerages.length === 0 ? (
                <p className="text-xs text-slate-400">Add the brokerage first, then split it into payments here.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px]">
                    <thead>
                      <tr>
                        {["Brokerage Type", "Brokerage Percent", "Brokerage Value", "Status", "Brokerage Outstanding"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-800">{h}</th>
                        ))}
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {detail.brokerages.map(b => {
                        const payments = detail.payments.filter(p => p.brokerage_id === b.brokerageId);
                        const left = num(b.value) - num(b.allocated);
                        return (
                          <React.Fragment key={b.brokerageId}>
                            <tr
                              onClick={() => toggle(b.brokerageId)}
                              aria-expanded={!collapsed.has(b.brokerageId)}
                              title={collapsed.has(b.brokerageId) ? "Show invoices" : "Hide invoices"}
                              className="bg-slate-50 border-l-2 border-slate-400 cursor-pointer hover:bg-slate-100 transition-colors"
                            >
                              <td className="px-4 py-3 text-xs text-slate-800">{typeLabel(b.type)}</td>
                              <td className="px-4 py-3 text-xs text-slate-800">{pctText(b.percentage)}</td>
                              <td className="px-4 py-3 text-xs text-slate-800">{inr(b.value).replace("₹", "₹ ")}</td>
                              <td className="px-4 py-3"><BrokerageStatusBadge status={b.status} /></td>
                              <td className="px-4 py-3 text-xs text-slate-800">{inr(num(b.value) - num(b.received)).replace("₹", "₹ ")}</td>
                              <td />
                            </tr>
                              <tr>
                                <td colSpan={6} className="p-0">
                                  <div
                                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
                                      collapsed.has(b.brokerageId) ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
                                    }`}
                                  >
                                  <div className="overflow-hidden">
                                  <div className="pl-6 sm:pl-24 pr-2 pt-1 pb-4">
                                  <table className="w-full">
                                    <thead>
                                      <tr>
                                        {["Invoice Number", "Brokerage Type", "Brokerage Percent", "Brokerage Value", "Status"].map(h => (
                                          <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold text-slate-700 whitespace-nowrap">{h}</th>
                                        ))}
                                        <th />
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {payments.length === 0 ? (
                                        <tr><td colSpan={6} className="px-4 py-3 text-xs text-slate-400">No payments yet.</td></tr>
                                      ) : (
                                        payments.map(p => (
                                          <tr
                                            key={p.payment_id}
                                            onClick={() => !detail.is_cancelled && openPayment(p)}
                                            className="border-t border-slate-200 hover:bg-slate-50 cursor-pointer"
                                            title={p.payment_status === "PENDING" ? "Raise invoice" : p.payment_status === "INVOICE_RAISED" ? "Mark completed" : "Edit dates"}
                                          >
                                            <td className="px-4 py-2.5 text-xs text-slate-700">{p.invoice_number || dash}</td>
                                            <td className="px-4 py-2.5 text-xs text-slate-700">{typeLabel(p.brokerage_type)}</td>
                                            <td className="px-4 py-2.5 text-xs text-slate-700">{pctText(p.brokerage_percentage)}</td>
                                            <td className="px-4 py-2.5 text-xs text-slate-700">{inr(p.brokerage_value).replace("₹", "₹ ")}</td>
                                            <td className="px-4 py-2.5"><PaymentStatusBadge status={p.payment_status} /></td>
                                            <td className="px-4 py-2.5 text-right"><ChevronRight className="h-3.5 w-3.5 text-slate-400 inline" /></td>
                                          </tr>
                                        ))
                                      )}
                                    </tbody>
                                  </table>
                                  {!detail.is_cancelled && left > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setPayFor(brokerageRowFor(detail, b))}
                                      className="mt-2 ml-4 inline-flex items-center gap-1 text-[11px] font-bold text-[#0B1E6E] hover:underline"
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                      Add Payment ({inr(left)} left)
                                    </button>
                                  )}
                                  </div>
                                  </div>
                                  </div>
                                </td>
                              </tr>
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {editing && detail && (
        <BookingModal
          booking={detail}
          lookups={lookups}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); saved("Booking details saved."); }}
          onCancelBooking={() => { setEditing(false); cancelBooking(); }}
        />
      )}
      {payFor && (
        <AddPaymentModal preset={payFor} onClose={() => setPayFor(null)} onSaved={() => { setPayFor(null); saved("Payment added."); }} />
      )}
      {advancing && (
        <AdvancePaymentModal
          payment={advancing}
          onClose={() => setAdvancing(null)}
          onSaved={() => {
            const raised = advancing.payment_status === "PENDING";
            setAdvancing(null);
            saved(raised ? "Invoice raised." : "Payment marked completed.");
          }}
        />
      )}
      {editingPayment && (
        <EditPaymentModal payment={editingPayment} onClose={() => setEditingPayment(null)} onSaved={() => { setEditingPayment(null); saved("Payment updated."); }} />
      )}
    </div>
  );
}
