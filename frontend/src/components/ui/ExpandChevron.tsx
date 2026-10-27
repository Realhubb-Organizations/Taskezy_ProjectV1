import React from "react";
import { ChevronDown } from "lucide-react";

// The round chevron used by every expandable table row (same look as the
// Campaign Deep Dive's Ad Set Name toggle): grey at rest, navy and flipped
// when open. Put `group/expand` on the clickable parent for the hover state.
export default function ExpandChevron({ open }: { open: boolean }) {
  return (
    <span
      className={`shrink-0 h-5 w-5 rounded-full flex items-center justify-center transition-all duration-300 ${
        open ? "bg-[#0B1E6E] text-white rotate-180" : "bg-slate-100 text-slate-500 group-hover/expand:bg-slate-200"
      }`}
    >
      <ChevronDown className="h-3 w-3" />
    </span>
  );
}

// Animates a table cell's content open/closed (grid rows 0fr <-> 1fr), so
// expanded rows slide in and out instead of popping. Pass the cell's padding
// in `className` — the <td> itself should have p-0.
export function CollapsibleCell({ open, className = "", children }: { open: boolean; className?: string; children?: React.ReactNode }) {
  return (
    <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
      {/* min-h-0 so the 0fr row can really reach 0, even when the content
          holds a table footer (globals.css switches those cards to clip). */}
      <div className="overflow-hidden min-h-0">
        <div className={className}>{children}</div>
      </div>
    </div>
  );
}
