import type { Lead } from "@/context/AppContext";

export type CallSubStatus = "Qualified" | "Unqualified";
export const CALL_SUB_STATUS_OPTIONS: CallSubStatus[] = ["Qualified", "Unqualified"];

// Data Calling's Sub-status (migration 033). Only a Connected call has one —
// Called / Not Reachable / Wrong Number never do. Every Qualified /
// Not Qualified count, filter and badge reads it from here.
export function callSubStatusOf(lead: Pick<Lead, "callStatus" | "callSubStatus">): CallSubStatus | null {
  return lead.callStatus === "Connected" ? lead.callSubStatus ?? null : null;
}

export const isQualifiedCall = (lead: Pick<Lead, "callStatus" | "callSubStatus">) => callSubStatusOf(lead) === "Qualified";
export const isUnqualifiedCall = (lead: Pick<Lead, "callStatus" | "callSubStatus">) => callSubStatusOf(lead) === "Unqualified";
