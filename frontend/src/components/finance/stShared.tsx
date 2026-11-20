"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Check, Filter, Home, Search, X } from "lucide-react";
import { DropdownOption, SearchableMultiSelect, SearchableSelect } from "@/components/ui/SearchableDropdown";
import { useCloseOnScroll } from "@/lib/useCloseOnScroll";
import DateRangePicker, { DateRangeValue, formatDisplayDate } from "@/components/ui/DateRangePicker";
import { apiStAddOption, apiStLookups, StBookingStage, StBrokerageStatus, StBrokerageType, StFilters, StLookups, StPaymentStatus } from "@/lib/apiClient";

// Shared bits for Finance → Sales Tracker (app/(app)/dashboard/finance/page.tsx).

// --- Formatting ------------------------------------------------------------

export const num = (v: string | number | null | undefined) => Number(v ?? 0) || 0;

/** ₹1,20,00,000 — Indian grouping, no paise unless there are some. */
export function inr(v: string | number | null | undefined): string {
  const n = num(v);
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/** Short form for hints under money fields: ₹1.2 Cr / ₹3 L / ₹45,000. */
export function inrShort(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(2)} L`;
  return inr(n);
}

/** 2,00,00,000 — plain Indian grouping, as the list tables show amounts. */
export const amt = (v: string | number | null | undefined) => num(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const pctText = (v: string | number | null | undefined) => `${+num(v).toFixed(4)}%`;

export const dateText = (iso: string | null | undefined) => (iso ? formatDisplayDate(iso.slice(0, 10)) : "—");

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthText = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
};

/** This month and the 35 before it, newest first, as { value: "YYYY-MM", label: "Nov 2026" }. */
export const MONTH_OPTIONS = (() => {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < 36; i++) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ value, label: monthText(value) });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
})();

/** Parses a typed amount/percentage; "" or junk → NaN. */
export const parseNum = (s: string) => (s.trim() === "" ? NaN : Number(s));

// --- Labels and badges -----------------------------------------------------

const BUILT_IN_TYPE_LABEL: Record<string, string> = { BASIC: "Basic", NRI: "NRI", AOP: "AOP" };
/** Basic / NRI / AOP by code; a brokerage type added in the tracker is its own label. */
export const typeLabel = (t: StBrokerageType) => BUILT_IN_TYPE_LABEL[t] ?? t;

export const BROKERAGE_STATUS_LABEL: Record<StBrokerageStatus, string> = { PENDING: "Pending", IN_PROGRESS: "In Progress", CLOSED: "Closed" };
export const PAYMENT_STATUS_LABEL: Record<StPaymentStatus, string> = {
  PENDING: "Pending", INVOICE_RAISED: "Invoice Raised", GST_PENDING: "GST Pending", COMPLETED: "Completed", REJECTED: "Rejected"
};

// Soft pill badges, as in the Sales Tracker design.
const TONES = {
  orange: "bg-orange-100 text-orange-700",
  yellow: "bg-yellow-100 text-yellow-700",
  blue: "bg-blue-100 text-blue-600",
  green: "bg-green-100 text-green-700",
  slate: "bg-slate-100 text-slate-500",
  red: "bg-red-100 text-red-700"
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const BROKERAGE_TONE: Record<StBrokerageStatus, Tone> = { PENDING: "orange", IN_PROGRESS: "blue", CLOSED: "green" };
const PAYMENT_TONE: Record<StPaymentStatus, Tone> = {
  PENDING: "orange", INVOICE_RAISED: "yellow", GST_PENDING: "orange", COMPLETED: "green", REJECTED: "red"
};

export const BrokerageStatusBadge = ({ status }: { status: StBrokerageStatus }) => (
  <Badge tone={BROKERAGE_TONE[status]}>{BROKERAGE_STATUS_LABEL[status]}</Badge>
);
export const PaymentStatusBadge = ({ status }: { status: StPaymentStatus }) => (
  <Badge tone={PAYMENT_TONE[status]}>
    {status === "COMPLETED" && <Check className="h-3 w-3" />}
    {PAYMENT_STATUS_LABEL[status]}
  </Badge>
);

export const STAGE_LABEL: Record<StBookingStage, string> = {
  PENDING: "Pending", IN_PROGRESS: "In Progress", CLOSED: "Closed", CANCELLED: "Cancelled"
};
const STAGE_TONE: Record<StBookingStage, Tone> = { PENDING: "orange", IN_PROGRESS: "blue", CLOSED: "green", CANCELLED: "slate" };
/** A booking's overall Payment Status. */
export const StageBadge = ({ stage }: { stage: StBookingStage }) => <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>;
export function BookingStatusBadge({ status, cancelled }: { status: "ACTIVE" | "CLOSED"; cancelled: boolean }) {
  if (cancelled) return <Badge tone="slate">Cancelled</Badge>;
  return status === "CLOSED" ? <Badge tone="green">Closed</Badge> : <Badge tone="blue">Active</Badge>;
}

/** Thin bar: how much of a brokerage is split into payments / received. */
export function SplitBar({ total, allocated, received }: { total: number; allocated: number; received: number }) {
  const a = total > 0 ? Math.min(100, (allocated / total) * 100) : 0;
  const r = total > 0 ? Math.min(100, (received / total) * 100) : 0;
  return (
    <div className="relative h-1.5 w-full rounded-full bg-slate-100 overflow-hidden" title={`Split ${inr(allocated)} · Received ${inr(received)} of ${inr(total)}`}>
      <div className="absolute inset-y-0 left-0 bg-blue-200" style={{ width: `${a}%` }} />
      <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: `${r}%` }} />
    </div>
  );
}

// --- Lookups (properties + CRM users), fetched once per page load -----------

export interface Lookups {
  properties: { value: string; label: string }[];
  users: { value: string; label: string }[];
  /** Property Type dropdown: 1–4 BHK / Villa / Plot plus any added by hand. */
  propertyTypes: string[];
  /** Brokerage Type dropdown: Basic / NRI / AOP plus any added by hand. */
  brokerageTypes: { value: StBrokerageType; label: string }[];
  /** Saves a typed-in property type / brokerage type so it's in the dropdown from now on. */
  addOption: (kind: "PROPERTY_TYPE" | "BROKERAGE_TYPE", value: string) => Promise<void>;
}

type LookupData = Omit<Lookups, "addOption">;
const EMPTY_LOOKUPS: LookupData = { properties: [], users: [], propertyTypes: [], brokerageTypes: [] };
const toLookupData = (r: StLookups): LookupData => ({
  properties: r.properties.map(p => ({ value: p.id, label: p.name })),
  users: r.users.map(u => ({ value: u.id, label: u.name })),
  propertyTypes: r.propertyTypes,
  brokerageTypes: r.brokerageTypes
});

let lookupsPromise: Promise<LookupData> | null = null;
// Every mounted useLookups, so an added option shows in all open dropdowns at once.
const lookupListeners = new Set<(l: LookupData) => void>();

async function addLookupOption(kind: "PROPERTY_TYPE" | "BROKERAGE_TYPE", value: string) {
  const next = toLookupData(await apiStAddOption(kind, value));
  lookupsPromise = Promise.resolve(next);
  lookupListeners.forEach(fn => fn(next));
}

export function useLookups(): Lookups {
  const [lookups, setLookups] = useState<LookupData>(EMPTY_LOOKUPS);
  useEffect(() => {
    if (!lookupsPromise) {
      lookupsPromise = apiStLookups()
        .then(toLookupData)
        .catch(err => {
          lookupsPromise = null;
          throw err;
        });
    }
    let active = true;
    lookupListeners.add(setLookups);
    lookupsPromise.then(l => { if (active) setLookups(l); }).catch(err => console.warn("Could not load Sales Tracker lookups:", err));
    return () => { active = false; lookupListeners.delete(setLookups); };
  }, []);
  return { ...lookups, addOption: addLookupOption };
}

// --- Filter bar ------------------------------------------------------------

export interface FilterState {
  search: string;
  propertyId: string[];
  salespersonId: string[];
  brokerageType: string[];
  status: string[];
  dateRange: DateRangeValue | null;
  month: string;
}

export const EMPTY_FILTERS: FilterState = {
  search: "", propertyId: [], salespersonId: [], brokerageType: [], status: [], dateRange: null, month: ""
};

export const toApiFilters = (f: FilterState): StFilters => ({
  search: f.search.trim() || undefined,
  propertyId: f.propertyId,
  salespersonId: f.salespersonId,
  brokerageType: f.brokerageType,
  status: f.status,
  from: f.dateRange?.start,
  to: f.dateRange?.end,
  month: f.month || undefined
});

/** Search box text, applied 300ms after typing stops. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type FilterKey = "property" | "salesperson" | "type" | "status" | "date" | "month";

export function FilterBar({
  value,
  onChange,
  show,
  statusOptions,
  searchPlaceholder,
  lookups,
  actions
}: {
  value: FilterState;
  onChange: (next: FilterState) => void;
  show: FilterKey[];
  statusOptions?: { value: string; label: string }[];
  searchPlaceholder: string;
  lookups: Lookups;
  /** Buttons on the right (e.g. Add Booking). */
  actions?: React.ReactNode;
}) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const hasFilters =
    !!value.search || value.propertyId.length > 0 || value.salespersonId.length > 0 || value.brokerageType.length > 0 ||
    value.status.length > 0 || !!value.dateRange || !!value.month;

  return (
    <div className="bg-slate-100/70 border border-slate-200/60 rounded-2xl shadow-sm p-3 flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={value.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder={searchPlaceholder}
          className="w-full h-9 bg-white border border-slate-300/80 rounded-xl pl-9 pr-3 text-[13px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0B1E6E]"
        />
      </div>
      {show.includes("property") && (
        <SearchableMultiSelect
          variant="toolbar"
          label="Property"
          options={lookups.properties}
          selected={value.propertyId}
          onChange={(v) => set({ propertyId: v })}
          searchPlaceholder="Search properties..."
          panelWidth={260}
        />
      )}
      {show.includes("salesperson") && (
        <SearchableMultiSelect
          variant="toolbar"
          label="Salesperson"
          options={lookups.users}
          selected={value.salespersonId}
          onChange={(v) => set({ salespersonId: v })}
          searchPlaceholder="Search people..."
          panelWidth={240}
        />
      )}
      {show.includes("type") && (
        <SearchableMultiSelect
          variant="toolbar"
          label="Brokerage Type"
          options={lookups.brokerageTypes}
          selected={value.brokerageType}
          onChange={(v) => set({ brokerageType: v })}
        />
      )}
      {show.includes("status") && statusOptions && (
        <SearchableMultiSelect
          variant="toolbar"
          label="Status"
          options={statusOptions}
          selected={value.status}
          onChange={(v) => set({ status: v })}
        />
      )}
      {show.includes("date") && (
        <DateRangePicker value={value.dateRange} onChange={(v) => set({ dateRange: v })} emptyLabel="Booking Date" maxDate="" />
      )}
      {show.includes("month") && (
        <SearchableSelect
          variant="toolbar"
          options={MONTH_OPTIONS}
          value={value.month}
          onChange={(v) => set({ month: v })}
          placeholder="Month"
          searchPlaceholder="Search months..."
          clearable
        />
      )}
      {hasFilters && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="inline-flex items-center gap-1 h-9 px-2 text-[13px] font-semibold text-slate-500 hover:text-slate-800"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      )}
      {actions && <div className="flex items-center gap-2 sm:ml-auto">{actions}</div>}
    </div>
  );
}

// --- Modal shell -----------------------------------------------------------

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  wide = false,
  extraWide = false,
  headerRight,
  formLook = false
}: {
  title: string;
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  wide?: boolean;
  /** Three-column forms (Create Payment). */
  extraWide?: boolean;
  /** Shown on the right of the title row (e.g. a date picker). */
  headerRight?: React.ReactNode;
  /** Big bold title, divider inset under the subtitle row, no line above the buttons (Create Payment design). */
  formLook?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portaled: the page sits inside an animated (transformed) container,
  // which would otherwise clip a fixed overlay to the content area.
  return createPortal(
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] ${extraWide ? "" : wide ? "max-w-2xl" : "max-w-md"} bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 flex flex-col max-h-[90vh]`}
        style={extraWide ? { maxWidth: 1040 } : undefined}
      >
        <div
          className={`flex items-start justify-between gap-3 ${formLook ? "border-b border-slate-200" : "px-6 pt-5 pb-4 border-b border-slate-100"}`}
          style={formLook ? { margin: "0 32px", padding: "28px 0 20px" } : undefined}
        >
          <div className="min-w-0 flex-1 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h3 className={formLook ? "text-2xl font-bold text-slate-900" : "ui-title"}>{title}</h3>
              {description && <p className={formLook ? "text-sm text-slate-700" : "ui-desc mt-0.5"} style={formLook ? { marginTop: 20 } : undefined}>{description}</p>}
            </div>
            {headerRight}
          </div>
          <button type="button" onClick={onClose} className="p-1 -mr-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-50" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={`overflow-y-auto space-y-4 ${formLook ? "" : "px-6 py-5"}`} style={formLook ? { padding: footer ? "24px 32px" : "24px 32px 32px" } : undefined}>{children}</div>
        {footer && (
          <div className={`flex justify-end gap-2 ${formLook ? "" : "px-6 py-4 border-t border-slate-100"}`} style={formLook ? { padding: "4px 32px 28px" } : undefined}>{footer}</div>
        )}
      </div>
    </>,
    document.body
  );
}

export function Field({ label, hint, error, children }: { label: React.ReactNode; hint?: React.ReactNode; error?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
      {error ? <p className="mt-1 text-[11px] font-semibold text-red-600">{error}</p> : hint ? <p className="mt-1 text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

export const inputClass = (hasError = false) =>
  `w-full bg-slate-50 border rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 placeholder:font-medium placeholder:text-slate-400 focus:outline-none focus:border-[#0B1E6E] disabled:opacity-60 ${
    hasError ? "border-red-400" : "border-slate-200"
  }`;

const ADD_NEW = "__add_new__";

/**
 * A dropdown whose last option is "+ Add new…": picking it swaps in a small
 * text box, and Save stores the new value (Property Type / Brokerage Type)
 * for everyone, then selects it.
 */
export function AddableSelect({
  kind, options, value, onChange, onAdd, placeholder, variant = "field", panelWidth = 220, inputClassName
}: {
  kind: "PROPERTY_TYPE" | "BROKERAGE_TYPE";
  options: DropdownOption[];
  value: string;
  onChange: (next: string) => void;
  onAdd: Lookups["addOption"];
  placeholder?: string;
  variant?: "field" | "boxed";
  panelWidth?: number;
  /** Class for the text box shown while adding (match the form's inputs). */
  inputClassName?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const v = text.trim();
    if (!v || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd(kind, v);
      onChange(v);
      setAdding(false);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save it. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (adding) {
    return (
      <div>
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") setAdding(false); }}
            maxLength={50}
            placeholder={kind === "PROPERTY_TYPE" ? "New property type" : "New brokerage type"}
            className={inputClassName ?? inputClass()}
          />
          <button type="button" onClick={save} disabled={!text.trim() || saving} className="ui-btn ui-btn-primary shrink-0 disabled:bg-slate-300">
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => { setAdding(false); setError(null); }} className="ui-btn ui-btn-secondary border shrink-0">
            Cancel
          </button>
        </div>
        {error && <p className="mt-1 text-[11px] font-semibold text-red-600">{error}</p>}
      </div>
    );
  }
  return (
    <SearchableSelect
      variant={variant}
      options={[...options, { value: ADD_NEW, label: "+ Add new…" }]}
      value={value}
      onChange={(v) => (v === ADD_NEW ? setAdding(true) : onChange(v))}
      placeholder={placeholder}
      panelWidth={panelWidth}
    />
  );
}

/** Inline error box at the top of a modal (server refusals). */
export const FormError = ({ message }: { message: string | null }) =>
  message ? <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">{message}</div> : null;

// --- Design pieces: page card, header filters, table cards -----------------

/** Page cards reach the bottom of the screen even when their content is short (design). */
export const FULL_HEIGHT: React.CSSProperties = { minHeight: "calc(100vh - 12rem)" };

/** The big white card each tab sits in: title on the left, filters/actions on the right. */
export function PageCard({ title, right, children }: { title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm" style={FULL_HEIGHT}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
        <h2 className="ui-title">{title}</h2>
        {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}

/** Date Range · Property · Month, as the design's header buttons. */
export function HeaderFilters({
  value,
  onChange,
  lookups,
  noMonth = false
}: {
  value: FilterState;
  onChange: (f: FilterState) => void;
  lookups: Lookups;
  /** Booking Approval's design has only Date Range + Property. */
  noMonth?: boolean;
}) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  return (
    <>
      <DateRangePicker value={value.dateRange} onChange={(v) => set({ dateRange: v })} label={value.dateRange ? undefined : "Date Range"} maxDate="" />
      <SearchableMultiSelect
        variant="toolbar"
        label="Property"
        icon={<Home className="h-4 w-4 text-blue-600" />}
        options={lookups.properties}
        selected={value.propertyId}
        onChange={(v) => set({ propertyId: v })}
        searchPlaceholder="Search properties..."
        panelWidth={260}
        align="right"
      />
      {!noMonth && <MonthSelect value={value.month} onChange={(v) => set({ month: v })} />}
    </>
  );
}

export function MonthSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <SearchableSelect
      variant="toolbar"
      icon={<CalendarDays className="h-4 w-4 text-blue-600" />}
      options={MONTH_OPTIONS}
      value={value}
      onChange={onChange}
      placeholder="Month"
      searchPlaceholder="Search months..."
      align="right"
      clearable
    />
  );
}

/** A bordered inner card holding one table (Recent bookings, Overdue payments...). */
export function TableCard({ title, right, children }: { title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
          {title ? <h3 className="ui-subheading">{title}</h3> : <span />}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/** Table classes shared by the design's plain tables. */
export const TH = "px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap";
export const TD = "px-4 py-3 text-xs text-slate-700 whitespace-nowrap";

export function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-8 text-center text-xs italic text-slate-400">{text}</td>
    </tr>
  );
}

// --- Column-header status filter (design: "Payment Status ▼" funnel) -------

/**
 * Header text with a funnel after it; opens a small panel — "Select All" on
 * top, then one checkbox + coloured badge per status. No search box: the
 * list is short. Funnel turns blue while a filter is applied.
 */
export function StatusHeaderFilter<T extends string>({
  label,
  options,
  selected,
  onChange,
  renderBadge
}: {
  label: string;
  options: T[];
  selected: string[];
  onChange: (next: string[]) => void;
  renderBadge: (value: T) => React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
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

  const open = () => {
    if (pos) return close();
    const r = triggerRef.current!.getBoundingClientRect();
    const width = 200;
    setPos({ top: r.bottom + 6, left: Math.min(Math.max(8, r.right - width + 24), window.innerWidth - width - 8) });
  };

  const allOn = options.length > 0 && options.every(o => selected.includes(o));
  const toggle = (v: T) => onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);
  const box = "h-4 w-4 rounded border-slate-400 text-[#0B1E6E] focus:ring-0 cursor-pointer";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        aria-expanded={!!pos}
        className="inline-flex items-center gap-1.5 font-bold text-slate-800 whitespace-nowrap rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {label}
        {/* Solid funnel, as in the design — blue while a filter is applied. */}
        <Filter fill="currentColor" className={`h-3.5 w-3.5 ${selected.length ? "text-blue-600" : "text-slate-800"}`} />
      </button>
      {pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: pos.top, left: pos.left, width: 200 }}
            className="fixed z-[210] rounded-xl border border-slate-900 bg-white p-3 shadow-md normal-case tracking-normal"
          >
            <label className="flex items-center justify-end gap-2 pb-2 text-xs font-medium text-slate-600 cursor-pointer">
              Select All
              <input type="checkbox" className={box} checked={allOn} onChange={() => onChange(allOn ? [] : [...options])} />
            </label>
            <div className="space-y-2.5 pt-1">
              {options.map(o => (
                <label key={o} className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" className={box} checked={selected.includes(o)} onChange={() => toggle(o)} />
                  {renderBadge(o)}
                </label>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
