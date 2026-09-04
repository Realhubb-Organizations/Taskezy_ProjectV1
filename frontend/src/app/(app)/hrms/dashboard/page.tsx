"use client";

import React from "react";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import { Cpu, Server, Users, Globe } from "lucide-react";

// HRMS's own overview — moved out of the old bare /dashboard route (which
// branched its content by department/activeSystem, so the same URL showed a
// different page depending on runtime state) into its own real path,
// alongside /crm/dashboard and /finance/dashboard.
export default function HrmsDashboardPage() {
  const { users, currentUser, timesheets, attendanceRecords, adSpendRecords, metaConnected, adminSeats, financeSeats, agentSeats } = useApp();

  const userDept = currentUser?.department || "TECH";

  if (userDept === "TECH") {
    return (
      <div className="space-y-8 pb-12 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
            <Cpu className="h-6.5 w-6.5 text-brand-600" />
            IT &amp; Systems Management Dashboard
          </h2>
          <p className="text-xs text-slate-500">Corporate user directories, server telemetry, and partition isolation gates.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Database Isolation Status</span>
            <p className="text-lg font-black text-emerald-600 mt-1 flex items-center gap-1.5">
              <Server className="h-4.5 w-4.5 text-emerald-500" /> Isolated PG partition
            </p>
            <span className="text-[9px] text-slate-400 mt-2">Active on AWS RDS Instance</span>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Active Corporate Seats</span>
            <p className="text-lg font-black text-slate-800 mt-1">
              {users.length} users / {adminSeats + financeSeats + agentSeats} licensed
            </p>
            <span className="text-[9px] text-brand-600 font-bold mt-2">
              Utilization: {Math.round((users.length / Math.max(1, adminSeats + financeSeats + agentSeats)) * 100)}%
            </span>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Meta Ads Integration</span>
            <p className={`text-lg font-black mt-1 ${metaConnected ? "text-slate-800" : "text-slate-400"}`}>
              {metaConnected ? "Connected" : "Not connected"}
            </p>
            <span className={`text-[9px] font-bold mt-2 ${metaConnected ? "text-emerald-600" : "text-amber-600"}`}>
              {metaConnected ? "Live" : "Set up in Settings → Connected Apps"}
            </span>
          </div>
        </div>

        {/* Corporate Roster Listing */}
        <div className="glass-card p-6 rounded-2xl space-y-4">
          <h3 className="text-xs font-bold text-slate-700">Corporate User Directory</h3>
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                    <th className="p-3">User</th>
                    <th className="p-3">Email ID</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Designation</th>
                    <th className="p-3 text-right">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {users.map((u, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-800">{u.name}</td>
                      <td className="p-3 text-slate-500 font-mono">{u.email}</td>
                      <td className="p-3 text-slate-550">{u.department}</td>
                      <td className="p-3 text-slate-500">{u.designation}</td>
                      <td className="p-3 text-right text-brand-700 font-bold">{u.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (userDept === "MARKETING") {
    // All derived from real ad_spend_records — empty/zero until the Meta/Google
    // Ads integration is live and actually writing rows. Impressions/CTR are
    // deliberately left out: the current schema has no field for either, so
    // showing a number for them would just be a different flavor of mock data.
    const totalSpend = adSpendRecords.reduce((sum, r) => sum + r.spend, 0);
    const totalLeadsGenerated = adSpendRecords.reduce((sum, r) => sum + r.leadsGenerated, 0);
    const avgCPL = totalLeadsGenerated > 0 ? totalSpend / totalLeadsGenerated : 0;

    const accountBreakdown = Array.from(
      adSpendRecords.reduce((map, r) => {
        const existing = map.get(r.accountName) || { spend: 0, leads: 0 };
        existing.spend += r.spend;
        existing.leads += r.leadsGenerated;
        map.set(r.accountName, existing);
        return map;
      }, new Map<string, { spend: number; leads: number }>())
    )
      .map(([name, v]) => ({ name, spend: v.spend, leads: v.leads, cpl: v.leads > 0 ? v.spend / v.leads : 0 }))
      .sort((a, b) => b.spend - a.spend);

    return (
      <div className="space-y-8 pb-12 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
            <Globe className="h-6.5 w-6.5 text-brand-600" />
            Marketing &amp; Campaigns Dashboard
          </h2>
          <p className="text-xs text-slate-500">
            {adSpendRecords.length > 0
              ? "Live Meta/Google campaign spending and lead generation telemetry."
              : "No ad spend data yet — connect Meta/Google Ads in Settings to populate this."}
          </p>
        </div>

        {/* Campaign Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center text-xs bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <span className="text-slate-400 block font-semibold mb-0.5">Total Spend</span>
            <span className="text-lg font-black text-brand-700 font-mono">₹{totalSpend.toLocaleString("en-IN")}</span>
          </div>
          <div className="sm:border-l border-slate-200">
            <span className="text-slate-400 block font-semibold mb-0.5">Ingested Leads</span>
            <span className="text-lg font-black text-slate-850">{totalLeadsGenerated}</span>
          </div>
          <div className="sm:border-l border-slate-200">
            <span className="text-slate-400 block font-semibold mb-0.5">Avg CPL</span>
            <span className="text-lg font-black text-brand-700 font-mono">₹{avgCPL.toFixed(0)}</span>
          </div>
        </div>

        {/* Detailed Marketing Campaigns */}
        <div className="glass-card p-6 rounded-2xl space-y-4">
          <h3 className="text-xs font-bold text-slate-700">Ad Account Performance Breakdown</h3>
          <div className="border border-slate-205 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                    <th className="p-3">Rank</th>
                    <th className="p-3">Ad Account</th>
                    <th className="p-3">Leads</th>
                    <th className="p-3">Spend</th>
                    <th className="p-3 text-right">CPL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {accountBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400 font-semibold italic">
                        No ad accounts reporting spend yet.
                      </td>
                    </tr>
                  ) : (
                    accountBreakdown.map((ad, idx) => (
                      <tr key={ad.name} className="hover:bg-slate-50/50">
                        <td className="p-3 text-slate-400">#{idx + 1}</td>
                        <td className="p-3 text-slate-805 truncate max-w-[200px]">{ad.name}</td>
                        <td className="p-3 font-black text-slate-800">{ad.leads}</td>
                        <td className="p-3 text-slate-600 font-mono">₹{ad.spend.toLocaleString("en-IN")}</td>
                        <td className="p-3 text-right text-emerald-600 font-mono font-bold">₹{ad.cpl.toFixed(0)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Otherwise, render general HRMS Overview Dashboard
  const todayStr = new Date().toISOString().split("T")[0];
  const presentTodayCount = timesheets.filter(ts => ts.date === todayStr).length;
  const totalPresentDays = attendanceRecords.reduce((sum, r) => sum + r.presentDays, 0);
  const totalOnTimeDays = attendanceRecords.reduce((sum, r) => sum + r.onTime, 0);
  const avgOnTimeRate = totalPresentDays > 0 ? Math.round((totalOnTimeDays / totalPresentDays) * 100) : 0;
  return (
    <div className="space-y-8 pb-12 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
          <Users className="h-6.5 w-6.5 text-brand-600" />
          HRMS Overview Dashboard
        </h2>
        <p className="text-xs text-slate-500">Corporate roster demographics, attendance statistics, and geofencing telemetry.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Employees</span>
          <p className="text-2xl font-black text-slate-800 mt-1">{users.length}</p>
          <span className="text-[9px] text-slate-450 mt-2 block">Active roster accounts</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Present Today</span>
          <p className="text-2xl font-black text-brand-700 mt-1">{presentTodayCount}</p>
          <span className="text-[9px] text-slate-455 mt-2 block">
            Attendance rate: {users.length > 0 ? Math.round((presentTodayCount / users.length) * 100) : 0}%
          </span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Late Clock-Ins</span>
          <p className="text-2xl font-black text-amber-600 mt-1">
            {attendanceRecords.reduce((sum, r) => sum + r.late, 0)}
          </p>
          <span className="text-[9px] text-slate-450 mt-2 block">Requires correction checks</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending Corrections</span>
          <p className="text-2xl font-black text-slate-800 mt-1">
            {timesheets.filter(ts => ts.status === "Regularization Pending").length}
          </p>
          <span className="text-[9px] text-slate-450 mt-2 block">Awaiting audit approval</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-center flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Avg On-Time Rate</span>
          <p className="text-2xl font-black text-emerald-650 mt-1">{avgOnTimeRate}%</p>
          <span className="text-[9px] text-slate-450 mt-2 block">All geofenced logs</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Quick Stats */}
        <div className="glass-card p-6 rounded-2xl space-y-4">
          <h3 className="text-xs font-bold text-slate-705 border-b border-slate-100 pb-3">Corporate Roster Snapshot</h3>
          <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto pr-1 text-xs">
            {users.slice(0, 5).map((member, idx) => (
              <div key={idx} className="py-2.5 flex justify-between items-center font-medium">
                <div>
                  <p className="font-bold text-slate-850">{member.name}</p>
                  <p className="text-[9px] text-slate-400 font-mono mt-0.5">{member.email}</p>
                </div>
                <div className="text-right">
                  <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[9px] text-slate-600 font-bold block">
                    {member.department}
                  </span>
                  <span className="text-[9px] text-slate-400 mt-1 block">{member.designation}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-6 rounded-2xl space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-705 border-b border-slate-100 pb-3">HRIS Guidelines & Policies</h3>
            <p className="text-[11px] text-slate-550 leading-relaxed mt-2">
              Taskezy geofencing attendance records are audited daily. Clock-ins registered outside of Mumbai Corporate HQ (perimeter 150m) must be regularized with appropriate business reason. Regularization requests are approved by Global Administrators.
            </p>
          </div>
          <div className="pt-4 border-t border-slate-105">
            <Link href="/dashboard/hrms?tab=attendance" className="text-xs text-brand-700 hover:underline font-bold">
              View My Attendance logs →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
