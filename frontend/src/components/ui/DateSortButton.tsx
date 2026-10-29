import React from "react";
import { ArrowUp, ArrowUpDown } from "lucide-react";
import Tooltip from "@/components/ui/Tooltip";

export type SortDir = "asc" | "desc";

// Clickable "Date" column header. Starts on the table's normal order; each
// click goes newest first → oldest first → back to the normal order. Same
// look as the Properties table's Date header.
// Hover text says what the next click does.
const NEXT_STEP_TEXT: Record<"none" | SortDir, string> = {
  none: "Sort newest first",
  desc: "Sort oldest first",
  asc: "Back to normal order"
};

export function DateSortButton({ dir, onChange, label = "Date" }: { dir?: SortDir; onChange: (dir: SortDir | undefined) => void; label?: string }) {
  const next = dir === undefined ? "desc" : dir === "desc" ? "asc" : undefined;
  return (
    <Tooltip text={NEXT_STEP_TEXT[dir ?? "none"]}>
      <button type="button" onClick={() => onChange(next)} className="inline-flex items-center gap-1 hover:text-slate-700">
        {label}
        {dir === undefined
          ? <ArrowUpDown className="h-3 w-3 text-slate-400" />
          : <ArrowUp className={`h-3 w-3 transition-transform duration-300 ease-out ${dir === "desc" ? "rotate-180" : ""}`} />}
      </button>
    </Tooltip>
  );
}

/** Client-side version of the same sort, for tables that already hold all their rows. */
export function sortByDate<T>(rows: T[], dir: SortDir | undefined, dateOf: (row: T) => string | Date | undefined | null): T[] {
  if (!dir) return rows;
  const time = (r: T) => { const v = dateOf(r); const t = v ? new Date(v).getTime() : NaN; return isNaN(t) ? null : t; };
  return [...rows].sort((a, b) => {
    const ta = time(a), tb = time(b);
    if (ta === null || tb === null) return ta === tb ? 0 : ta === null ? 1 : -1;
    return dir === "asc" ? ta - tb : tb - ta;
  });
}
