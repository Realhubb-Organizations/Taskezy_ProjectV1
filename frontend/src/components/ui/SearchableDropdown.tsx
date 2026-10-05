"use client";

import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";
import { useCloseOnScroll } from "@/lib/useCloseOnScroll";

// The one dropdown used across CRM (every role): a trigger + a body-portaled
// panel with a search box and checkbox rows. Two flavours share everything
// but the value shape:
//   SearchableMultiSelect — filters; any number of values, [] = no filter.
//   SearchableSelect      — fields that store exactly one value (a lead's
//                           status/agent/property, rows per page, ...).
// Portaled so modals, drawers and scrolling tables never clip the panel.

export interface DropdownOption {
  value: string;
  label: string;
  /** Options sharing a group are listed under that heading, in first-seen order. */
  group?: string;
}

type OptionsInput = (string | DropdownOption)[];

/**
 * Trigger styles:
 *   field  — full-width form input (modals, drawers, forms)
 *   pill   — compact bordered filter button (toolbars, card headers)
 *   inline — bare text + chevron (table column headers, footers)
 */
export type DropdownVariant = "field" | "pill" | "inline";

interface CommonProps {
  options: OptionsInput;
  /** Shown on the trigger when nothing is selected. */
  placeholder?: string;
  searchPlaceholder?: string;
  variant?: DropdownVariant;
  /** Fixed trigger text (e.g. a column header "Status"); the selection then shows as a count badge. */
  label?: string;
  /** Renders an option's label (e.g. with a platform icon) in rows and on the trigger. */
  renderLabel?: (label: string) => React.ReactNode;
  /** Minimum panel width in px; the panel is never narrower than the trigger. */
  panelWidth?: number;
  align?: "left" | "right";
  disabled?: boolean;
  className?: string;
  title?: string;
}

const normalize = (options: OptionsInput): DropdownOption[] =>
  options.map(o => (typeof o === "string" ? { value: o, label: o } : o));

const TRIGGER_BASE: Record<DropdownVariant, string> = {
  field:
    "w-full flex items-center justify-between gap-2 bg-slate-50 border rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none transition-all",
  pill:
    "inline-flex items-center gap-1.5 bg-white border rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors max-w-[220px]",
  inline: "inline-flex items-center gap-1 font-bold hover:text-brand-700 whitespace-nowrap"
};

// Autofocusing the search box on touch screens opens the keyboard and shuts the panel.
const finePointer = () => typeof window === "undefined" || window.matchMedia("(pointer: fine)").matches;

function useDropdownPanel(align: "left" | "right", minWidth: number) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);
  useCloseOnScroll(open, close, panelRef);

  const place = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, minWidth);
    const left = align === "right" ? rect.right - width : rect.left;
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    // Flip above the trigger when there's clearly more room there.
    const flip = below < 240 && above > below;
    const maxHeight = Math.min(360, flip ? above : below);
    setPos({
      top: flip ? rect.top - 6 - maxHeight : rect.bottom + 6,
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
      width,
      maxHeight: Math.max(160, maxHeight)
    });
  };

  const toggle = () => {
    if (open) return close();
    setQuery("");
    place();
    setOpen(true);
  };

  // Keep a flipped panel hugging its trigger once its real height is known.
  useLayoutEffect(() => {
    if (!open || !pos || !panelRef.current || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const h = panelRef.current.offsetHeight;
    if (pos.top < rect.top && pos.top + h < rect.top - 6) {
      setPos(p => (p ? { ...p, top: rect.top - 6 - h } : p));
    }
  }, [open, pos, query]);

  return { open, close, toggle, query, setQuery, pos, triggerRef, panelRef };
}

function Panel({
  state,
  options,
  searchPlaceholder,
  renderRow,
  footer
}: {
  state: ReturnType<typeof useDropdownPanel>;
  options: DropdownOption[];
  searchPlaceholder: string;
  renderRow: (opt: DropdownOption) => React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { pos, panelRef, query, setQuery, close } = state;
  const q = query.trim().toLowerCase();
  const filtered = options.filter(o => !q || o.label.toLowerCase().includes(q));

  const groups: { name: string | undefined; items: DropdownOption[] }[] = [];
  for (const o of filtered) {
    const g = groups.find(x => x.name === o.group);
    if (g) g.items.push(o);
    else groups.push({ name: o.group, items: [o] });
  }

  if (!pos) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[200]" onClick={close} />
      <div
        ref={panelRef}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}
        className="fixed z-[210] bg-white border border-slate-200 rounded-xl shadow-lg flex flex-col overflow-hidden text-left normal-case tracking-normal"
        style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
      >
        <div className="p-1.5 border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search className="h-3 w-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              autoFocus={finePointer()}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-6 pr-2 py-1.5 text-[11px] font-semibold text-slate-700 focus:outline-none focus:border-[#0B1E6E]"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-slate-400 italic font-normal">
              {options.length === 0 ? "No options yet" : "No matches found"}
            </p>
          ) : (
            groups.map(g => (
              <div key={g.name ?? "__ungrouped"}>
                {g.name && (
                  <p className="px-3 pt-1.5 pb-0.5 text-[9px] font-extrabold uppercase tracking-wide text-slate-400">{g.name}</p>
                )}
                {g.items.map(renderRow)}
              </div>
            ))
          )}
        </div>
        {footer}
      </div>
    </>,
    document.body
  );
}

const rowClass = "flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer";
const checkboxClass = "h-3.5 w-3.5 shrink-0 rounded border-slate-300 accent-[#0B1E6E] focus:ring-0";

function Trigger({
  state,
  variant,
  active,
  disabled,
  className,
  title,
  children
}: {
  state: ReturnType<typeof useDropdownPanel>;
  variant: DropdownVariant;
  active: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const border =
    variant === "inline"
      ? active ? "text-blue-700" : ""
      : state.open
        ? "border-[#0B1E6E] bg-white"
        : active && variant === "pill" ? "border-blue-300 text-blue-700" : "border-slate-200";
  return (
    <button
      type="button"
      ref={state.triggerRef}
      onClick={state.toggle}
      disabled={disabled}
      title={title}
      className={`${TRIGGER_BASE[variant]} ${border} disabled:opacity-50 disabled:cursor-not-allowed ${className ?? ""}`}
    >
      {children}
      <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${state.open ? "rotate-180" : ""}`} />
    </button>
  );
}

const CountBadge = ({ n }: { n: number }) =>
  n > 0 ? <span className="bg-blue-600 text-white rounded-full px-1.5 text-[10px] leading-4 shrink-0">{n}</span> : null;

export function SearchableMultiSelect({
  options,
  selected,
  onChange,
  placeholder = "All",
  searchPlaceholder = "Search...",
  variant = "pill",
  label,
  renderLabel,
  panelWidth = 220,
  align = "left",
  disabled,
  className,
  title
}: CommonProps & { selected: string[]; onChange: (next: string[]) => void }) {
  const state = useDropdownPanel(align, panelWidth);
  const opts = useMemo(() => normalize(options), [options]);
  const labelOf = (v: string) => opts.find(o => o.value === v)?.label ?? v;
  const render = (l: string) => (renderLabel ? renderLabel(l) : l);

  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(s => s !== v) : [...selected, v]);
  const allSelected = opts.length > 0 && opts.every(o => selected.includes(o.value));

  let triggerContent: React.ReactNode;
  if (label) {
    triggerContent = <><span className="truncate">{label}</span><CountBadge n={selected.length} /></>;
  } else if (selected.length === 0) {
    triggerContent = <span className={`truncate ${variant === "field" ? "text-slate-400 font-semibold" : ""}`}>{placeholder}</span>;
  } else if (selected.length === 1) {
    triggerContent = <span className="truncate">{render(labelOf(selected[0]))}</span>;
  } else {
    triggerContent = (
      <>
        <span className="truncate">{labelOf(selected[0])}</span>
        <span className="bg-blue-600 text-white rounded-full px-1.5 text-[10px] leading-4 shrink-0">+{selected.length - 1}</span>
      </>
    );
  }

  return (
    <>
      <Trigger state={state} variant={variant} active={selected.length > 0} disabled={disabled} className={className} title={title}>
        {triggerContent}
      </Trigger>
      {state.open && (
        <Panel
          state={state}
          options={opts}
          searchPlaceholder={searchPlaceholder}
          renderRow={(o) => (
            <label key={o.value} className={rowClass}>
              <input type="checkbox" className={checkboxClass} checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
              <span className="truncate">{render(o.label)}</span>
            </label>
          )}
          footer={
            opts.length > 0 && (
              <div className="shrink-0 border-t border-slate-100 px-3 py-1.5 flex justify-between items-center text-[11px]">
                <button
                  type="button"
                  onClick={() => onChange(allSelected ? [] : opts.map(o => o.value))}
                  className="font-bold text-slate-500 hover:text-[#0B1E6E]"
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
                {selected.length > 0 && (
                  <span className="flex items-center gap-2">
                    <span className="text-slate-500 font-semibold">{selected.length} selected</span>
                    <button type="button" onClick={() => onChange([])} className="font-bold text-blue-600 hover:underline">Clear</button>
                  </span>
                )}
              </div>
            )
          }
        />
      )}
    </>
  );
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  variant = "field",
  label,
  renderLabel,
  panelWidth = 200,
  align = "left",
  disabled,
  className,
  title,
  clearable = false
}: CommonProps & {
  value: string;
  onChange: (next: string) => void;
  /** Adds a "Clear selection" row that sets the value back to "". */
  clearable?: boolean;
}) {
  const state = useDropdownPanel(align, panelWidth);
  const opts = useMemo(() => normalize(options), [options]);
  const selectedOpt = opts.find(o => o.value === value);
  const render = (l: string) => (renderLabel ? renderLabel(l) : l);
  const hasValue = !!selectedOpt || value !== "";

  const triggerContent = label ? (
    <span className="truncate">{label}</span>
  ) : hasValue ? (
    <span className="truncate">{render(selectedOpt?.label ?? value)}</span>
  ) : (
    <span className={`truncate ${variant === "field" ? "text-slate-400 font-semibold" : ""}`}>{placeholder}</span>
  );

  const pick = (v: string) => { onChange(v); state.close(); };

  return (
    <>
      <Trigger state={state} variant={variant} active={!!label && value !== ""} disabled={disabled} className={className} title={title}>
        {triggerContent}
      </Trigger>
      {state.open && (
        <Panel
          state={state}
          options={opts}
          searchPlaceholder={searchPlaceholder}
          renderRow={(o) => (
            <label key={o.value} className={`${rowClass} ${o.value === value ? "bg-blue-50/60 text-[#0B1E6E]" : ""}`}>
              <input type="checkbox" className={checkboxClass} checked={o.value === value} onChange={() => pick(o.value)} />
              <span className="truncate">{render(o.label)}</span>
            </label>
          )}
          footer={
            clearable && value !== "" && (
              <div className="shrink-0 border-t border-slate-100 px-3 py-1.5 text-[11px]">
                <button type="button" onClick={() => pick("")} className="font-bold text-blue-600 hover:underline">Clear selection</button>
              </div>
            )
          }
        />
      )}
    </>
  );
}
