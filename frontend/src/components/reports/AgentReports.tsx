"use client";

import React, { useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { isLeadAssignableUser } from "@/lib/leadAssignment";
import { useDialog } from "@/components/ui/DialogProvider";
import { maskPhone } from "@/lib/maskPII";
import { AlertTriangle, ArrowRight, CheckSquare, Clock, DollarSign, Info, MapPin, Phone, TrendingUp, Users, RefreshCw } from "lucide-react";
import { DateRange } from "./DateRangeFilter";
import {
  filterLeadsByRange,
  filterAdSpendByRange,
  filterFollowupsByRange,
  computeBookingValue,
  computeBookingCount,
  computeROIMultiple,
  computeCampaignAttributedSpend,
  computeAgentFunnel,
  getMissedInfo,
  formatCurrency,
  formatMinutes,
  SLA_MINUTES
} from "@/lib/reportMetrics";
import { LineSkeleton, TableRowsSkeleton, CardListSkeleton } from "@/components/ui/Skeletons";
import TablePagination, { usePagination } from "@/components/ui/TablePagination";

export default function AgentReports({ dateRange }: { dateRange: DateRange }) {
  const { leads, adSpendRecords, followupCalls, users, currentUser, activeRole, reassignLead, isDataLoading } = useApp();
  const { toast, prompt: promptDialog } = useDialog();

  const rangeLeads = useMemo(() => filterLeadsByRange(leads, dateRange.from, dateRange.to), [leads, dateRange]);
  const rangeSpend = useMemo(() => filterAdSpendByRange(adSpendRecords, dateRange.from, dateRange.to), [adSpendRecords, dateRange]);
  const rangeFollowups = useMemo(() => filterFollowupsByRange(followupCalls, dateRange.from, dateRange.to), [followupCalls, dateRange]);

  // Real reporting-line lookup (see Settings → Manage Users → "Reports To"),
  // not the old hardcoded name-string SALES_HIERARCHY table.
  const managerNames = useMemo(() => new Set(users.filter(u => u.role_type === "Manager" && isLeadAssignableUser(u)).map(u => u.name)), [users]);
  const reportsToByName = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach(u => { if (u.managerName) map.set(u.name, u.managerName); });
    return map;
  }, [users]);

  // Role-scoped: ADMIN browses everyone; a Manager only ever sees their own
  // direct reports; a Member (sales agent) only ever sees their own report —
  // this used to list every agent in the company to every viewer regardless
  // of role, letting a Member browse other agents' names/reports.
  const agentNames = useMemo(() => {
    const allNames = new Set<string>([
      ...users.filter(u => u.role_type !== "Manager" && isLeadAssignableUser(u)).map(u => u.name),
      ...rangeLeads.map(l => l.assignedAgent)
    ]);
    managerNames.forEach(m => allNames.delete(m));
    // Sales agents only: Finance/Admin users never appear here or as a
    // reassign target, even when one holds a lead (e.g. an unassigned lead).
    users.filter(u => !isLeadAssignableUser(u)).forEach(u => allNames.delete(u.name));
    const all = Array.from(allNames).sort();

    if (activeRole === "ADMIN") return all;
    if (!currentUser) return [];
    if (currentUser.role_type === "Manager") {
      return all.filter(name => users.find(u => u.name === name)?.managerId === currentUser.id);
    }
    return all.includes(currentUser.name) ? [currentUser.name] : [currentUser.name];
  }, [users, managerNames, rangeLeads, activeRole, currentUser]);

  const isScopedToSelf = activeRole !== "ADMIN" && currentUser?.role_type !== "Manager";

  const [selectedAgent, setSelectedAgent] = useState<string>(agentNames[0] || "");
  const activeAgent = isScopedToSelf ? (currentUser?.name || "") : (agentNames.includes(selectedAgent) ? selectedAgent : agentNames[0] || "");

  const agentSalesTeamOptions = useMemo(() => {
    const names = new Set<string>([...agentNames, ...Array.from(managerNames)]);
    return Array.from(names).sort();
  }, [agentNames, managerNames]);

  const agentLeads = rangeLeads.filter(l => l.assignedAgent === activeAgent);
  const allocatedSpend = computeCampaignAttributedSpend(agentLeads, rangeSpend);
  const bookingValue = computeBookingValue(agentLeads);
  const bookingCount = computeBookingCount(agentLeads);
  const roi = computeROIMultiple(bookingValue, allocatedSpend);
  const missedLeads = agentLeads
    .map(l => ({ lead: l, info: getMissedInfo(l) }))
    .filter(x => x.info.missed);
  const agentFollowups = rangeFollowups.filter(f => f.assignedTo === activeAgent);
  const missedFollowups = agentFollowups.filter(f => f.status === "Missed");

  // KPI cards + Sales Funnel (percentages are of leads assigned in range).
  const funnel = computeAgentFunnel(agentLeads);
  const pct = (n: number) => (funnel.assigned === 0 ? 0 : Math.round((n / funnel.assigned) * 100));
  const kpiCards = [
    { label: "Total Leads Assigned", value: funnel.assigned, sub: "In selected range", icon: Users, iconBg: "bg-blue-50 text-blue-600", alert: false },
    { label: "Leads Contacted", value: funnel.contacted, sub: `${pct(funnel.contacted)}% of assigned`, icon: Phone, iconBg: "bg-emerald-50 text-emerald-600", alert: false },
    { label: "Qualified Leads", value: funnel.qualified, sub: `${pct(funnel.qualified)}% of assigned`, icon: CheckSquare, iconBg: "bg-violet-50 text-violet-600", alert: false },
    { label: "Site Visits", value: funnel.siteVisits, sub: `${pct(funnel.siteVisits)}% of assigned`, icon: MapPin, iconBg: "bg-orange-50 text-orange-500", alert: false },
    { label: "Missed Leads", value: missedLeads.length, sub: `${SLA_MINUTES} min response window`, icon: AlertTriangle, iconBg: "bg-red-50 text-red-600", alert: missedLeads.length > 0 },
    { label: "Missed Follow-ups", value: missedFollowups.length, sub: "10 min after reminder", icon: Clock, iconBg: "bg-sky-50 text-sky-600", alert: false }
  ];
  const funnelRows = [
    { label: "Assigned", value: funnel.assigned, bar: "bg-[#0B1E6E]" },
    { label: "Contacted", value: funnel.contacted, bar: "bg-blue-500" },
    { label: "Qualified", value: funnel.qualified, bar: "bg-blue-400" },
    { label: "Site Visits", value: funnel.siteVisits, bar: "bg-blue-300" }
  ];
  const [missedTab, setMissedTab] = useState<"leads" | "followups">("leads");
  const missedDetailRef = useRef<HTMLDivElement>(null);
  const openMissedTab = (tab: "leads" | "followups") => {
    setMissedTab(tab);
    missedDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Both detail tables jump back to page 1 when the agent or date range changes.
  const detailResetKey = JSON.stringify([activeAgent, dateRange]);
  const agentListPagination = usePagination(agentNames, 10, JSON.stringify(dateRange));
  const missedLeadsPagination = usePagination(missedLeads, 10, detailResetKey);
  const missedFollowupsPagination = usePagination(missedFollowups, 10, detailResetKey);

  const handleReassign = async (leadId: string, leadName: string) => {
    const target = await promptDialog({
      title: "Reassign lead",
      message: `Reassign "${leadName}" to which team member?`,
      label: "Team member",
      defaultValue: agentSalesTeamOptions.find(n => n !== activeAgent) || "",
      options: agentSalesTeamOptions,
      confirmLabel: "Reassign"
    });
    if (!target) return;
    if (!agentSalesTeamOptions.includes(target)) {
      toast("Please enter a valid team member name from the roster.", "warning");
      return;
    }
    const note = await promptDialog({
      title: `Reassign to ${target}`,
      message: leadName,
      label: "Note (required)",
      placeholder: "Note for the new agent — e.g. Prefers WhatsApp, call after 6 pm",
      confirmLabel: "Reassign",
      multiline: true,
      validate: (v) => (!v ? "Please write a note." : null)
    });
    if (note === null) return;
    try {
      await reassignLead(leadId, target, note);
      toast(`${leadName} reassigned to ${target}.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not reassign this lead. Please try again.", "error");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Agent selector — hidden entirely for a sales agent viewing their
            own report; there's nothing to pick when they can only ever see
            themselves. Visible (scoped to their team) for Managers, and
            unrestricted for Admin. */}
        {!isScopedToSelf && (
          <div className="lg:col-span-3 bg-white border border-slate-100 rounded-2xl shadow-sm p-4 space-y-2">
            <h3 className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider px-1">Sales Agents</h3>
            <div className="space-y-1 max-h-[28rem] overflow-y-auto pr-1">
              {isDataLoading && agentNames.length === 0 ? (
                <CardListSkeleton count={4} />
              ) : agentNames.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic px-1">No agents with lead activity in range.</p>
              ) : (
                agentListPagination.pageRows.map(name => {
                  const count = rangeLeads.filter(l => l.assignedAgent === name).length;
                  const isManagedBy = reportsToByName.get(name);
                  return (
                    <button
                      key={name}
                      onClick={() => setSelectedAgent(name)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-between ${
                        activeAgent === name ? "bg-[#0B1E6E] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span className="[overflow-wrap:anywhere]">
                        {name}
                        {isManagedBy && (
                          <span className={`block text-[9px] font-semibold ${activeAgent === name ? "text-brand-100" : "text-slate-400"}`}>
                            reports to {isManagedBy}
                          </span>
                        )}
                      </span>
                      <span className={`shrink-0 ml-2 ${activeAgent === name ? "text-brand-100" : "text-slate-400"}`}>{count}</span>
                    </button>
                  );
                })
              )}
            </div>
            {agentNames.length > 0 && (
              <TablePagination
                totalRows={agentListPagination.paginationProps.totalRows}
                page={agentListPagination.page}
                rowsPerPage={agentListPagination.rowsPerPage}
                onPageChange={agentListPagination.setPage}
                rowLabel="Agent"
                className="!px-1 !pb-0"
              />
            )}
          </div>
        )}

        {/* Agent detail */}
        <div className={isScopedToSelf ? "lg:col-span-12 space-y-6" : "lg:col-span-9 space-y-6"}>
          {!activeAgent ? (
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-8 text-center text-xs text-slate-400">
              <Users className="h-10 w-10 text-slate-350 mx-auto mb-2" />
              Select a sales agent to view their individual report.
            </div>
          ) : (
            <>
              {/* Agent header. Allocated Spend / Booking ROI are for admins and
                  managers only — an agent's own view is just name + manager. */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5 flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="h-11 w-11 rounded-full bg-[#0B1E6E] text-white text-sm font-bold flex items-center justify-center shrink-0">
                    {activeAgent.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-slate-800 [overflow-wrap:anywhere]">{activeAgent}</p>
                    <p className="text-xs text-slate-400">
                      {reportsToByName.get(activeAgent) ? `Reports to ${reportsToByName.get(activeAgent)}` : "Sales Manager / TL"}
                    </p>
                  </div>
                </div>
                {!isScopedToSelf && <div className="flex items-center gap-6">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Allocated Spend</span>
                    {isDataLoading ? (
                      <LineSkeleton width={70} height={18} />
                    ) : (
                      <p className="text-sm font-black text-slate-800 flex items-center gap-0.5">
                        <DollarSign className="h-3.5 w-3.5 text-slate-400" />
                        {formatCurrency(allocatedSpend)}
                      </p>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Booking ROI</span>
                    {isDataLoading ? (
                      <LineSkeleton width={50} height={18} />
                    ) : (
                      <p className="text-sm font-black text-emerald-650 flex items-center gap-1">
                        <TrendingUp className="h-3.5 w-3.5" />
                        {roi.toFixed(1)}x
                        <span className="text-[9px] font-semibold text-slate-450">· {bookingCount} bookings • {formatCurrency(bookingValue)}</span>
                      </p>
                    )}
                  </div>
                </div>}
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                {kpiCards.map(c => (
                  <div key={c.label} className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4 min-w-0">
                    <span className={`h-9 w-9 rounded-xl flex items-center justify-center ${c.iconBg}`}>
                      <c.icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="text-xs font-semibold text-slate-500 block mt-3">{c.label}</span>
                    {isDataLoading ? (
                      <LineSkeleton width={40} height={26} />
                    ) : (
                      <p className={`text-2xl font-black mt-0.5 ${c.alert ? "text-red-600" : "text-slate-800"}`}>{c.value}</p>
                    )}
                    <span className="text-[10px] text-slate-400 block mt-0.5">{c.sub}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Sales Funnel */}
                <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl shadow-sm p-5 space-y-4 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      Sales Funnel
                      <span
                        className="text-slate-400 cursor-help"
                        title={"Assigned: leads given to the agent in this date range\nContacted: status moved past New Lead\nQualified: Call Back, Followup, EOI, Site Visit or Booked\nSite Visits: Site Visit Scheduled or Done"}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Conversion Rate (Assigned → Site Visit) <span className="ml-1 text-sm font-black text-slate-800">{pct(funnel.siteVisits)}%</span>
                    </p>
                  </div>
                  <div className="space-y-3">
                    {funnelRows.map(r => (
                      <div key={r.label} className="grid grid-cols-[5.5rem_2rem_1fr_2.75rem] items-center gap-3">
                        <span className="text-xs text-slate-600">{r.label}</span>
                        <span className="text-xs font-bold text-slate-800 text-right">{r.value}</span>
                        <div className="h-6 rounded-md bg-slate-100 overflow-hidden">
                          <div className={`h-full rounded-md transition-all duration-500 ${r.bar}`} style={{ width: `${pct(r.value)}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 text-right">{funnel.assigned === 0 ? "—" : `${pct(r.value)}%`}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Required */}
                <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl shadow-sm p-5 space-y-3 min-w-0">
                  <h3 className="text-sm font-bold text-slate-800">Action Required</h3>
                  {[
                    { label: "Missed Leads", value: missedLeads.length, sub: `Leads not contacted within ${SLA_MINUTES} min SLA`, icon: AlertTriangle, tone: "bg-red-50 border-red-100", iconTone: "bg-red-100 text-red-600", btn: "bg-red-100/70 text-red-700 hover:bg-red-100", cta: "View Leads", tab: "leads" as const },
                    { label: "Missed Follow-ups", value: missedFollowups.length, sub: "Follow-ups past reminder due time", icon: Clock, tone: "bg-amber-50 border-amber-100", iconTone: "bg-amber-100 text-amber-600", btn: "bg-amber-100/70 text-amber-800 hover:bg-amber-100", cta: "View Follow-ups", tab: "followups" as const }
                  ].map(a => (
                    <div key={a.label} className={`flex items-center gap-3 rounded-xl border p-3.5 ${a.tone}`}>
                      <span className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${a.iconTone}`}>
                        <a.icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold text-slate-700">{a.label}</p>
                        <p className="text-xl font-black text-slate-800 leading-tight">{isDataLoading ? "—" : a.value}</p>
                        <p className="text-[10px] text-slate-500">{a.sub}</p>
                      </div>
                      {/* Agent login only: jumps to the matching tab of the card below. */}
                      {isScopedToSelf && <button
                        type="button"
                        onClick={() => openMissedTab(a.tab)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors shrink-0 ${a.btn}`}
                      >
                        {a.cta} <ArrowRight className="h-3.5 w-3.5" />
                      </button>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Missed Leads / Missed Follow-ups — one card, switched by tabs
                  (same underline tabs as Campaigns' Property / Status). */}
              <div ref={missedDetailRef} className="scroll-mt-4 bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-4 text-sm" role="tablist">
                  {([["leads", "Missed Leads"], ["followups", "Missed Follow-ups"]] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={missedTab === key}
                      onClick={() => setMissedTab(key)}
                      className={`font-bold pb-1 border-b-2 transition-colors ${missedTab === key ? "text-[#0B1E6E] border-[#0B1E6E]" : "text-slate-400 border-transparent hover:text-slate-600"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {missedTab === "leads" && (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm overflow-x-auto">
                  <table className={`table-fixed w-full text-[11px] border-collapse ${activeRole === "ADMIN" ? "min-w-[1050px]" : "min-w-[900px]"}`}>
                    <colgroup>
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      {activeRole === "ADMIN" && <col />}
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Lead</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Assigned At</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Wait Time</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Overdue By</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Notes</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Reassigned At</th>
                        {activeRole === "ADMIN" && <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {isDataLoading && missedLeads.length === 0 ? (
                        <TableRowsSkeleton rows={6} columns={activeRole === "ADMIN" ? 7 : 6} />
                      ) : missedLeads.length === 0 ? (
                        <tr>
                          <td colSpan={activeRole === "ADMIN" ? 7 : 6} className="p-6 text-center text-slate-400 italic font-semibold">
                            No missed leads for {activeAgent} in this date range.
                          </td>
                        </tr>
                      ) : (
                        missedLeadsPagination.pageRows.map(({ lead, info }) => {
                          const latestLog = lead.logs.length > 0 ? lead.logs[lead.logs.length - 1] : undefined;
                          // "Missed" fires SLA_MINUTES after assignment — this is how
                          // far past that deadline the logged activity (or "now", if
                          // still untouched) landed, i.e. the gap between the SLA
                          // breach and when the agent actually did something.
                          const missedAtTime = lead.assignedAt ? new Date(lead.assignedAt).getTime() + SLA_MINUTES * 60000 : undefined;
                          const activityTime = latestLog ? new Date(latestLog.timestamp).getTime() : Date.now();
                          const overdueMinutes = missedAtTime !== undefined ? Math.round((activityTime - missedAtTime) / 60000) : undefined;
                          return (
                            <tr key={lead.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3">
                                <p className="font-bold text-slate-800">{lead.name}</p>
                                <p className="text-[9px] text-slate-450 font-mono">{activeRole === "ADMIN" ? lead.phone : maskPhone(lead.phone)}</p>
                              </td>
                              <td className="px-4 py-3 font-mono text-slate-600">
                                {lead.assignedAt ? new Date(lead.assignedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-bold text-red-650">{formatMinutes(info.responseMinutes)}</span>
                                {info.responseMinutes === undefined && <span className="text-[9px] text-slate-400 block">still waiting</span>}
                              </td>
                              <td className="px-4 py-3">
                                {overdueMinutes !== undefined && overdueMinutes > 0 ? (
                                  <span className="font-bold text-amber-700">{formatMinutes(overdueMinutes)}</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                                {!latestLog && <span className="text-[9px] text-slate-400 block">and counting</span>}
                              </td>
                              <td className="px-4 py-3 text-slate-500">
                                <p className="line-clamp-3 [overflow-wrap:anywhere]" title={latestLog?.message}>{latestLog?.message || "No activity logged."}</p>
                                {latestLog && (
                                  <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                                    {new Date(latestLog.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono text-slate-600">
                                {lead.reassignedAt
                                  ? new Date(lead.reassignedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                                  : "Not reassigned"}
                              </td>
                              {activeRole === "ADMIN" && (
                                <td className="px-4 py-3 text-right">
                                  <button
                                    onClick={() => handleReassign(lead.id, lead.name)}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-600 hover:text-brand-700"
                                  >
                                    <RefreshCw className="h-3 w-3" /> Reassign
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                  <TablePagination {...missedLeadsPagination.paginationProps} rowLabel="Missed Lead" />
                </div>
                )}
                {missedTab === "followups" && (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm overflow-x-auto">
                  <table className="table-fixed w-full min-w-[600px] text-[11px] border-collapse">
                    <colgroup>
                      <col />
                      <col />
                      <col />
                      <col />
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Lead</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Scheduled</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Overdue By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {isDataLoading && missedFollowups.length === 0 ? (
                        <TableRowsSkeleton rows={6} columns={4} />
                      ) : missedFollowups.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-slate-400 italic font-semibold">
                            No missed follow-ups for {activeAgent} in this date range.
                          </td>
                        </tr>
                      ) : (
                        missedFollowupsPagination.pageRows.map(f => {
                          // Missed time = when it became due (falls back to the
                          // originally scheduled time for older rows from before
                          // the scheduler existed) + the 10-minute SLA. Overdue By
                          // is simply that deadline compared against right now.
                          const missedAtTime = f.dueNotifiedAt
                            ? new Date(f.dueNotifiedAt).getTime() + 10 * 60000
                            : new Date(`${f.date}T00:00:00`).getTime();
                          const overdueMinutes = Math.round((Date.now() - missedAtTime) / 60000);
                          return (
                            <tr key={f.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3">
                                <p className="font-bold text-slate-800">{f.leadName}</p>
                                <p className="text-[9px] text-slate-450 font-mono">{activeRole === "ADMIN" ? f.phone : maskPhone(f.phone)}</p>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{f.type}</td>
                              <td className="px-4 py-3 font-mono text-slate-600">{f.date} • {f.time}</td>
                              <td className="px-4 py-3">
                                {overdueMinutes > 0 ? (
                                  <span className="font-bold text-amber-700">{formatMinutes(overdueMinutes)}</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                  <TablePagination {...missedFollowupsPagination.paginationProps} rowLabel="Missed Follow-up" />
                </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
