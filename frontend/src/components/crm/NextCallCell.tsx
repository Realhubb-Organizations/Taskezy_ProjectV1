import React from "react";
import { formatFollowupDate, formatFollowupTime, type NextFollowup } from "@/lib/followups";

// Next Call Date cell: date and time on two lines; a call that's due now is
// yellow with a "Due now" label, a missed (overdue) one red with "Overdue".
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
  if (next.due) {
    return (
      <span className="block text-amber-600" title="This call is due now — it becomes overdue if not done within 10 minutes">
        <span className="block text-[10px] font-bold uppercase tracking-wide">Due now</span>
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
