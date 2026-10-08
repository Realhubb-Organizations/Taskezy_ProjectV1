import React from "react";

// Table cells show the date and time on two lines so neither gets cut off
// in narrow Date / Next Call Date columns.
export function DateTimeLines({ date, time }: { date: string; time?: string }) {
  return (
    <>
      <span className="block whitespace-nowrap">{date}</span>
      {time && <span className="block whitespace-nowrap text-[11px] text-slate-400">{time}</span>}
    </>
  );
}

export function dateTimeParts(iso: string | undefined): { date: string; time?: string } {
  if (!iso) return { date: "—" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: iso };
  return {
    date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
  };
}
