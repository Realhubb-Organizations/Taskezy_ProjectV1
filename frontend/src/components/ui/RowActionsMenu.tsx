"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export interface RowAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Shown as a tooltip, e.g. why an action is disabled. */
  title?: string;
  /** Red, separated from the others by a divider (Delete, Remove...). */
  danger?: boolean;
}

// A table row's Actions cell as one "⋯" button — same look as the
// Properties table's row menu. The menu is portaled and fixed-positioned so
// a scrolling table container can't clip it; it closes on outside click,
// Escape, scroll or resize.
export default function RowActionsMenu({ actions, label = "Row actions" }: { actions: RowAction[]; label?: string }) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  if (actions.length === 0) return null;
  const normal = actions.filter(a => !a.danger);
  const danger = actions.filter(a => a.danger);
  const item = "w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-sm transition-colors disabled:opacity-40 disabled:hover:bg-transparent";
  const run = (a: RowAction) => {
    if (a.disabled) return;
    setPos(null);
    a.onClick();
  };
  const menuHeight = actions.length * 42 + (danger.length && normal.length ? 13 : 0) + 12;

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          setPos(prev => (prev ? null : { top: r.bottom + 4, right: window.innerWidth - r.right }));
        }}
        className={`inline-flex items-center justify-center h-8 w-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors ${pos ? "bg-slate-200 text-slate-800" : ""}`}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {pos && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setPos(null); }} />
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{ top: Math.max(8, Math.min(pos.top, window.innerHeight - menuHeight - 8)), right: Math.max(8, pos.right) }}
            className="fixed z-50 min-w-[11rem] py-1.5 bg-white border border-slate-200 rounded-xl shadow-lg text-slate-700"
          >
            {normal.map(a => (
              <button key={a.label} type="button" role="menuitem" onClick={() => run(a)} disabled={a.disabled} title={a.title} className={`${item} hover:bg-slate-50`}>
                {a.icon}
                {a.label}
              </button>
            ))}
            {danger.length > 0 && normal.length > 0 && <div className="my-1.5 border-t border-slate-100" />}
            {danger.map(a => (
              <button key={a.label} type="button" role="menuitem" onClick={() => run(a)} disabled={a.disabled} title={a.title} className={`${item} text-red-600 hover:bg-red-50`}>
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  );
}
