"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableDropdown";
import { DatePicker, todayIso } from "@/components/ui/DateRangePicker";
import {
  apiStBookedLeads, apiStCreateBooking, apiStSaveBrokerage, apiStUpdateBooking,
  StBookedLead, StBooking, StBookingDetail, StBrokerageType
} from "@/lib/apiClient";
import {
  AddableSelect, BrokerageStatusBadge, Field, FormError, Lookups, Modal, typeLabel, inputClass, inr, inrShort, num, parseNum, pctText
} from "./stShared";
import { Calc, F, PercentInput, boxInput, money, round } from "./PaymentModals";

type BrokerageRow = { percentage: string; value: string };
const EMPTY_ROW: BrokerageRow = { percentage: "", value: "" };

/** Property Type options; a booking's own older free-text type stays pickable. */
const propertyTypeOptions = (types: string[], current: string) =>
  (current && !types.includes(current) ? [current, ...types] : types).map(t => ({ value: t, label: t }));

/**
 * Add Booking, or (with `booking`) Edit Booking Details — the edit form also
 * holds the brokerage % and value for each of the booking's types.
 */
export function BookingModal({
  booking,
  lookups,
  onClose,
  onSaved,
  onCancelBooking
}: {
  booking?: StBooking;
  lookups: Lookups;
  onClose: () => void;
  onSaved: (saved: StBookingDetail) => void;
  /** Edit only: shows a "Cancel this booking" link in the footer. */
  onCancelBooking?: () => void;
}) {
  const isEdit = !!booking;
  const [leads, setLeads] = useState<StBookedLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadId, setLeadId] = useState(booking?.lead_id ?? "");
  const [propertyId, setPropertyId] = useState(booking?.property_id ?? "");
  const [salespersonId, setSalespersonId] = useState(booking?.employee_id ?? "");
  const [bhkType, setBhkType] = useState(booking?.bhk_type ?? "");
  const [unitNumber, setUnitNumber] = useState(booking?.unit_number ?? "");
  const [propertyArea, setPropertyArea] = useState(booking?.property_area ? String(num(booking.property_area)) : "");
  const [source, setSource] = useState(booking?.source ?? "");
  const [agreementValue, setAgreementValue] = useState(booking ? String(num(booking.agreement_value)) : "");
  const [types, setTypes] = useState<StBrokerageType[]>(booking?.brokerage_type ?? []);
  const [cashback, setCashback] = useState(booking?.cashback ?? false);
  const [cashbackAmount, setCashbackAmount] = useState(booking?.cashback_amount ? String(num(booking.cashback_amount)) : "");
  const [bookingDate, setBookingDate] = useState(booking?.booking_date ?? "");
  const [brokerage, setBrokerage] = useState<Record<StBrokerageType, BrokerageRow>>(() => {
    const rows: Record<StBrokerageType, BrokerageRow> = {};
    (booking?.brokerages ?? []).forEach(b => {
      rows[b.type] = { percentage: String(num(b.percentage)), value: String(num(b.value)) };
    });
    return rows;
  });
  const rowOf = (t: StBrokerageType) => brokerage[t] ?? EMPTY_ROW;
  // Basic / NRI / AOP + added types, plus any on this booking that's not in the list.
  const allTypes = useMemo(() => {
    const listed = lookups.brokerageTypes.map(o => o.value);
    return [...listed, ...types.filter(t => !listed.includes(t))];
  }, [lookups.brokerageTypes, types]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Types that already have brokerage details can't be taken off the booking.
  const existing = useMemo(() => new Map((booking?.brokerages ?? []).map(b => [b.type, b])), [booking]);

  useEffect(() => {
    apiStBookedLeads()
      .then(setLeads)
      .catch(err => {
        console.warn("Could not load booked leads:", err);
        setServerError("Couldn't load the Booked leads. Close and try again.");
      })
      .finally(() => setLeadsLoading(false));
  }, []);

  // Only leads approved in Booking Approval can be booked.
  const leadOptions = useMemo(() => {
    const opts = leads.filter(l => l.approval === "APPROVED").map(l => ({
      value: l.id,
      label: `${l.name} · ${l.phone}`,
      group: l.has_booking && l.id !== booking?.lead_id ? "Already in the tracker" : "Booked leads"
    }));
    // Editing a booking whose lead has since left "Booked" — keep it pickable.
    if (booking?.lead_id && !leads.some(l => l.id === booking.lead_id)) {
      opts.unshift({ value: booking.lead_id, label: `${booking.lead_name} · ${booking.lead_phone_number}`, group: "Booked leads" });
    }
    return opts.sort((a, b) => (a.group === b.group ? 0 : a.group === "Booked leads" ? -1 : 1));
  }, [leads, booking]);

  const selectedLead = leads.find(l => l.id === leadId);
  const phone = selectedLead?.phone ?? (leadId && leadId === booking?.lead_id ? booking.lead_phone_number : "");
  const agreement = parseNum(agreementValue);

  const toggleType = (t: StBrokerageType) => {
    if (existing.has(t)) return;
    setTypes(prev => (prev.includes(t) ? prev.filter(x => x !== t) : allTypes.filter(x => x === t || prev.includes(x))));
  };
  const setRow = (t: StBrokerageType, patch: Partial<BrokerageRow>) =>
    setBrokerage(prev => ({ ...prev, [t]: { ...(prev[t] ?? EMPTY_ROW), ...patch } }));
  const [addingType, setAddingType] = useState(false);

  const submit = async () => {
    const e: Record<string, string> = {};
    const cashbackNum = parseNum(cashbackAmount);
    const area = parseNum(propertyArea);
    if (!leadId) e.lead = "Select the lead";
    if (!propertyId) e.property = "Select the property";
    if (!salespersonId) e.salesperson = "Select the salesperson";
    if (!bhkType.trim()) e.bhk = "Enter the property type";
    if (!unitNumber.trim()) e.unit = "Enter the unit number";
    if (propertyArea.trim() && !(area > 0)) e.area = "Enter the area in sq ft";
    if (!(agreement > 0)) e.agreement = "Enter the agreement value";
    if (types.length === 0) e.types = "Select at least one brokerage type";
    if (cashback && !(cashbackNum > 0)) e.cashback = "Enter the cashback amount";
    if (!bookingDate) e.date = "Select the booking date";

    // Brokerage (edit only): a type left blank is filled later; a half-filled one is an error.
    const items: { type: StBrokerageType; percentage: number; value: number }[] = [];
    if (isEdit) {
      for (const t of types) {
        const r = rowOf(t);
        const blank = r.percentage.trim() === "" && r.value.trim() === "";
        if (blank && !existing.has(t)) continue;
        const p = parseNum(r.percentage);
        const v = parseNum(r.value);
        if (!(p > 0 && p <= 100)) e[`${t}-p`] = "Enter a % between 0 and 100";
        if (!(v > 0)) e[`${t}-v`] = "Enter the value";
        items.push({ type: t, percentage: p, value: v });
      }
    }
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    setServerError(null);
    const input = {
      leadId, propertyId, salespersonId,
      bhkType: bhkType.trim(), unitNumber: unitNumber.trim(),
      agreementValue: agreement, brokerageType: types,
      cashback, cashbackAmount: cashback ? cashbackNum : null,
      bookingDate,
      propertyArea: propertyArea.trim() ? area : null,
      source: source.trim() || null
    };
    try {
      let saved = isEdit ? await apiStUpdateBooking(booking!.booking_id, input) : await apiStCreateBooking(input);
      if (items.length) saved = await apiStSaveBrokerage(saved.booking_id, items);
      onSaved(saved);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not save the booking.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      wide
      title={isEdit ? "Edit Booking Details" : "Add Booking"}
      description={isEdit ? `${booking!.lead_name} · ${booking!.property_name}` : "Only leads with status Booked are listed."}
      onClose={onClose}
      footer={
        <>
          {isEdit && onCancelBooking && (
            <button type="button" onClick={onCancelBooking} className="mr-auto text-[13px] font-semibold text-red-600 hover:underline">
              Cancel this booking
            </button>
          )}
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">Cancel</button>
          <button type="button" onClick={submit} disabled={saving} className="ui-btn ui-btn-primary">
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Save Booking"}
          </button>
        </>
      }
    >
      <FormError message={serverError} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Lead Name" error={errors.lead}>
          <SearchableSelect
            options={leadOptions}
            value={leadId}
            onChange={setLeadId}
            placeholder={leadsLoading ? "Loading leads…" : "Search and select lead"}
            searchPlaceholder="Search name or phone..."
            panelWidth={320}
            disabled={leadsLoading}
          />
        </Field>
        <Field label="Phone Number" hint={leadId ? undefined : "Filled from the lead"}>
          <input value={phone} readOnly disabled placeholder="—" className={inputClass()} />
        </Field>
        <Field label="Property" error={errors.property}>
          <SearchableSelect
            options={lookups.properties}
            value={propertyId}
            onChange={setPropertyId}
            placeholder="Search and select property"
            searchPlaceholder="Search properties..."
            panelWidth={300}
          />
        </Field>
        <Field label="Salesperson" error={errors.salesperson}>
          <SearchableSelect
            options={lookups.users}
            value={salespersonId}
            onChange={setSalespersonId}
            placeholder="Select salesperson"
            searchPlaceholder="Search people..."
            panelWidth={260}
          />
        </Field>
        <Field label="Property Type" error={errors.bhk}>
          <AddableSelect
            kind="PROPERTY_TYPE"
            options={propertyTypeOptions(lookups.propertyTypes, bhkType)}
            value={bhkType}
            onChange={setBhkType}
            onAdd={lookups.addOption}
            placeholder="Select property type"
          />
        </Field>
        <Field label="Unit Number" error={errors.unit}>
          <input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder="e.g. T2-402" maxLength={50} className={inputClass(!!errors.unit)} />
        </Field>
        <Field label="Property Area (sq ft)" error={errors.area}>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={propertyArea}
            onChange={(e) => setPropertyArea(e.target.value)}
            placeholder="e.g. 2190"
            className={inputClass(!!errors.area)}
          />
        </Field>
        <Field label="Source">
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Referral" maxLength={100} className={inputClass()} />
        </Field>
        <Field label="Agreement Value (₹)" error={errors.agreement} hint={inrShort(agreement)}>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={agreementValue}
            onChange={(e) => setAgreementValue(e.target.value)}
            placeholder="e.g. 10000000"
            className={inputClass(!!errors.agreement)}
          />
        </Field>
        <Field label="Booking Date" error={errors.date}>
          <DatePicker value={bookingDate} onChange={setBookingDate} maxDate={todayIso()} />
        </Field>
      </div>

      <Field
        label="Brokerage Type"
        error={errors.types}
        hint={existing.size > 0 ? "Types that already have brokerage added can't be removed." : "Select one or more."}
      >
        <div className="flex flex-wrap items-center gap-2">
          {allTypes.map(t => {
            const on = types.includes(t);
            const locked = existing.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                disabled={locked}
                title={locked ? "Brokerage is already added for this type" : undefined}
                className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border text-[13px] font-semibold transition-colors ${
                  on ? "bg-[#0B1E6E] border-[#0B1E6E] text-white" : "bg-white border-slate-300 text-slate-600 hover:bg-slate-50"
                } ${locked ? "cursor-not-allowed opacity-80" : ""}`}
              >
                {on && <Check className="h-3.5 w-3.5" />}
                {typeLabel(t)}
              </button>
            );
          })}
          {addingType ? (
            <div className="w-full max-w-sm">
              <AddableSelect
                kind="BROKERAGE_TYPE"
                options={[]}
                value=""
                onChange={(v) => { setAddingType(false); setTypes(prev => (prev.includes(v) ? prev : [...prev, v])); }}
                onAdd={lookups.addOption}
                placeholder="Add a brokerage type"
              />
            </div>
          ) : (
            <button type="button" onClick={() => setAddingType(true)} className="text-[12px] font-semibold text-[#0B1E6E] hover:underline">
              + Add new type
            </button>
          )}
        </div>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Cashback">
          <div className="ui-toggle">
            <button type="button" onClick={() => setCashback(false)} className={`ui-toggle-item ${!cashback ? "ui-toggle-item-active" : ""}`}>No</button>
            <button type="button" onClick={() => setCashback(true)} className={`ui-toggle-item ${cashback ? "ui-toggle-item-active" : ""}`}>Yes</button>
          </div>
        </Field>
        {cashback && (
          <Field label="Cashback Amount (₹)" error={errors.cashback} hint={inrShort(parseNum(cashbackAmount))}>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={cashbackAmount}
              onChange={(e) => setCashbackAmount(e.target.value)}
              placeholder="e.g. 100000"
              className={inputClass(!!errors.cashback)}
            />
          </Field>
        )}
      </div>

      {isEdit && types.length > 0 && (
        <div className="space-y-3 pt-2">
          <div>
            <p className="ui-subheading">Brokerage Details</p>
            <p className="ui-desc mt-0.5">The % and value for each brokerage type. Leave a type empty to add it later.</p>
          </div>
          {types.map(t => {
            const b = existing.get(t);
            const p = parseNum(rowOf(t).percentage);
            return (
              <div key={t} className={`rounded-xl border p-4 space-y-3 ${b ? "border-slate-200" : "border-red-200 bg-red-50/40"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">{typeLabel(t)}</p>
                  {b ? <BrokerageStatusBadge status={b.status} /> : <span className="text-[11px] font-semibold text-red-600">Not added yet</span>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Brokerage %"
                    error={errors[`${t}-p`]}
                    hint={p > 0 && agreement > 0 ? `${p}% of agreement = ${inr(Math.round(agreement * p) / 100)}` : undefined}
                  >
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step="0.01"
                      value={rowOf(t).percentage}
                      onChange={(e) => setRow(t, { percentage: e.target.value })}
                      placeholder="e.g. 3"
                      className={inputClass(!!errors[`${t}-p`])}
                    />
                  </Field>
                  <Field label="Brokerage Value (₹)" error={errors[`${t}-v`]} hint={inrShort(parseNum(rowOf(t).value))}>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={rowOf(t).value}
                      onChange={(e) => setRow(t, { value: e.target.value })}
                      placeholder="e.g. 300000"
                      className={inputClass(!!errors[`${t}-v`])}
                    />
                  </Field>
                </div>
                {b && b.paymentCount > 0 && (
                  <p className="text-[11px] text-slate-500">
                    {pctText(b.allocatedPercentage)} ({inr(b.allocated)}) is already split into {b.paymentCount} payment
                    {b.paymentCount === 1 ? "" : "s"}, so the brokerage can&apos;t go below that.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Add Booking (design): booking details + brokerage per type in one go
// ---------------------------------------------------------------------------

type TypeRow = { key: number; type: StBrokerageType | ""; percentage: string };

export function AddBookingModal({
  lookups,
  onClose,
  onSaved,
  initialLead
}: {
  lookups: Lookups;
  onClose: () => void;
  onSaved: (saved: StBookingDetail) => void;
  /** Booking Approval's ✓: the lead (and its property) start pre-picked. */
  initialLead?: StBookedLead;
}) {
  const [leads, setLeads] = useState<StBookedLead[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [bookingDate, setBookingDate] = useState("");
  const [leadId, setLeadId] = useState(initialLead?.id ?? "");
  const [propertyId, setPropertyId] = useState(initialLead?.property_id ?? "");
  const [bhkType, setBhkType] = useState("");
  const [agreementValue, setAgreementValue] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [propertyArea, setPropertyArea] = useState("");
  const [source, setSource] = useState("");
  const [rows, setRows] = useState<TypeRow[]>([{ key: 1, type: "BASIC", percentage: "" }]);
  const [salespersonId, setSalespersonId] = useState("");
  // Optional: empty = no cashback.
  const [cashbackAmount, setCashbackAmount] = useState("");
  // Row 2: the booking's total brokerage %, typed in; the types below must add up to it.
  const [totalPctInput, setTotalPctInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiStBookedLeads()
      .then(setLeads)
      .catch(err => {
        console.warn("Could not load booked leads:", err);
        setServerError("Couldn't load the Booked leads. Close and try again.");
      })
      .finally(() => setLeadsLoading(false));
  }, []);

  const leadOptions = useMemo(
    () =>
      leads
        // Only leads approved in Booking Approval can be booked.
        .filter(l => l.approval === "APPROVED")
        .map(l => ({ value: l.id, label: `${l.name} · ${l.phone}`, group: l.has_booking ? "Already in the tracker" : "Approved leads" }))
        .sort((a, b) => (a.group === b.group ? 0 : a.group === "Approved leads" ? -1 : 1)),
    [leads]
  );

  const agreement = parseNum(agreementValue);
  const amountOf = (pct: string) => {
    const p = parseNum(pct);
    return p > 0 && agreement > 0 ? round((agreement * p) / 100, 2) : 0;
  };
  // Row 2 of the design: the booking's total brokerage %, typed in. The type
  // lines below must add up to it (compared in 1/10000ths to dodge float noise).
  const typesPct = round(rows.reduce((sum, r) => sum + (parseNum(r.percentage) || 0), 0), 4);
  const totalPct = parseNum(totalPctInput);
  const totalAmount = amountOf(totalPctInput);
  const totalMismatch = totalPct > 0 && Math.round(typesPct * 10000) !== Math.round(totalPct * 10000);

  const usedTypes = rows.map(r => r.type).filter(Boolean);
  const allTypes = lookups.brokerageTypes.map(o => o.value);
  const typeOptionsFor = (row: TypeRow) =>
    lookups.brokerageTypes.map(o => ({ ...o, disabled: o.value !== row.type && usedTypes.includes(o.value), disabledHint: "Already added" }));
  const setRow = (key: number, patch: Partial<TypeRow>) => setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => {
    const next = allTypes.find(t => !usedTypes.includes(t)) ?? "";
    setRows(prev => [...prev, { key: Date.now(), type: next, percentage: "" }]);
  };
  const removeRow = (key: number) => setRows(prev => prev.filter(r => r.key !== key));

  const submit = async () => {
    const e: Record<string, string> = {};
    const area = parseNum(propertyArea);
    if (!bookingDate) e.date = "Select the booking date";
    if (!leadId) e.lead = "Select the lead";
    if (!propertyId) e.property = "Select the property";
    if (!bhkType.trim()) e.bhk = "Select the property type";
    if (!(agreement > 0)) e.agreement = "Enter the agreement value";
    if (!unitNumber.trim()) e.unit = "Enter the unit number";
    if (propertyArea.trim() && !(area > 0)) e.area = "Enter the area in sq ft";
    if (!salespersonId) e.salesperson = "Select the salesperson";
    const cashback = parseNum(cashbackAmount);
    if (cashbackAmount.trim() && !(cashback > 0)) e.cashback = "Enter a valid amount, or leave it empty";
    if (rows.length === 0) e.types = "Add at least one brokerage type";
    if (totalPctInput.trim() !== "" && !(totalPct > 0 && totalPct <= 100)) e.total = "Enter a % between 0 and 100";
    else if (totalMismatch) e.total = `The types below add up to ${typesPct}%, not ${totalPct}%`;
    rows.forEach(r => {
      if (!r.type) e[`t${r.key}`] = "Select the type";
      const p = parseNum(r.percentage);
      if (r.percentage.trim() !== "" && !(p > 0 && p <= 100)) e[`p${r.key}`] = "Enter a % between 0 and 100";
    });
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    setServerError(null);
    try {
      let saved = await apiStCreateBooking({
        leadId, propertyId, salespersonId,
        bhkType: bhkType.trim(), unitNumber: unitNumber.trim(),
        agreementValue: agreement,
        brokerageType: rows.map(r => r.type as StBrokerageType),
        cashback: cashback > 0, cashbackAmount: cashback > 0 ? cashback : null,
        bookingDate,
        propertyArea: propertyArea.trim() ? area : null,
        source: source.trim() || null
      });
      // Types given a % get their brokerage now; the rest show red until added.
      const items = rows
        .filter(r => parseNum(r.percentage) > 0)
        .map(r => ({ type: r.type as StBrokerageType, percentage: parseNum(r.percentage), value: amountOf(r.percentage) }));
      if (items.length) saved = await apiStSaveBrokerage(saved.booking_id, items);
      onSaved(saved);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not save the booking.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      extraWide
      formLook
      title="Add Booking"
      description="Add booking details to manage system more smoothly"
      onClose={onClose}
      headerRight={
        <div className="flex flex-col items-end">
          <div className="relative inline-block">
            <DatePicker
              value={bookingDate}
              onChange={setBookingDate}
              maxDate={todayIso()}
              placeholder="Select Booking Date"
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
        <F label="Select Lead" error={errors.lead}>
          <SearchableSelect
            variant="boxed"
            options={leadOptions}
            value={leadId}
            onChange={setLeadId}
            placeholder={leadsLoading ? "Loading…" : "Search approved bookings"}
            searchPlaceholder="Search name or phone..."
            panelWidth={320}
            disabled={leadsLoading}
          />
        </F>
        <F label="Select Property" error={errors.property}>
          <SearchableSelect
            variant="boxed"
            options={lookups.properties}
            value={propertyId}
            onChange={setPropertyId}
            placeholder="Search for property booked"
            searchPlaceholder="Search properties..."
            panelWidth={300}
          />
        </F>
        <F label="Enter Property Type" error={errors.bhk}>
          <AddableSelect
            kind="PROPERTY_TYPE"
            variant="boxed"
            options={propertyTypeOptions(lookups.propertyTypes, bhkType)}
            value={bhkType}
            onChange={setBhkType}
            onAdd={lookups.addOption}
            placeholder="Select property type"
            inputClassName={boxInput(!!errors.bhk)}
          />
        </F>

        {/* Row 2 */}
        <F label="Enter Agreement Value" error={errors.agreement} hint={inrShort(agreement)}>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={agreementValue}
            onChange={(e) => setAgreementValue(e.target.value)}
            placeholder="Enter Agreement Value"
            className={boxInput(!!errors.agreement)}
          />
        </F>
        <F label="Enter Brokerage Percent" error={errors.total}>
          <PercentInput value={totalPctInput} onChange={setTotalPctInput} placeholder="Enter Brokerage Percent" bad={!!errors.total || totalMismatch} />
          {/* Live check, before Create is pressed */}
          {!errors.total && totalMismatch && (
            <p className="mt-1 text-[11px] font-semibold text-red-600">The types below add up to {typesPct}%, not {totalPct}%</p>
          )}
        </F>
        <F label="Brokerage Amount">
          <Calc value={totalAmount ? money(totalAmount) : ""} />
        </F>

        {/* Row 3 */}
        <F label="Enter Unit Number" error={errors.unit}>
          <input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder="Enter Unit Number" maxLength={50} className={boxInput(!!errors.unit)} />
        </F>
        <F label="Enter Property Area" error={errors.area}>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={propertyArea}
            onChange={(e) => setPropertyArea(e.target.value)}
            placeholder="Example : 2100 Sqft"
            className={boxInput(!!errors.area)}
          />
        </F>
        <F label="Enter Source">
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Example : Google ads Campaign name" maxLength={100} className={boxInput()} />
        </F>

        {/* Row 4: one line per brokerage type — type · % · amount */}
        <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3" style={{ columnGap: 40, rowGap: 8 }}>
          <p className="text-[13px] font-semibold text-slate-900">Select Brokerage Types</p>
          <p className="hidden md:block text-[13px] font-semibold text-slate-900">Enter Brokerage Percent</p>
          <p className="hidden md:block text-[13px] font-semibold text-slate-900">Brokerage Amount</p>
          {rows.map((r, i) => (
            <React.Fragment key={r.key}>
              <div className="relative">
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => removeRow(r.key)}
                    aria-label={`Remove ${r.type ? typeLabel(r.type) : "this"} brokerage`}
                    title="Remove"
                    className="absolute -left-7 top-1/2 -translate-y-1/2 h-[18px] w-[18px] rounded-full border-[1.5px] border-slate-800 flex items-center justify-center text-slate-800 hover:bg-slate-100"
                  >
                    <span className="block h-[1.5px] w-2 bg-current" />
                  </button>
                )}
                <AddableSelect
                  kind="BROKERAGE_TYPE"
                  variant="boxed"
                  options={typeOptionsFor(r)}
                  value={r.type}
                  onChange={(v) => setRow(r.key, { type: v })}
                  onAdd={lookups.addOption}
                  placeholder="Select type"
                  panelWidth={200}
                  inputClassName={boxInput()}
                />
                {errors[`t${r.key}`] && <p className="mt-1 text-[11px] font-semibold text-red-600">{errors[`t${r.key}`]}</p>}
              </div>
              <div>
                <PercentInput
                  value={r.percentage}
                  onChange={(v) => setRow(r.key, { percentage: v })}
                  placeholder={`Enter ${r.type ? typeLabel(r.type) : ""} Brokerage Percent`.replace("  ", " ")}
                  bad={!!errors[`p${r.key}`]}
                />
                {errors[`p${r.key}`] && <p className="mt-1 text-[11px] font-semibold text-red-600">{errors[`p${r.key}`]}</p>}
              </div>
              <Calc value={amountOf(r.percentage) ? money(amountOf(r.percentage)) : ""} />
            </React.Fragment>
          ))}
          {(rows.length < allTypes.length || allTypes.length === 0) && (
            <button type="button" onClick={addRow} className="justify-self-start text-[12px] font-semibold text-[#0B1E6E] hover:underline">
              + Add brokerage type
            </button>
          )}
          {errors.types && <p className="text-[11px] font-semibold text-red-600">{errors.types}</p>}
        </div>

        {/* Last row: salesperson · Cancel / Create bottom right */}
        <F label="Select Salesperson" error={errors.salesperson}>
          <SearchableSelect
            variant="boxed"
            options={lookups.users}
            value={salespersonId}
            onChange={setSalespersonId}
            placeholder="Search Salesperson"
            searchPlaceholder="Search people..."
            panelWidth={260}
          />
        </F>
        <F label="Cashback (optional)" error={errors.cashback} hint={inrShort(parseNum(cashbackAmount))}>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={cashbackAmount}
            onChange={(e) => setCashbackAmount(e.target.value)}
            placeholder="Example ₹ 1,00,000"
            className={boxInput(!!errors.cashback)}
          />
        </F>
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
