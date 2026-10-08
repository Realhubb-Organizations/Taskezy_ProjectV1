import React from "react";
import { formatFollowupDate, formatFollowupTime, type NextFollowup } from "@/lib/followups";

// Next Call Date cell: date and time on two lines; an overdue follow-up is
// shown in red with an "Overdue" label instead of being hidden.
export default function NextCallCell({ next }: { next: NextFollowup | null }) {
  if (!next) return <>—</>;
  if (next.overdue) {
    return (
      <span className="block text-red-600" title="This follow-up's time has passed and it isn't completed">
        <span className="block text-[10px] font-bold uppercase tracking-wide">Overdue</span>
        <span className="block whitespace-nowrap">{formatFollowupDate(next.at)}</span>
        <span className="block whitespace-nowrap text-[11px]">{formatFollowupTime(next.at)}</span>
      </span>
    );
  }
  return (
    <>
      <span className="block whitespace-nowrap">{formatFollowupDate(next.at)}</span>
      <span className="block whitespace-nowrap text-[11px] text-slate-400">{formatFollowupTime(next.at)}</span>
    </>
  );
}
