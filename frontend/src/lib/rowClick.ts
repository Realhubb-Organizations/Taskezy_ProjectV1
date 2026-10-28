import type React from "react";

// Click anywhere on a table row to open that record — except the row's own
// controls (checkbox, dropdowns, buttons, links), their portaled panels, or
// while the user is selecting text. Pair with the LEAD_ROW_CLASS hover look.
export function openOnRowClick(open: () => void) {
  return (e: React.MouseEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (!e.currentTarget.contains(target)) return;
    if (target.closest("button, a, input, select, textarea, label, [role='button'], [role='combobox'], [role='menu'], [role='listbox']")) return;
    if (typeof window !== "undefined" && window.getSelection()?.toString()) return;
    open();
  };
}

export const LEAD_ROW_CLASS = "cursor-pointer hover:bg-slate-50 transition-colors";
