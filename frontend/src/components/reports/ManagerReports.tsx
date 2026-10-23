"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { ChevronDown, ChevronUp, AlertTriangle, Users } from "lucide-react";
import { DateRange } from "./DateRangeFilter";
import { computeROIMultiple, formatCurrency } from "@/lib/reportMetrics";
import { apiGetManagerReportStats, type ManagerReportAgentStats } from "@/lib/apiClient";
import { TableRowsSkeleton, CardListSkeleton } from "@/components/ui/Skeletons";
import TablePagination, { usePagination } from "@/components/ui/TablePagination";

const ZERO_AGENT_STATS = { leadsCount: 0, spend: 0, bookingValue: 0, missedCount: 0, missedFollowups: 0 };

export default function ManagerReports({ dateRange }: { dateRange: DateRange }) {
  const { users, currentUser, activeRole, isDataLoading } = useApp();
  const [expanded, setExpanded] = useState<string | null>(null);

  // Per-agent numbers now come from the server (GET /leads/manager-report-stats)
  // instead of scanning the bulk leads/adSpendRecords/followupCalls arrays —
  // the Individual/Team/Combined split and per-member breakdown below still
  // just sum these small per-agent rows client-side, same as before.
  const [agentStats, setAgentStats] = useState<ManagerReportAgentStats[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiGetManagerReportStats(dateRange.from, dateRange.to)
      .then(result => { if (!cancelled) setAgentStats(result); })
      .catch(() => { /* leave the previous numbers showing on a transient failure */ });
    return () => { cancelled = true; };
  }, [dateRange.from, dateRange.to]);
  const statsByAgentId = useMemo(() => new Map(agentStats.map(s => [s.assignedAgentId, s])), [agentStats]);
  const userIdByName = useMemo(() => new Map(users.map(u => [u.name, u.id])), [users]);
  const statsForName = (name: string): ManagerReportAgentStats | typeof ZERO_AGENT_STATS => {
    const id = userIdByName.get(name);
    return (id && statsByAgentId.get(id)) || ZERO_AGENT_STATS;
  };

  // Real reporting-line grouping via users.managerId (see Settings → Manage
  // Users → "Reports To") — previously this grouped leads against a hardcoded
  // name-string lookup with no connection to the actual roster.
  // Role-scoped: ADMIN sees every manager's team; a Manager only ever sees
  // their own row (peer managers' team performance isn't their business);
  // a Member sees none of this — this used to show every manager's full
  // team breakdown to any authenticated viewer regardless of role.
  const managers = useMemo(() => {
    const all = users.filter(u => u.role_type === "Manager");
    if (activeRole === "ADMIN") return all;
    if (currentUser?.role_type === "Manager") return all.filter(m => m.id === currentUser.id);
    return [];
  }, [users, activeRole, currentUser]);

  const managerRows = useMemo(() => {
    return managers.map(manager => {
      const teamMembers = users.filter(u => u.managerId === manager.id).map(u => u.name);

      // Individual (manager's own leads)
      const individual = statsForName(manager.name);
      const individualROI = computeROIMultiple(individual.bookingValue, individual.spend);

      // Team (sum of every direct report's own row — same "sum small
      // per-agent rows" pattern LeadDashboard.tsx's Analytics tab uses)
      const memberStats = teamMembers.map(member => ({ name: member, ...statsForName(member) }));
      const memberBreakdown = memberStats.map(m => ({
        name: m.name,
        leadsCount: m.leadsCount,
        spend: m.spend,
        roi: computeROIMultiple(m.bookingValue, m.spend),
        missedCount: m.missedCount,
        missedFollowupsCount: m.missedFollowups
      }));
      const team = memberStats.reduce((acc, m) => ({
        leadsCount: acc.leadsCount + m.leadsCount,
        spend: acc.spend + m.spend,
        bookingValue: acc.bookingValue + m.bookingValue,
        missedCount: acc.missedCount + m.missedCount
      }), { leadsCount: 0, spend: 0, bookingValue: 0, missedCount: 0 });
      const teamROI = computeROIMultiple(team.bookingValue, team.spend);

      // Combined (individual + team together)
      const totalSpendForManager = individual.spend + team.spend;
      const totalBookingValue = individual.bookingValue + team.bookingValue;
      const combinedROI = computeROIMultiple(totalBookingValue, totalSpendForManager);

      return {
        manager: manager.name,
        individualLeadsCount: individual.leadsCount,
        individualSpend: individual.spend,
        individualROI,
        individualMissedCount: individual.missedCount,
        teamLeadsCount: team.leadsCount,
        teamSpend: team.spend,
        teamROI,
        teamMissedCount: team.missedCount,
        totalLeadsCount: individual.leadsCount + team.leadsCount,
        totalSpendForManager,
        combinedROI,
        memberBreakdown
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managers, users, statsByAgentId]);
  const managerPagination = usePagination(managerRows, 10, JSON.stringify(dateRange));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white border border-slate-100 rounded-xl shadow-sm p-4">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Missed = a lead assigned to that person with no status update within the 20-minute SLA window. &quot;Individual&quot; reports only the
          leads assigned directly to the manager (their own spend and ROI); &quot;Team&quot; rolls up every direct report under them; &quot;Combined&quot;
          is individual + team together.
        </p>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-4">
        <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <Users className="h-4 w-4 text-slate-500" />
          Manager / TL Performance
        </h3>

        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
          {/* Phones: one card per manager, Individual/Team/Combined kept as
              three distinct mini-sections (same tint as the table's column
              groups) instead of flattening into one confusing list of numbers. */}
          <ul className="sm:hidden divide-y divide-slate-100">
            {isDataLoading && managerRows.length === 0 ? (
              <CardListSkeleton count={4} />
            ) : managerRows.length === 0 ? (
              <li className="p-6 text-center text-xs text-slate-400 italic font-semibold">Manager-level reports aren&apos;t visible at your access level.</li>
            ) : (
              managerPagination.pageRows.map(row => (
                <li key={row.manager} className="text-xs">
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-bold text-slate-800 text-sm">{row.manager}</p>
                      <button
                        onClick={() => setExpanded(expanded === row.manager ? null : row.manager)}
                        className="inline-flex items-center gap-1 text-brand-600 font-bold whitespace-nowrap shrink-0"
                      >
                        {expanded === row.manager ? "Hide team" : "View team"}
                        {expanded === row.manager ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    </div>

                    {([
                      ["Individual", "bg-blue-50/60 border-blue-100", row.individualLeadsCount, row.individualSpend, row.individualROI, row.individualMissedCount],
                      ["Team", "bg-indigo-50/60 border-indigo-100", row.teamLeadsCount, row.teamSpend, row.teamROI, row.teamMissedCount],
                      ["Combined", "bg-emerald-50/60 border-emerald-100", row.totalLeadsCount, row.totalSpendForManager, row.combinedROI, null]
                    ] as const).map(([label, tone, leads, spend, roi, missed]) => (
                      <div key={label} className={`rounded-lg border p-3 ${tone}`}>
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">{label}</p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                          <div>
                            <span className="block text-[9px] font-semibold text-slate-400">Leads</span>
                            <span className="font-mono font-bold text-slate-700">{leads}</span>
                          </div>
                          <div>
                            <span className="block text-[9px] font-semibold text-slate-400">Spend</span>
                            <span className="font-mono text-slate-700">{formatCurrency(spend)}</span>
                          </div>
                          <div>
                            <span className="block text-[9px] font-semibold text-slate-400">ROI</span>
                            <span className="font-mono font-bold text-emerald-650">{roi.toFixed(1)}x</span>
                          </div>
                          {missed !== null && (
                            <div>
                              <span className="block text-[9px] font-semibold text-slate-400">Missed</span>
                              {missed > 0 ? (
                                <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                                  <AlertTriangle className="h-3 w-3" /> {missed}
                                </span>
                              ) : (
                                <span className="text-slate-400">0</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {expanded === row.manager && (
                    <div className="px-4 pb-4 pt-0 bg-slate-50/60">
                      <p className="text-[9px] uppercase font-extrabold text-slate-400 tracking-wider mb-2">Team breakdown</p>
                      {row.memberBreakdown.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic">No direct reports mapped to this manager.</p>
                      ) : (
                        <div className="space-y-2">
                          {row.memberBreakdown.map(m => (
                            <div key={m.name} className="bg-white border border-slate-200 rounded-lg p-3 space-y-1.5">
                              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                <p className="text-xs font-bold text-slate-800">{m.name}</p>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                  m.missedCount > 0 ? "bg-red-50 text-red-700 border border-red-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                }`}>
                                  {m.missedCount} missed leads
                                </span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                  m.missedFollowupsCount > 0 ? "bg-amber-50 text-amber-700 border border-amber-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                }`}>
                                  {m.missedFollowupsCount} missed follow-ups
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-500">
                                <span>{m.leadsCount} leads • {formatCurrency(m.spend)} spend</span>
                                <span className="font-bold text-emerald-650">{m.roi.toFixed(1)}x ROI</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
          <div className="hidden sm:block overflow-x-auto">
          <table className="table-fixed w-full min-w-[1440px] text-[11px] border-collapse">
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap" rowSpan={2}>Manager / TL</th>
                <th className="px-4 py-3 border-l border-slate-200 bg-blue-50/40 text-left text-xs font-bold text-slate-800 whitespace-nowrap" colSpan={4}>Individual (Self)</th>
                <th className="px-4 py-3 border-l border-slate-200 bg-indigo-50/40 text-left text-xs font-bold text-slate-800 whitespace-nowrap" colSpan={4}>Team</th>
                <th className="px-4 py-3 border-l border-slate-200 bg-emerald-50/40 text-left text-xs font-bold text-slate-800 whitespace-nowrap" colSpan={2}>Combined</th>
                <th className="px-4 py-3 border-l border-slate-200 text-left text-xs font-bold text-slate-800 whitespace-nowrap" rowSpan={2}></th>
              </tr>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 border-l border-slate-200 bg-blue-50/40 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Leads</th>
                <th className="px-4 py-3 bg-blue-50/40 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Spend</th>
                <th className="px-4 py-3 bg-blue-50/40 text-left text-xs font-bold text-slate-800 whitespace-nowrap">ROI</th>
                <th className="px-4 py-3 bg-blue-50/40 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Missed</th>
                <th className="px-4 py-3 border-l border-slate-200 bg-indigo-50/40 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Leads</th>
                <th className="px-4 py-3 bg-indigo-50/40 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Spend</th>
                <th className="px-4 py-3 bg-indigo-50/40 text-left text-xs font-bold text-slate-800 whitespace-nowrap">ROI</th>
                <th className="px-4 py-3 bg-indigo-50/40 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Missed</th>
                <th className="px-4 py-3 border-l border-slate-200 bg-emerald-50/40 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Leads</th>
                <th className="px-4 py-3 bg-emerald-50/40 text-left text-xs font-bold text-slate-800 whitespace-nowrap">ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isDataLoading && managerRows.length === 0 ? (
                <TableRowsSkeleton rows={6} columns={12} />
              ) : managerRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-6 text-center text-slate-400 italic font-semibold">
                    Manager-level reports aren&apos;t visible at your access level.
                  </td>
                </tr>
              ) : managerPagination.pageRows.map(row => (
                <React.Fragment key={row.manager}>
                  <tr className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-bold text-slate-800">{row.manager}</td>

                    {/* Individual */}
                    <td className="px-4 py-3 font-mono text-slate-600 border-l border-slate-100">{row.individualLeadsCount}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{formatCurrency(row.individualSpend)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-emerald-650">{row.individualROI.toFixed(1)}x</td>
                    <td className="px-4 py-3">
                      {row.individualMissedCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                          <AlertTriangle className="h-3 w-3" /> {row.individualMissedCount}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>

                    {/* Team */}
                    <td className="px-4 py-3 font-mono text-slate-600 border-l border-slate-100">{row.teamLeadsCount}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{formatCurrency(row.teamSpend)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-emerald-650">{row.teamROI.toFixed(1)}x</td>
                    <td className="px-4 py-3">
                      {row.teamMissedCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-red-650 font-bold">
                          <AlertTriangle className="h-3 w-3" /> {row.teamMissedCount}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>

                    {/* Combined */}
                    <td className="px-4 py-3 font-mono font-bold text-slate-800 border-l border-slate-100">{row.totalLeadsCount}</td>
                    <td className="px-4 py-3 font-mono font-bold text-emerald-700">{row.combinedROI.toFixed(1)}x</td>

                    <td className="px-4 py-3 border-l border-slate-100 text-right">
                      <button
                        onClick={() => setExpanded(expanded === row.manager ? null : row.manager)}
                        className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 font-bold whitespace-nowrap"
                      >
                        {expanded === row.manager ? "Hide" : "View"}
                        {expanded === row.manager ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  </tr>
                  {expanded === row.manager && (
                    <tr>
                      <td colSpan={12} className="p-0 bg-slate-50/60">
                        <div className="p-4 space-y-2">
                          <p className="text-[9px] uppercase font-extrabold text-slate-400 tracking-wider">Team breakdown</p>
                          {row.memberBreakdown.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic">No direct reports mapped to this manager.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {row.memberBreakdown.map(m => (
                                <div key={m.name} className="bg-white border border-slate-200 rounded-lg p-3 space-y-1.5">
                                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                    <p className="text-xs font-bold text-slate-800">{m.name}</p>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                      m.missedCount > 0 ? "bg-red-50 text-red-700 border border-red-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                    }`}>
                                      {m.missedCount} missed leads
                                    </span>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                      m.missedFollowupsCount > 0 ? "bg-amber-50 text-amber-700 border border-amber-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                    }`}>
                                      {m.missedFollowupsCount} missed follow-ups
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                                    <span>{m.leadsCount} leads • {formatCurrency(m.spend)} spend</span>
                                    <span className="font-bold text-emerald-650">{m.roi.toFixed(1)}x ROI</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          </div>
          <TablePagination {...managerPagination.paginationProps} rowLabel="Manager" />
        </div>
      </div>
    </div>
  );
}
