"use client";

import React, { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCloseOnScroll } from "@/lib/useCloseOnScroll";

// The one calendar used across CRM (every role). Clicking the trigger opens
// the month calendar straight away:
//   [ dd-mm-yyyy  To  dd-mm-yyyy ]      ← typeable, underline = end being picked
//   ‹        September 2026        ›
//   Su Mo Tu We Th Fr Sa                ← ends solid blue, days between light blue
//   [Close]                  [Apply]
// Deliberately no preset shortcuts (Today / Last 7 days / ...).
//   DateRangePicker — a from/to range (filters). `value` null = no range.
//   DatePicker      — a single date (form fields).
// All values are local-date strings, YYYY-MM-DD.

export interface DateRangeValue {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const PANEL_WIDTH = 308;

const pad = (n: number) => String(n).padStart(2, "0");
export const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => toIsoDate(new Date());
const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
/** YYYY-MM-DD → dd-mm-yyyy (the format shown to users). */
export const formatDisplayDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
};
/** dd-mm-yyyy (also dd/mm/yyyy, dd.mm.yyyy) → YYYY-MM-DD, or null if not a real date. */
const parseDisplayDate = (text: string): string | null => {
  const m = text.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
  return toIsoDate(d);
};

// Positions a fixed panel under its trigger (flipping above when there's no
// room below) and closes it on outside scroll — shared by both pickers.
function usePanel() {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = () => setPos(null);
  useCloseOnScroll(!!pos, close, panelRef);

  const open = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8));
    setPos({ top: rect.bottom + 6, left });
  };

  useLayoutEffect(() => {
    if (!pos || !panelRef.current || !triggerRef.current) return;
    const h = panelRef.current.offsetHeight;
    const rect = triggerRef.current.getBoundingClientRect();
    if (rect.bottom + 6 + h > window.innerHeight - 8 && rect.top - 6 - h > 8 && pos.top > rect.top) {
      setPos(p => (p ? { ...p, top: rect.top - 6 - h } : p));
    }
  }, [pos]);

  return { pos, open, close, triggerRef, panelRef };
}

function MonthGrid({
  month,
  onMonthChange,
  isStart,
  isEnd,
  isBetween,
  isDisabled,
  onPick,
  onHover
}: {
  month: Date; // first day of the shown month
  onMonthChange: (m: Date) => void;
  isStart: (iso: string) => boolean;
  isEnd: (iso: string) => boolean;
  isBetween: (iso: string) => boolean;
  isDisabled: (iso: string) => boolean;
  onPick: (iso: string) => void;
  onHover?: (iso: string | null) => void;
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const lead = new Date(year, m, 1).getDay();
  const days = new Date(year, m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => toIsoDate(new Date(year, m, i + 1)))
  ];

  return (
    <div className="px-4" onMouseLeave={() => onHover?.(null)}>
      <div className="flex items-center justify-between py-3">
        <button type="button" onClick={() => onMonthChange(new Date(year, m - 1, 1))} className="p-1 rounded-md text-slate-600 hover:bg-slate-100" aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-slate-700">
          {month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        </span>
        <button type="button" onClick={() => onMonthChange(new Date(year, m + 1, 1))} className="p-1 rounded-md text-slate-600 hover:bg-slate-100" aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map(d => (
          <span key={d} className="py-1.5 text-[11px] font-medium text-slate-500">{d}</span>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <span key={`blank-${i}`} />;
          const disabled = isDisabled(iso);
          const end = isStart(iso) || isEnd(iso);
          const between = !end && isBetween(iso);
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onPick(iso)}
              onMouseEnter={() => onHover?.(iso)}
              className={`h-9 text-[13px] tabular-nums transition-colors ${
                end
                  ? "bg-[#3370E8] text-white font-semibold"
                  : between
                    ? "bg-[#9BB8F3] text-white"
                    : disabled
                      ? "text-slate-300 cursor-not-allowed"
                      : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {Number(iso.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PanelFooter({ onClose, onApply, canApply }: { onClose: () => void; onApply: () => void; canApply: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 pt-4 pb-4">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-1.5 rounded-lg border border-[#3370E8] text-[#3370E8] text-xs font-semibold hover:bg-blue-50 transition-colors"
      >
        Close
      </button>
      <button
        type="button"
        onClick={onApply}
        disabled={!canApply}
        className="px-4 py-1.5 rounded-lg bg-[#3370E8] text-white text-xs font-semibold hover:bg-[#2A5FCC] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Apply
      </button>
    </div>
  );
}

// Typeable date in the header pill; commits on blur / Enter when valid.
function HeaderDateInput({
  value,
  active,
  onFocus,
  onCommit,
  placeholder = "dd-mm-yyyy"
}: {
  value: string;
  active: boolean;
  onFocus: () => void;
  onCommit: (iso: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(formatDisplayDate(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(formatDisplayDate(value));
  }
  const commit = () => {
    const iso = parseDisplayDate(text);
    if (iso) onCommit(iso);
    else setText(formatDisplayDate(value));
  };
  return (
    <input
      value={text}
      onFocus={onFocus}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
      placeholder={placeholder}
      className={`w-[92px] bg-transparent text-center text-[13px] tabular-nums text-slate-700 placeholder:text-slate-400 outline-none border-b-2 pb-0.5 transition-colors ${
        active ? "border-[#3370E8]" : "border-transparent"
      }`}
    />
  );
}

const triggerClass =
  "flex items-center gap-2 bg-white border border-slate-300/80 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-medium shadow-2xs hover:bg-slate-50 transition-colors";

export default function DateRangePicker({
  value,
  onChange,
  emptyLabel = "All Dates",
  maxDate = todayIso(),
  minDate,
  clearable = true,
  className
}: {
  value: DateRangeValue | null;
  onChange: (v: DateRangeValue | null) => void;
  emptyLabel?: string;
  /** Latest pickable day (YYYY-MM-DD). Defaults to today — filters can't look into the future. Pass "" for no limit. */
  maxDate?: string;
  minDate?: string;
  /** Shows an × on the trigger to remove an applied range. */
  clearable?: boolean;
  /** @deprecated kept for existing callers; the calendar has no heading. */
  heading?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <span className={`inline-flex items-center ${className ?? ""}`}>
        <button ref={anchorRef} type="button" onClick={() => setOpen(o => !o)} className={triggerClass}>
          <Calendar className="h-3.5 w-3.5 text-blue-600" />
          <span className="tabular-nums">
            {value ? `${formatDisplayDate(value.start)} To ${formatDisplayDate(value.end)}` : emptyLabel}
          </span>
          {clearable && value && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear date range"
              onClick={(e) => { e.stopPropagation(); onChange(null); setOpen(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onChange(null); } }}
              className="-mr-1 p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </button>
      </span>
      {open && (
        <RangeCalendarPanel
          anchorRef={anchorRef}
          initial={value}
          maxDate={maxDate}
          minDate={minDate}
          onApply={(v) => { onChange(v); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/**
 * The range calendar on its own, opened under any element (`anchorRef`) —
 * used by DateRangePicker's button and by DateRangeSelect's "Custom" option.
 * Mount it to open; it calls onApply with the picked range or onClose.
 */
export function RangeCalendarPanel({
  anchorRef,
  initial,
  maxDate = todayIso(),
  minDate,
  onApply,
  onClose
}: {
  anchorRef: React.RefObject<HTMLElement>;
  initial: DateRangeValue | null;
  maxDate?: string;
  minDate?: string;
  onApply: (v: DateRangeValue) => void;
  onClose: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useCloseOnScroll(!!pos, onClose, panelRef);

  const [start, setStart] = useState(initial?.start || "");
  const [end, setEnd] = useState(initial?.end || "");
  const [picking, setPicking] = useState<"start" | "end">("start");
  const [hover, setHover] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const anchor = initial?.end ? fromIso(initial.end) : new Date();
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });

  // Place under the anchor, flipping above when there's no room below.
  useLayoutEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8));
    const h = panelRef.current?.offsetHeight ?? 0;
    const fitsBelow = rect.bottom + 6 + h <= window.innerHeight - 8;
    const top = !pos || fitsBelow || rect.top - 6 - h < 8 ? rect.bottom + 6 : rect.top - 6 - h;
    if (!pos || pos.top !== top || pos.left !== left) setPos({ top, left });
  }, [anchorRef, pos]);

  const isDisabled = (iso: string) => (!!maxDate && iso > maxDate) || (!!minDate && iso < minDate);

  const pick = (iso: string) => {
    if (picking === "start" || !start || (start && end)) {
      setStart(iso);
      setEnd("");
      setPicking("end");
    } else if (iso < start) {
      setStart(iso);
    } else {
      setEnd(iso);
      setPicking("start");
    }
  };

  // While choosing the end, preview the range up to the hovered day.
  const previewEnd = picking === "end" && start && !end && hover && hover >= start ? hover : end;
  const canApply = !!start && !!end && end >= start;
  const apply = () => { if (canApply) onApply({ start, end }); };

  return createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={onClose} />
          <div
            ref={panelRef}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
            className="fixed z-[210] max-w-[calc(100vw-1rem)] bg-white rounded-2xl shadow-2xl border border-slate-100"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? 0, width: PANEL_WIDTH }}
          >
            <div className="flex justify-center pt-4">
              <div className="flex items-center gap-2 rounded-full bg-white shadow-md border border-slate-100 px-4 py-1.5">
                <HeaderDateInput
                  value={start}
                  active={picking === "start"}
                  onFocus={() => setPicking("start")}
                  onCommit={(iso) => {
                    if (isDisabled(iso)) return;
                    setStart(iso);
                    if (end && end < iso) setEnd("");
                    setMonth(new Date(fromIso(iso).getFullYear(), fromIso(iso).getMonth(), 1));
                    setPicking("end");
                  }}
                />
                <span className="text-xs text-slate-500">To</span>
                <HeaderDateInput
                  value={end}
                  active={picking === "end"}
                  onFocus={() => setPicking("end")}
                  onCommit={(iso) => {
                    if (isDisabled(iso) || (start && iso < start)) return;
                    setEnd(iso);
                    setMonth(new Date(fromIso(iso).getFullYear(), fromIso(iso).getMonth(), 1));
                    setPicking("start");
                  }}
                />
              </div>
            </div>
            <MonthGrid
              month={month}
              onMonthChange={setMonth}
              isStart={(iso) => iso === start}
              isEnd={(iso) => iso === (previewEnd || "")}
              isBetween={(iso) => !!start && !!previewEnd && iso > start && iso < previewEnd}
              isDisabled={isDisabled}
              onPick={pick}
              onHover={setHover}
            />
            <PanelFooter onClose={onClose} onApply={apply} canApply={canApply} />
          </div>
        </>,
        document.body
  );
}

/**
 * Single-date field with the same calendar — drop-in for `<input type="date">`
 * in forms. `value` / `onChange` use YYYY-MM-DD ("" = empty).
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "dd-mm-yyyy",
  minDate,
  maxDate,
  disabled,
  className
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
  /** Classes for the trigger; defaults to the app's form-field look. */
  className?: string;
}) {
  const panel = usePanel();
  const [draft, setDraft] = useState("");
  const [month, setMonth] = useState(() => new Date());

  const openPanel = () => {
    if (panel.pos) return panel.close();
    setDraft(value);
    const anchor = value ? fromIso(value) : new Date();
    setMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    panel.open();
  };

  const isDisabled = (iso: string) => (!!maxDate && iso > maxDate) || (!!minDate && iso < minDate);
  const apply = () => { if (!draft) return; onChange(draft); panel.close(); };

  return (
    <>
      <button
        ref={panel.triggerRef}
        type="button"
        onClick={openPanel}
        disabled={disabled}
        className={
          className ??
          "w-full flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
        }
      >
        <span className={`tabular-nums ${value ? "" : "text-slate-400"}`}>{value ? formatDisplayDate(value) : placeholder}</span>
        <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      </button>
      {panel.pos && createPortal(
        <>
          <div className="fixed inset-0 z-[200]" onClick={panel.close} />
          <div
            ref={panel.panelRef}
            onKeyDown={(e) => { if (e.key === "Escape") panel.close(); }}
            className="fixed z-[210] max-w-[calc(100vw-1rem)] bg-white rounded-2xl shadow-2xl border border-slate-100"
            style={{ top: panel.pos.top, left: panel.pos.left, width: PANEL_WIDTH }}
          >
            <div className="flex justify-center pt-4">
              <div className="flex items-center rounded-full bg-white shadow-md border border-slate-100 px-4 py-1.5">
                <HeaderDateInput
                  value={draft}
                  active
                  onFocus={() => undefined}
                  onCommit={(iso) => {
                    if (isDisabled(iso)) return;
                    setDraft(iso);
                    setMonth(new Date(fromIso(iso).getFullYear(), fromIso(iso).getMonth(), 1));
                  }}
                />
              </div>
            </div>
            <MonthGrid
              month={month}
              onMonthChange={setMonth}
              isStart={(iso) => iso === draft}
              isEnd={() => false}
              isBetween={() => false}
              isDisabled={isDisabled}
              onPick={setDraft}
            />
            <PanelFooter onClose={panel.close} onApply={apply} canApply={!!draft} />
          </div>
        </>,
        document.body
      )}
    </>
  );
}
