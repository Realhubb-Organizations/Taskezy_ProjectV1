"use client";

import React, { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { AlertTriangle, DollarSign, TrendingUp, Users, UserCog, RefreshCw } from "lucide-react";
import { DateRange } from "./DateRangeFilter";
import {
  filterLeadsByRange,
  filterAdSpendByRange,
  filterFollowupsByRange,
  computeBookingValue,
  computeBookingCount,
  computeROIMultiple,
  computeAllocatedSpend,
  getMissedInfo,
  formatCurrency,
  formatMinutes,
  SLA_MINUTES
} from "@/lib/reportMetrics";

export default function AgentReports({ dateRange }: { dateRange: DateRange }) {
  const { leads, adSpendRecords, followupCalls, users, currentUser, activeRole, reassignLead } = useApp();

  const rangeLeads = useMemo(() => filterLeadsByRange(leads, dateRange.from, dateRange.to), [leads, dateRange]);
  const rangeSpend = useMemo(() => filterAdSpendByRange(adSpendRecords, dateRange.from, dateRange.to), [adSpendRecords, dateRange]);
  const rangeFollowups = useMemo(() => filterFollowupsByRange(followupCalls, dateRange.from, dateRange.to), [followupCalls, dateRange]);
  const totalSpend = rangeSpend.reduce((sum, r) => sum + r.spend, 0);
  const totalLeadsCount = rangeLeads.length;

  // Real reporting-line lookup (see Settings → Manage Users → "Reports To"),
  // not the old hardcoded name-string SALES_HIERARCHY table.
  const managerNames = useMemo(() => new Set(users.filter(u => u.role_type === "Manager").map(u => u.name)), [users]);
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
      ...users.filter(u => u.role_type !== "Manager").map(u => u.name),
      ...rangeLeads.map(l => l.assignedAgent)
    ]);
    managerNames.forEach(m => allNames.delete(m));
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
  const allocatedSpend = computeAllocatedSpend(agentLeads.length, totalLeadsCount, totalSpend);
  const bookingValue = computeBookingValue(agentLeads);
  const bookingCount = computeBookingCount(agentLeads);
  const roi = computeROIMultiple(bookingValue, allocatedSpend);
  const missedLeads = agentLeads
    .map(l => ({ lead: l, info: getMissedInfo(l) }))
    .filter(x => x.info.missed);
  const agentFollowups = rangeFollowups.filter(f => f.assignedTo === activeAgent);
  const missedFollowups = agentFollowups.filter(f => f.status === "Missed");

  const handleReassign = (leadId: string, leadName: string) => {
    const target = prompt(`Reassign "${leadName}" to which team member?`, agentSalesTeamOptions.find(n => n !== activeAgent) || "");
    if (!target) return;
    if (!agentSalesTeamOptions.includes(target)) {
      alert("Please enter a valid team member name from the roster.");
      return;
    }
    reassignLead(leadId, target);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Agent selector — hidden entirely for a sales agent viewing their
            own report; there's nothing to pick when they can only ever see
            themselves. Visible (scoped to their team) for Managers, and
            unrestricted for Admin. */}
        {!isScopedToSelf && (
          <div className="lg:col-span-3 glass-card p-4 rounded-2xl space-y-2">
            <h3 className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider px-1">Sales Agents</h3>
            <div className="space-y-1 max-h-[28rem] overflow-y-auto pr-1">
              {agentNames.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic px-1">No agents with lead activity in range.</p>
              ) : (
                agentNames.map(name => {
                  const count = rangeLeads.filter(l => l.assignedAgent === name).length;
                  const isManagedBy = reportsToByName.get(name);
                  return (
                    <button
                      key={name}
                      onClick={() => setSelectedAgent(name)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-between ${
                        activeAgent === name ? "bg-brand-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span className="truncate">
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
          </div>
        )}

        {/* Agent detail */}
        <div className={isScopedToSelf ? "lg:col-span-12 space-y-6" : "lg:col-span-9 space-y-6"}>
          {!activeAgent ? (
            <div className="glass-card p-8 rounded-2xl text-center text-xs text-slate-400">
              <Users className="h-10 w-10 text-slate-350 mx-auto mb-2" />
              Select a sales agent to view their individual report.
            </div>
          ) : (
            <>
              <div className="glass-card p-5 rounded-2xl flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
                  <UserCog className="h-5.5 w-5.5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">{activeAgent}</p>
                  <p className="text-[10px] text-slate-500">
                    {reportsToByName.get(activeAgent) ? `Reports to ${reportsToByName.get(activeAgent)}` : "Sales Manager / TL"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Leads Assigned</span>
                  <p className="text-xl font-black text-slate-800 mt-1">{agentLeads.length}</p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Allocated Spend</span>
                  <p className="text-xl font-black text-slate-800 mt-1 flex items-center gap-1">
                    <DollarSign className="h-4 w-4 text-slate-400" />
                    {formatCurrency(allocatedSpend)}
                  </p>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Booking ROI</span>
                  <p className="text-xl font-black text-emerald-650 mt-1 flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    {roi.toFixed(1)}x
                  </p>
                  <span className="text-[9px] text-slate-450">{bookingCount} bookings • {formatCurrency(bookingValue)}</span>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Missed Leads</span>
                  <p className={`text-xl font-black mt-1 ${missedLeads.length > 0 ? "text-red-650" : "text-slate-800"}`}>
                    {missedLeads.length}
                  </p>
                  <span className="text-[9px] text-slate-450">SLA: 20 min response window</span>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Missed Follow-ups</span>
                  <p className={`text-xl font-black mt-1 ${missedFollowups.length > 0 ? "text-red-650" : "text-slate-800"}`}>
                    {missedFollowups.length}
                  </p>
                  <span className="text-[9px] text-slate-450">SLA: 10 min after reminder due</span>
                </div>
              </div>

              <div className="glass-card p-6 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Missed Leads — Full Detail
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                        <th className="p-3">Lead</th>
                        <th className="p-3">Assigned At</th>
                        <th className="p-3">Wait Time</th>
                        <th className="p-3">Overdue By</th>
                        <th className="p-3">Notes</th>
                        <th className="p-3">Reassigned At</th>
                        {activeRole === "ADMIN" && <th className="p-3 text-right">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {missedLeads.length === 0 ? (
                        <tr>
                          <td colSpan={activeRole === "ADMIN" ? 7 : 6} className="p-6 text-center text-slate-400 italic font-semibold">
                            No missed leads for {activeAgent} in this date range.
                          </td>
                        </tr>
                      ) : (
                        missedLeads.map(({ lead, info }) => {
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
                              <td className="p-3">
                                <p className="font-bold text-slate-800">{lead.name}</p>
                                <p className="text-[9px] text-slate-450 font-mono">{lead.phone}</p>
                              </td>
                              <td className="p-3 font-mono text-slate-600">
                                {lead.assignedAt ? new Date(lead.assignedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                              </td>
                              <td className="p-3">
                                <span className="font-bold text-red-650">{formatMinutes(info.responseMinutes)}</span>
                                {info.responseMinutes === undefined && <span className="text-[9px] text-slate-400 block">still waiting</span>}
                              </td>
                              <td className="p-3">
                                {overdueMinutes !== undefined && overdueMinutes > 0 ? (
                                  <span className="font-bold text-amber-700">{formatMinutes(overdueMinutes)}</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                                {!latestLog && <span className="text-[9px] text-slate-400 block">and counting</span>}
                              </td>
                              <td className="p-3 text-slate-500 max-w-[220px]">
                                <p className="truncate" title={latestLog?.message}>{latestLog?.message || "No activity logged."}</p>
                                {latestLog && (
                                  <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                                    {new Date(latestLog.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                )}
                              </td>
                              <td className="p-3 font-mono text-slate-600">
                                {lead.reassignedAt
                                  ? new Date(lead.reassignedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                                  : "Not reassigned"}
                              </td>
                              {activeRole === "ADMIN" && (
                                <td className="p-3 text-right">
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
                </div>
              </div>

              <div className="glass-card p-6 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Missed Follow-ups — Full Detail
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm overflow-x-auto">
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                        <th className="p-3">Lead</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Scheduled</th>
                        <th className="p-3">Overdue By</th>
                        <th className="p-3">Activity Log</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {missedFollowups.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-slate-400 italic font-semibold">
                            No missed follow-ups for {activeAgent} in this date range.
                          </td>
                        </tr>
                      ) : (
                        missedFollowups.map(f => {
                          // "Missed" fires 10 minutes after the due-reminder alert
                          // (see Taskezy-Server/src/jobs/followupScheduler.ts) — this
                          // is how far past that deadline the lead's latest logged
                          // activity (or "now", if still untouched) landed.
                          const relatedLead = f.leadId ? leads.find(l => l.id === f.leadId) : undefined;
                          const latestLog = relatedLead && relatedLead.logs.length > 0 ? relatedLead.logs[relatedLead.logs.length - 1] : undefined;
                          const overdueSinceTime = f.dueNotifiedAt ? new Date(f.dueNotifiedAt).getTime() + 10 * 60000 : undefined;
                          const activityTime = latestLog ? new Date(latestLog.timestamp).getTime() : Date.now();
                          const overdueMinutes = overdueSinceTime !== undefined ? Math.round((activityTime - overdueSinceTime) / 60000) : undefined;
                          return (
                            <tr key={f.id} className="hover:bg-slate-50/50">
                              <td className="p-3">
                                <p className="font-bold text-slate-800">{f.leadName}</p>
                                <p className="text-[9px] text-slate-450 font-mono">{f.phone}</p>
                              </td>
                              <td className="p-3 text-slate-600">{f.type}</td>
                              <td className="p-3 font-mono text-slate-600">{f.date} • {f.time}</td>
                              <td className="p-3">
                                {overdueMinutes !== undefined && overdueMinutes > 0 ? (
                                  <span className="font-bold text-amber-700">{formatMinutes(overdueMinutes)}</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                                {!latestLog && <span className="text-[9px] text-slate-400 block">and counting</span>}
                              </td>
                              <td className="p-3 text-slate-500 max-w-[220px]">
                                <p className="truncate" title={latestLog?.message}>{latestLog?.message || "No activity logged."}</p>
                                {latestLog && (
                                  <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                                    {new Date(latestLog.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
