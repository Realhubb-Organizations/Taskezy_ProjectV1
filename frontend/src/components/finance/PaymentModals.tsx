"use client";

import React, { useEffect, useMemo, useState } from "react";
import { SearchableSelect } from "@/components/ui/SearchableDropdown";
import { DatePicker, todayIso } from "@/components/ui/DateRangePicker";
import { useDialog } from "@/components/ui/DialogProvider";
import {
  apiStAdvancePayment, apiStCreatePayment, apiStListBrokerages, apiStRejectPayment, apiStUpdatePayment, StBrokerageRow,
  StPaymentRow, StPaymentStatus, StTaxType
} from "@/lib/apiClient";
import {
  Field, FormError, Modal, PaymentStatusBadge, typeLabel, dateText, inputClass, inr, inrShort, num, parseNum, pctText
} from "./stShared";

// Rounds away float noise (0.1 + 0.2) in "what's left" figures.
export const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

// ---------------------------------------------------------------------------
// Create Payment (design: lead → property → brokerage type, % → amount, tax)
// ---------------------------------------------------------------------------

type TaxType = StTaxType;
const TAX_OPTIONS = [
  { value: "IGST", label: "IGST 18%" },
  { value: "CGST_SGST", label: "CGST 9% + SGST 9%" }
];

// Create Payment's design look: dark title-case labels with a red *, white
// boxed fields. Module level, so typing never remounts the inputs.
export const boxInput = (bad = false) =>
  `w-full bg-white border rounded-md shadow-md px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0B1E6E] ${
    bad ? "border-red-400" : "border-slate-300"
  }`;

export function F({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold text-slate-900">
        {label}
        {required && <sup className="ml-0.5 text-red-500">*</sup>}
      </p>
      {children}
      {error ? <p className="mt-1 text-[11px] font-semibold text-red-600">{error}</p> : hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

/** A % box with the design's ▲▼ on the right (0.05% a step). */
export function PercentInput({ value, onChange, placeholder, bad = false }: { value: string; onChange: (v: string) => void; placeholder: string; bad?: boolean }) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${boxInput(bad)} pr-8 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
      />
      {/* Up / down stepper, always visible (like the browser's own number box) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 flex flex-col overflow-hidden rounded-sm bg-slate-100"
        style={{ right: 6 }}
      >
        {[1, -1].map(dir => (
          <button
            key={dir}
            type="button"
            tabIndex={-1}
            aria-label={dir > 0 ? "Increase" : "Decrease"}
            title={dir > 0 ? "Increase by 0.05%" : "Decrease by 0.05%"}
            onClick={() => onChange(String(Math.max(0, round((parseNum(value) || 0) + dir * 0.05, 4))))}
            className="flex items-center justify-center text-slate-600 hover:bg-slate-200 hover:text-slate-900"
            // Same size as the browser's own number arrows (Cashback etc.)
            style={{ width: 11, height: 8 }}
          >
            <svg viewBox="0 0 10 6" className="fill-current" style={{ width: 6, height: 4 }} aria-hidden="true">
              <path d={dir > 0 ? "M0 6h10L5 0z" : "M0 0h10L5 6z"} />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

export const money = (n: number) => inr(n).replace("₹", "₹ ");

/** A read-only, worked-out amount (grey like the design's CGST / SGST boxes). */
export function Calc({ value, grey = false }: { value: string; grey?: boolean }) {
  return (
    <div className={`w-full rounded-md border border-slate-300 shadow-md px-3 py-2 text-xs tabular-nums ${grey ? "bg-slate-100 text-slate-800" : "bg-white text-slate-800"}`}>
      {value || <span className="text-slate-400">Example ₹ 1,18,000</span>}
    </div>
  );
}

export function AddPaymentModal({
  preset,
  onClose,
  onSaved
}: {
  /** Opened from a booking's brokerage — lead, property and type are pre-picked. */
  preset?: StBrokerageRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState<StBrokerageRow[]>(preset ? [preset] : []);
  const [loading, setLoading] = useState(!preset);
  const [paymentDate, setPaymentDate] = useState("");
  const [leadKey, setLeadKey] = useState(preset ? `${preset.lead_name}|${preset.lead_phone_number}` : "");
  const [bookingId, setBookingId] = useState(preset?.booking_id ?? "");
  const [type, setType] = useState<string>(preset?.brokerage_type ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [percentage, setPercentage] = useState("");
  const [tax, setTax] = useState<TaxType>("IGST");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (preset) return;
    apiStListBrokerages({}, 1, 1000, true)
      .then(r => setOpen(r.rows))
      .catch(err => {
        console.warn("Could not load brokerages:", err);
        setServerError("Couldn't load bookings. Close and try again.");
      })
      .finally(() => setLoading(false));
  }, [preset]);

  // Leads that still have brokerage left to split.
  const leadOptions = useMemo(() => {
    const m = new Map<string, { value: string; label: string }>();
    open.forEach(r => {
      const key = `${r.lead_name}|${r.lead_phone_number}`;
      if (!m.has(key)) m.set(key, { value: key, label: `${r.lead_name} · ${r.lead_phone_number}` });
    });
    return Array.from(m.values());
  }, [open]);

  // That lead's booked properties (one per booking).
  const leadRows = open.filter(r => `${r.lead_name}|${r.lead_phone_number}` === leadKey);
  const propertyOptions = useMemo(() => {
    const m = new Map<string, { value: string; label: string }>();
    leadRows.forEach(r => { if (!m.has(r.booking_id)) m.set(r.booking_id, { value: r.booking_id, label: `${r.property_name} · ${r.unit_number}` }); });
    return Array.from(m.values());
  }, [leadRows]);

  const bookingRows = open.filter(r => r.booking_id === bookingId);
  // The booking's own brokerage types that still have some left to split
  // (Basic / NRI / AOP, or a type added in the tracker).
  const typeOptions = bookingRows.map(r => ({ value: r.brokerage_type, label: typeLabel(r.brokerage_type) }));
  const selected = bookingRows.find(r => r.brokerage_type === type);
  const agreement = num(selected?.agreement_value ?? bookingRows[0]?.agreement_value);
  const leftPct = selected ? round(num(selected.broker_percentage) - num(selected.allocated_percentage), 4) : 0;
  const leftValue = selected ? round(num(selected.value) - num(selected.allocated), 2) : 0;

  // Amounts worked out from the % (Bhavuk): brokerage = % × agreement value.
  const p = parseNum(percentage);
  const amount = p > 0 && agreement > 0 ? round((agreement * p) / 100, 2) : 0;
  const taxAmount = round(amount * 0.18, 2);
  const half = round(amount * 0.09, 2);
  const total = round(amount + taxAmount, 2);

  const pickBooking = (id: string) => {
    setBookingId(id);
    const types = open.filter(r => r.booking_id === id);
    setType(types.length === 1 ? types[0].brokerage_type : "");
  };
  const pickLead = (key: string) => {
    setLeadKey(key);
    const bookings = Array.from(new Set(open.filter(r => `${r.lead_name}|${r.lead_phone_number}` === key).map(r => r.booking_id)));
    if (bookings.length === 1) pickBooking(bookings[0]);
    else { setBookingId(""); setType(""); }
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!paymentDate) e.date = "Select the payment date";
    if (!leadKey) e.lead = "Select the lead";
    if (!bookingId) e.property = "Select the property";
    if (!selected) e.type = "Select the brokerage type";
    if (!invoiceNumber.trim()) e.number = "Enter the invoice number";
    if (!(p > 0)) e.percentage = "Enter the brokerage %";
    else if (selected && p > leftPct) e.percentage = `Only ${leftPct}% is left to split`;
    else if (selected && amount > leftValue) e.percentage = `Only ${inr(leftValue)} is left to split`;
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    setServerError(null);
    try {
      // The server works the tax out again from the amount and saves it with the payment.
      await apiStCreatePayment({ brokerageId: selected!.brokerage_id, percentage: p, value: amount, invoiceNumber: invoiceNumber.trim(), taxType: tax });
      onSaved();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not create the payment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      extraWide
      formLook
      title="Create Payment"
      description="Add payment details to manage"
      onClose={onClose}
      headerRight={
        <div className="flex flex-col items-end">
          <div className="relative inline-block">
            <DatePicker
              value={paymentDate}
              onChange={setPaymentDate}
              maxDate={todayIso()}
              placeholder="Select Payment Date"
              iconLeft
              className="h-10 px-4 bg-white border border-slate-300 rounded-lg shadow-sm text-sm font-medium text-slate-800 hover:bg-slate-50"
            />
            <span className="absolute -top-2 -right-2.5 text-sm leading-none text-red-500" aria-hidden="true">*</span>
          </div>
          {errors.date && <p className="mt-1 text-[11px] font-semibold text-red-600">{errors.date}</p>}
        </div>
      }
      footer={null}
    >
      <FormError message={serverError} />
      <div className="grid grid-cols-1 md:grid-cols-3" style={{ columnGap: 40, rowGap: 22 }}>
        {/* Row 1 */}
        <F label="Select Lead" required error={errors.lead}>
          <SearchableSelect
            variant="boxed"
            options={leadOptions}
            value={leadKey}
            onChange={pickLead}
            placeholder={loading ? "Loading…" : "Search for leads who have booked"}
            searchPlaceholder="Search name or phone..."
            panelWidth={300}
            disabled={loading || !!preset}
          />
        </F>
        <F label="Select Property" required error={errors.property}>
          <SearchableSelect
            variant="boxed"
            options={propertyOptions}
            value={bookingId}
            onChange={pickBooking}
            placeholder="Search for property booked"
            searchPlaceholder={leadKey ? "Search properties..." : "Select the lead first"}
            panelWidth={280}
            disabled={!!preset}
          />
        </F>
        <F label="Select Brokerage Type" required error={errors.type} hint={selected ? `${pctText(leftPct)} · ${inr(leftValue)} left to split` : undefined}>
          <SearchableSelect
            variant="boxed"
            options={typeOptions}
            value={type}
            onChange={setType}
            placeholder="Select brokerage type , eg: basic"
            searchPlaceholder={bookingId ? "Search type..." : "Select the property first"}
            panelWidth={240}
            disabled={!!preset}
          />
        </F>

        {/* Row 2 */}
        <F label="Enter Invoice Number" required error={errors.number}>
          <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Input Invoice Number" maxLength={60} className={boxInput(!!errors.number)} />
        </F>
        <F label="Enter Brokerage Percent" required error={errors.percentage}>
          <PercentInput value={percentage} onChange={setPercentage} placeholder="Enter Brokerage Percent" bad={!!errors.percentage} />
        </F>
        <F label="Brokerage Amount" hint={agreement > 0 && amount ? `${p}% of agreement value ${inr(agreement)}` : undefined}>
          <Calc value={amount ? money(amount) : ""} />
        </F>

        {/* Row 3 */}
        <F label="Add Tax">
          <SearchableSelect variant="boxed" options={TAX_OPTIONS} value={tax} onChange={(v) => setTax(v as TaxType)} panelWidth={220} />
        </F>
        <F label="Total Tax Amount">
          <Calc value={amount ? money(taxAmount) : ""} />
        </F>
        <F label="Total Brokerage Amount">
          <Calc value={amount ? money(total) : ""} />
        </F>

        {/* Last row (design): CGST + SGST split (only for that tax, Bhavuk) ·
            the invoice illustration · Cancel / Create at the bottom right. */}
        <div className="space-y-5">
          {tax === "CGST_SGST" && (
            <>
              <F label="CGST @ 9%"><Calc grey value={money(amount ? half : 0)} /></F>
              <F label="SGST @ 9%"><Calc grey value={money(amount ? half : 0)} /></F>
            </>
          )}
        </div>
        <div className="hidden md:flex items-end justify-center pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/finance/invoice-illustration.png" alt="" aria-hidden="true" width={250} height={170} className="select-none" />
        </div>
        <div className="flex items-end justify-end gap-2">
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary" style={{ paddingInline: 28 }}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving} className="ui-btn ui-btn-primary" style={{ paddingInline: 28 }}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Move a payment one step forward
// ---------------------------------------------------------------------------

/** The fields AdvancePaymentModal / EditPaymentModal need — a Payments-tab row or a booking's own payment. */
export type PaymentForModal = Pick<
  StPaymentRow,
  "payment_id" | "payment_status" | "brokerage_type" | "brokerage_percentage" | "brokerage_value" |
  "invoice_number" | "invoice_raised_date" | "payment_received_date" | "lead_name" | "property_name"
>;

export function AdvancePaymentModal({
  payment, target: picked, onClose, onSaved
}: {
  payment: PaymentForModal;
  /** The status picked in the status menu; omitted = the next step (choosable here). */
  target?: StPaymentStatus;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { confirm } = useDialog();
  const raising = payment.payment_status === "PENDING" && picked !== "REJECTED";
  // From Invoice Raised: GST Pending is an optional step before Completed.
  const canGoGstPending = payment.payment_status === "INVOICE_RAISED" && picked !== "REJECTED";
  const [target, setTarget] = useState<"GST_PENDING" | "COMPLETED">(picked === "GST_PENDING" ? "GST_PENDING" : "COMPLETED");
  const toGstPending = canGoGstPending && target === "GST_PENDING";
  const next: StPaymentStatus = raising ? "INVOICE_RAISED" : toGstPending ? "GST_PENDING" : "COMPLETED";
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!toGstPending && !date) return setError(raising ? "Select the invoice raised date" : "Select the payment received date");
    setSaving(true);
    setServerError(null);
    try {
      await apiStAdvancePayment(payment.payment_id, date || todayIso(), undefined, raising ? undefined : target);
      onSaved();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not update the payment.");
    } finally {
      setSaving(false);
    }
  };

  const reject = async () => {
    const ok = picked === "REJECTED" || await confirm({
      title: "Reject this payment?",
      message: "It's marked Rejected and can't be changed after. Its amount can be invoiced again as a new payment, and the booking stays In Progress until that money is received.",
      confirmLabel: "Reject",
      danger: true
    });
    if (!ok) return;
    setSaving(true);
    setServerError(null);
    try {
      await apiStRejectPayment(payment.payment_id);
      onSaved();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not reject the payment.");
    } finally {
      setSaving(false);
    }
  };

  if (picked === "REJECTED") {
    return (
      <Modal
        title="Reject Payment"
        description={`${payment.lead_name} · ${typeLabel(payment.brokerage_type)} ${pctText(payment.brokerage_percentage)} · ${inr(payment.brokerage_value)}`}
        onClose={onClose}
        footer={
          <>
            <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">Cancel</button>
            <button type="button" onClick={reject} disabled={saving} className="ui-btn ui-btn-danger">
              {saving ? "Saving…" : "Reject"}
            </button>
          </>
        }
      >
        <FormError message={serverError} />
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <PaymentStatusBadge status={payment.payment_status} />
          <span>→</span>
          <PaymentStatusBadge status="REJECTED" />
        </div>
        <p className="text-xs text-slate-600">
          Invoice Number: <span className="font-semibold text-slate-900">{payment.invoice_number}</span>
        </p>
        <p className="text-[11px] text-slate-500">
          This can&apos;t be undone. The amount can be invoiced again as a new payment, and the booking stays In Progress until that money is received.
        </p>
      </Modal>
    );
  }

  const buttonText = raising ? "Raise Invoice" : toGstPending ? "Mark GST Pending" : "Mark Completed";
  return (
    <Modal
      title={raising ? "Raise Invoice" : "Update Payment"}
      description={`${payment.lead_name} · ${typeLabel(payment.brokerage_type)} ${pctText(payment.brokerage_percentage)} · ${inr(payment.brokerage_value)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={reject} disabled={saving} className="ui-btn ui-btn-secondary border text-red-600 hover:bg-red-50 mr-auto">
            Reject
          </button>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">Cancel</button>
          <button type="button" onClick={submit} disabled={saving} className="ui-btn ui-btn-primary">
            {saving ? "Saving…" : buttonText}
          </button>
        </>
      }
    >
      <FormError message={serverError} />
      {canGoGstPending && (
        <div className="ui-toggle">
          <button type="button" onClick={() => setTarget("COMPLETED")} className={`ui-toggle-item ${target === "COMPLETED" ? "ui-toggle-item-active" : ""}`}>
            Completed
          </button>
          <button type="button" onClick={() => setTarget("GST_PENDING")} className={`ui-toggle-item ${target === "GST_PENDING" ? "ui-toggle-item-active" : ""}`}>
            GST Pending
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <PaymentStatusBadge status={payment.payment_status} />
        <span>→</span>
        <PaymentStatusBadge status={next} />
      </div>
      <p className="text-xs text-slate-600">
        Invoice Number: <span className="font-semibold text-slate-900">{payment.invoice_number}</span>
      </p>
      {!toGstPending && (
        <Field label={raising ? "Invoice Raised Date" : "Payment Received Date"} error={error}>
          <DatePicker
            value={date}
            onChange={(v) => { setDate(v); setError(null); }}
            maxDate={todayIso()}
            minDate={raising ? undefined : payment.invoice_raised_date ?? undefined}
          />
        </Field>
      )}
      <p className="text-[11px] text-slate-500">
        A payment can only move forward, so this can&apos;t be undone. You can still correct the date later.
      </p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Edit a payment: % / value while Pending, dates after that
// ---------------------------------------------------------------------------

export function EditPaymentModal({ payment, onClose, onSaved }: { payment: PaymentForModal; onClose: () => void; onSaved: () => void }) {
  const pending = payment.payment_status === "PENDING";
  const completed = payment.payment_status === "COMPLETED";
  const [percentage, setPercentage] = useState(String(num(payment.brokerage_percentage)));
  const [value, setValue] = useState(String(num(payment.brokerage_value)));
  const [invoiceNumber, setInvoiceNumber] = useState(payment.invoice_number ?? "");
  const [invoiceDate, setInvoiceDate] = useState(payment.invoice_raised_date ?? "");
  const [receivedDate, setReceivedDate] = useState(payment.payment_received_date ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const e: Record<string, string> = {};
    const p = parseNum(percentage);
    const v = parseNum(value);
    if (!invoiceNumber.trim()) e.number = "Enter the invoice number";
    if (pending) {
      if (!(p > 0)) e.percentage = "Enter the %";
      if (!(v > 0)) e.value = "Enter the value";
    } else {
      if (!invoiceDate) e.invoice = "Select the invoice raised date";
      if (completed && !receivedDate) e.received = "Select the payment received date";
      if (completed && invoiceDate && receivedDate && receivedDate < invoiceDate) e.received = "Can't be before the invoice date";
    }
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    setServerError(null);
    try {
      await apiStUpdatePayment(
        payment.payment_id,
        pending
          ? { percentage: p, value: v, invoiceNumber: invoiceNumber.trim() }
          : {
              invoiceNumber: invoiceNumber.trim(),
              invoiceRaisedDate: invoiceDate,
              ...(completed ? { paymentReceivedDate: receivedDate } : {})
            }
      );
      onSaved();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not save the payment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Edit Payment"
      description={`${payment.lead_name} · ${payment.property_name} · ${typeLabel(payment.brokerage_type)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">Cancel</button>
          <button type="button" onClick={submit} disabled={saving} className="ui-btn ui-btn-primary">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </>
      }
    >
      <FormError message={serverError} />
      {pending ? (
        <>
        <Field label="Invoice Number" error={errors.number}>
          <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} maxLength={60} className={inputClass(!!errors.number)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brokerage %" error={errors.percentage}>
            <input type="number" inputMode="decimal" min={0} step="0.01" value={percentage} onChange={(e) => setPercentage(e.target.value)} className={inputClass(!!errors.percentage)} />
          </Field>
          <Field label="Value (₹)" error={errors.value} hint={inrShort(parseNum(value))}>
            <input type="number" inputMode="decimal" min={0} value={value} onChange={(e) => setValue(e.target.value)} className={inputClass(!!errors.value)} />
          </Field>
        </div>
        </>
      ) : (
        <>
          <p className="text-[11px] text-slate-500">
            {pctText(payment.brokerage_percentage)} · {inr(payment.brokerage_value)} — the amount can&apos;t change once the invoice is raised.
          </p>
          <Field label="Invoice Number" error={errors.number}>
            <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} maxLength={60} className={inputClass(!!errors.number)} />
          </Field>
          <Field label="Invoice Raised Date" error={errors.invoice}>
            <DatePicker value={invoiceDate} onChange={setInvoiceDate} maxDate={todayIso()} />
          </Field>
          {completed && (
            <Field label="Payment Received Date" error={errors.received}>
              <DatePicker value={receivedDate} onChange={setReceivedDate} maxDate={todayIso()} minDate={invoiceDate || undefined} />
            </Field>
          )}
        </>
      )}
      {!pending && <p className="text-[11px] text-slate-400">Raised on {dateText(payment.invoice_raised_date)}{completed ? ` · Received on ${dateText(payment.payment_received_date)}` : ""}</p>}
    </Modal>
  );
}
