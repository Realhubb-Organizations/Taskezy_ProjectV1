import React from "react";
import { isOutsideWorkingHours, WORKING_HOURS_LABEL } from "@/lib/workingHours";

// Shown under a call's time picker when the picked time is outside working
// hours. Information only — the call can still be scheduled.
export default function OutsideHoursNote({ time }: { time: string }) {
  if (!time || !isOutsideWorkingHours(time)) return null;
  return (
    <p className="text-[11px] font-semibold text-amber-700">
      You are scheduling this call outside working hours ({WORKING_HOURS_LABEL}).
    </p>
  );
}
