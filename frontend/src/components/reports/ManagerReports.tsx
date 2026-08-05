"use client";

import React, { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { ChevronDown, ChevronUp, AlertTriangle, Users } from "lucide-react";
import { DateRange } from "./DateRangeFilter";
import {
  filterLeadsByRange,
  filterAdSpendByRange,
  computeBookingValue,
  computeROIMultiple,
  computeAllocatedSpend,
  isMissedLead,
  formatCurrency
} from "@/lib/reportMetrics";

export default function ManagerReports({ dateRange }: { dateRange: DateRange }) {
  const { leads, adSpendRecords, users } = useApp();
  const [expanded, setExpanded] = useState<string | null>(null);

  const rangeLeads = useMemo(() => filterLeadsByRange(leads, dateRange.from, dateRange.to), [leads, dateRange]);
  const rangeSpend = useMemo(() => filterAdSpendByRange(adSpendRecords, dateRange.from, dateRange.to), [adSpendRecords, dateRange]);
  const totalSpend = rangeSpend.reduce((sum, r) => sum + r.spend, 0);
  const totalLeadsCount = rangeLeads.length;

  // Real reporting-line grouping via users.managerId (see Settings → Manage
  // Users → "Reports To") — previously this grouped leads against a hardcoded
  // name-string lookup with no connection to the actual roster.
  const managers = useMemo(() => users.filter(u => u.role_type === "Manager"), [users]);

  const managerRows = useMemo(() => {
    return managers.map(manager => {
      const teamMembers = users.filter(u => u.managerId === manager.id).map(u => u.name);
      const individualLeads = rangeLeads.filter(l => l.assignedAgent === manager.name);
      const teamLeads = rangeLeads.filter(l => teamMembers.includes(l.assignedAgent));
      const allLeads = [...individualLeads, ...teamLeads];

      // Individual (manager's own leads) — spend/ROI computed on their own leads only
      const individualSpend = computeAllocatedSpend(individualLeads.length, totalLeadsCount, totalSpend);
      const individualBookingValue = computeBookingValue(individualLeads);
      const individualROI = computeROIMultiple(individualBookingValue, individualSpend);
      const individualMissed = individualLeads.filter(isMissedLead);

      // Team (every direct report's leads) — spend/ROI computed on the team's leads only
      const teamSpend = computeAllocatedSpend(teamLeads.length, totalLeadsCount, totalSpend);
      const teamBookingValue = computeBookingValue(teamLeads);
      const teamROI = computeROIMultiple(teamBookingValue, teamSpend);
      const teamMissed = teamLeads.filter(isMissedLead);

      // Combined (individual + team together)
      const totalSpendForManager = individualSpend + teamSpend;
      const totalBookingValue = individualBookingValue + teamBookingValue;
      const combinedROI = computeROIMultiple(totalBookingValue, totalSpendForManager);

      const memberBreakdown = teamMembers.map(member => {
        const memberLeads = rangeLeads.filter(l => l.assignedAgent === member);
        const memberSpend = computeAllocatedSpend(memberLeads.length, totalLeadsCount, totalSpend);
        const memberBookingValue = computeBookingValue(memberLeads);
        const memberROI = computeROIMultiple(memberBookingValue, memberSpend);
        const memberMissed = memberLeads.filter(isMissedLead);
        return {
          name: member,
          leadsCount: memberLeads.length,
          spend: memberSpend,
          roi: memberROI,
          missedCount: memberMissed.length
        };
      });

      return {
        manager: manager.name,
        individualLeadsCount: individualLeads.length,
        individualSpend,
        individualROI,
        individualMissedCount: individualMissed.length,
        teamLeadsCount: teamLeads.length,
        teamSpend,
        teamROI,
        teamMissedCount: teamMissed.length,
        totalLeadsCount: allLeads.length,
        totalSpendForManager,
        combinedROI,
        memberBreakdown
      };
    });
  }, [managers, users, rangeLeads, totalSpend, totalLeadsCount]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-card p-4 rounded-xl">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Missed = a lead assigned to that person with no status update within the 20-minute SLA window. &quot;Individual&quot; reports only the
          leads assigned directly to the manager (their own spend and ROI); &quot;Team&quot; rolls up every direct report under them; &quot;Combined&quot;
          is individual + team together.
        </p>
      </div>

      <div className="glass-card p-6 rounded-2xl space-y-4">
        <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <Users className="h-4 w-4 text-slate-500" />
          Manager / TL Performance
        </h3>

        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[9px] uppercase font-bold text-slate-400 tracking-wider">
                <th className="p-3" rowSpan={2}>Manager / TL</th>
                <th className="p-2 text-center border-l border-slate-200 bg-blue-50/40" colSpan={4}>Individual (Self)</th>
                <th className="p-2 text-center border-l border-slate-200 bg-indigo-50/40" colSpan={4}>Team</th>
                <th className="p-2 text-center border-l border-slate-200 bg-emerald-50/40" colSpan={2}>Combined</th>
                <th className="p-3 border-l border-slate-200" rowSpan={2}></th>
              </tr>
              <tr className="bg-slate-50 border-b border-slate-200 text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                <th className="p-2 border-l border-slate-200 bg-blue-50/40">Leads</th>
                <th className="p-2 bg-blue-50/40">Spend</th>
                <th className="p-2 bg-blue-50/40">ROI</th>
                <th className="p-2 bg-blue-50/40">Missed</th>
                <th className="p-2 border-l border-slate-200 bg-indigo-50/40">Leads</th>
                <th className="p-2 bg-indigo-50/40">Spend</th>
                <th className="p-2 bg-indigo-50/40">ROI</th>
                <th className="p-2 bg-indigo-50/40">Missed</th>
                <th className="p-2 border-l border-slate-200 bg-emerald-50/40">Leads</th>
                <th className="p-2 bg-emerald-50/40">ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {managerRows.map(row => (
                <React.Fragment key={row.manager}>
                  <tr className="hover:bg-slate-50/50">
                    <td className="p-3 font-bold text-slate-800">{row.manager}</td>

                    {/* Individual */}
                    <td className="p-2 font-mono text-slate-600 border-l border-slate-100 text-center">{row.individualLeadsCount}</td>
                    <td className="p-2 font-mono text-slate-700 text-center">{formatCurrency(row.individualSpend)}</td>
                    <td className="p-2 font-mono font-bold text-emerald-650 text-center">{row.individualROI.toFixed(1)}x</td>
                    <td className="p-2 text-center">
                      {row.individualMissedCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                          <AlertTriangle className="h-3 w-3" /> {row.individualMissedCount}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>

                    {/* Team */}
                    <td className="p-2 font-mono text-slate-600 border-l border-slate-100 text-center">{row.teamLeadsCount}</td>
                    <td className="p-2 font-mono text-slate-700 text-center">{formatCurrency(row.teamSpend)}</td>
                    <td className="p-2 font-mono font-bold text-emerald-650 text-center">{row.teamROI.toFixed(1)}x</td>
                    <td className="p-2 text-center">
                      {row.teamMissedCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-red-650 font-bold">
                          <AlertTriangle className="h-3 w-3" /> {row.teamMissedCount}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>

                    {/* Combined */}
                    <td className="p-2 font-mono font-bold text-slate-800 border-l border-slate-100 text-center">{row.totalLeadsCount}</td>
                    <td className="p-2 font-mono font-bold text-emerald-700 text-center">{row.combinedROI.toFixed(1)}x</td>

                    <td className="p-3 border-l border-slate-100 text-right">
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
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold text-slate-800">{m.name}</p>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                      m.missedCount > 0 ? "bg-red-50 text-red-700 border border-red-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                    }`}>
                                      {m.missedCount} missed
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
      </div>
    </div>
  );
}
