"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Search, X } from "lucide-react";
import TablePagination from "@/components/ui/TablePagination";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";
import { useDialog } from "@/components/ui/DialogProvider";
import { apiStBookedLeads, apiStDecideBooking, StBookedLead } from "@/lib/apiClient";
import { EmptyRow, FilterState, HeaderFilters, Lookups, PageCard, StatusHeaderFilter, TD, TH } from "./stShared";

// Booking Approval: leads the sales team marked Booked, waiting for a
// tracker user to Approve or Reject. Approved → the lead can be picked in
// Bookings → Create Booking. Rejected → it only shows here, as Rejected.

type Approval = StBookedLead["approval"];
const APPROVALS: Approval[] = ["PENDING", "APPROVED", "REJECTED"];
const APPROVAL_LABEL: Record<Approval, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected" };

const approvalOf = (l: StBookedLead): Approval => l.approval;

const COLS = 7;

function dateTime(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    day: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  };
}

/**
 * The design's round marks: green ✓ / red ✗. Pending rows show both, as the
 * Approve / Reject buttons; a decided row shows just its own mark.
 */
function DecisionMark({ approval, title, onClick }: { approval: "APPROVED" | "REJECTED"; title: string; onClick?: () => void }) {
  const Icon = approval === "APPROVED" ? Check : X;
  const tone = approval === "APPROVED"
    ? `bg-green-500 ${onClick ? "hover:bg-green-600" : ""}`
    : `bg-red-500 ${onClick ? "hover:bg-red-600" : ""}`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={title}
      aria-label={title}
      className={`inline-flex items-center justify-center rounded-full text-white ${tone} ${onClick ? "" : "cursor-default"}`}
      style={{ width: 22, height: 22 }}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={3} />
    </button>
  );
}

/** +91-9800142923 for a 10-digit Indian mobile; anything else as stored. */
const phoneText = (phone: string) => (/^\d{10}$/.test(phone) ? `+91-${phone}` : phone);

export default function BookingApprovalTab({
  filters,
  onFiltersChange,
  lookups,
  refreshSignal,
  onDataChanged
}: {
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  lookups: Lookups;
  refreshSignal: number;
  onDataChanged: () => void;
}) {
  const { confirm, toast } = useDialog();
  const [leads, setLeads] = useState<StBookedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  // Column funnels (design): Property · Booking Request by · Approval Status.
  const [propertyPick, setPropertyPick] = useState<string[]>([]);
  const [agentPick, setAgentPick] = useState<string[]>([]);
  const [approvalPick, setApprovalPick] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    apiStBookedLeads()
      .then(r => { if (active) setLeads(r); })
      .catch(err => { console.warn("Could not load booking requests:", err); if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshSignal, retry]);

  const propertyOptions = useMemo(() => Array.from(new Set(leads.map(l => l.property_name || "Not set"))).sort(), [leads]);
  const agentOptions = useMemo(() => Array.from(new Set(leads.map(l => l.agent_name || "Unassigned"))).sort(), [leads]);

  const rows = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const headerProps = new Set(filters.propertyId);
    return leads
      .filter(l => {
        if (q && ![l.name, l.phone, l.property_name, l.agent_name, l.notes].some(v => v?.toLowerCase().includes(q))) return false;
        if (headerProps.size && !(l.property_id && headerProps.has(l.property_id))) return false;
        const day = dateTime(l.booked_at).day;
        if (filters.dateRange && (day < filters.dateRange.start || day > filters.dateRange.end)) return false;
        if (propertyPick.length && !propertyPick.includes(l.property_name || "Not set")) return false;
        if (agentPick.length && !agentPick.includes(l.agent_name || "Unassigned")) return false;
        if (approvalPick.length && !approvalPick.includes(approvalOf(l))) return false;
        return true;
      })
      .sort((a, b) => b.booked_at.localeCompare(a.booked_at));
  }, [leads, filters.search, filters.propertyId, filters.dateRange, propertyPick, agentPick, approvalPick]);

  const filterKey = JSON.stringify([filters.search, filters.propertyId, filters.dateRange, propertyPick, agentPick, approvalPick]);
  useEffect(() => setPage(1), [filterKey]);
  const pageRows = rows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  const decide = async (l: StBookedLead, decision: "approve" | "reject") => {
    const approving = decision === "approve";
    const ok = await confirm({
      title: approving ? "Approve this booking?" : "Reject this booking?",
      message: approving
        ? `${l.name} · ${l.property_name ?? "No property"}. It can then be picked in Bookings → Create Booking.`
        : `${l.name} · ${l.property_name ?? "No property"}. It will show here as Rejected and can't be booked.`,
      confirmLabel: approving ? "Approve" : "Reject",
      danger: !approving
    });
    if (!ok) return;
    try {
      await apiStDecideBooking(l.id, decision);
      toast(approving ? "Booking approved. You can now create it in the Bookings tab." : "Booking request rejected.", "success");
      onDataChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save. Please try again.", "error");
    }
  };

  return (
    <PageCard title="Booking Approval" right={<HeaderFilters value={filters} onChange={onFiltersChange} lookups={lookups} noMonth />}>
      <div className="flex items-center gap-2 max-w-xs">
        <Search className="h-4 w-4 text-slate-400 shrink-0" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          placeholder="Search"
          className="w-full border-0 border-b border-slate-300 bg-transparent px-1 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0B1E6E]"
        />
      </div>

      <div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className={TH}>Lead name</th>
                <th className={TH}>
                  <StatusHeaderFilter label="Property" options={propertyOptions} selected={propertyPick} onChange={setPropertyPick} renderBadge={(v) => <span className="text-xs text-slate-800">{v}</span>} />
                </th>
                <th className={TH}>
                  <StatusHeaderFilter label="Booking Request by" options={agentOptions} selected={agentPick} onChange={setAgentPick} renderBadge={(v) => <span className="text-xs text-slate-800">{v}</span>} />
                </th>
                <th className={TH}>Lead Status</th>
                <th className={TH}>Notes</th>
                <th className={TH}>
                  <StatusHeaderFilter
                    label="Approval Status"
                    options={APPROVALS}
                    selected={approvalPick}
                    onChange={setApprovalPick}
                    renderBadge={(v) => (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-800">
                        {v !== "REJECTED" && <DecisionMark approval="APPROVED" title="" />}
                        {v !== "APPROVED" && <DecisionMark approval="REJECTED" title="" />}
                        {APPROVAL_LABEL[v]}
                      </span>
                    )}
                  />
                </th>
                <th className={TH}>Requested Date</th>
              </tr>
            </thead>
            <tbody>
              {loadError ? (
                <tr>
                  <td colSpan={COLS} className="p-8">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      <p className="text-xs font-semibold text-slate-600">Couldn&apos;t load booking requests.</p>
                      <button type="button" onClick={() => setRetry(n => n + 1)} className="ui-btn ui-btn-primary">Retry</button>
                    </div>
                  </td>
                </tr>
              ) : loading ? (
                <TableRowsSkeleton rows={8} columns={COLS} />
              ) : pageRows.length === 0 ? (
                <EmptyRow cols={COLS} text="No booking requests found." />
              ) : (
                pageRows.map(l => {
                  const a = approvalOf(l);
                  const when = dateTime(l.booked_at);
                  return (
                    <tr key={l.id} className="border-b border-slate-200 last:border-b-0">
                      <td className={TD}>
                        <span className="block font-medium text-slate-900">{l.name}</span>
                        <span className="block text-[11px] text-slate-500">{phoneText(l.phone)}</span>
                      </td>
                      <td className={TD}>{l.property_name || <span className="text-slate-400">Not set</span>}</td>
                      <td className={TD}>{l.agent_name || <span className="text-slate-400">Unassigned</span>}</td>
                      <td className={TD}>Booked</td>
                      <td className={`${TD} max-w-[220px] truncate`} title={l.notes ?? undefined}>{l.notes || <span className="text-slate-400">—</span>}</td>
                      <td className={TD}>
                        <span className="inline-flex items-center gap-2">
                          {a === "PENDING" ? (
                            <>
                              <DecisionMark approval="APPROVED" title="Approve" onClick={() => decide(l, "approve")} />
                              <DecisionMark approval="REJECTED" title="Reject" onClick={() => decide(l, "reject")} />
                            </>
                          ) : (
                            <>
                              <DecisionMark approval={a} title={l.decided_by_name ? `${APPROVAL_LABEL[a]} by ${l.decided_by_name}` : APPROVAL_LABEL[a]} />
                              <span className={`text-xs font-semibold ${a === "APPROVED" ? "text-green-700" : "text-red-600"}`}>
                                {APPROVAL_LABEL[a]}
                              </span>
                            </>
                          )}
                        </span>
                      </td>
                      <td className={`${TD} leading-tight`}>
                        <span className="block">{when.day}</span>
                        <span className="block">{when.time}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          totalRows={rows.length}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={setPage}
          onRowsPerPageChange={(n) => { setRowsPerPage(n); setPage(1); }}
          rowLabel="Request"
        />
      </div>

    </PageCard>
  );
}
