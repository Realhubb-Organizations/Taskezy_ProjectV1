"use client";

import React from "react";
import { useApp } from "@/context/AppContext";

// How many times this lead's scheduled calls were missed (leads.missed_task_count,
// counted by the follow-up scheduler). Admins and Managers only: the server
// already leaves the number out for everyone else, and this checks the role
// again so it can never show to an agent. Nothing renders at 0.
export default function MissedCountBadge({ count }: { count?: number }) {
  const { activeRole, currentUser } = useApp();
  const canSee = activeRole === "ADMIN" || currentUser?.role_type === "Manager";
  if (!canSee || !count) return null;
  return (
    <p
      className="mt-0.5 text-[10px] font-semibold text-red-600 whitespace-nowrap"
      title={`Scheduled calls for this lead were missed ${count} time${count === 1 ? "" : "s"}`}
    >
      Missed ×{count}
    </p>
  );
}
