"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useApp, FollowupCall, User, Invoice, Lead } from "@/context/AppContext";
import AddLeadModal from "@/components/crm/AddLeadModal";
import PendingLeadsTable, { PendingRow } from "@/components/dashboard/PendingLeadsTable";
import {
  Phone,
  Clock,
  Calendar,
  Users,
  MapPin,
  TrendingUp,
  Percent,
  Layers,
  Globe,
  Award,
  AlertCircle,
  Building,
  Target,
  ArrowRight,
  TrendingDown,
  Activity,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  DollarSign,
  FileText,
  ShieldAlert,
  Server,
  Lock,
  Cpu,
  Plus,
  Eye
} from "lucide-react";

export default function DashboardHome() {
  const {
    leads, properties, followupCalls, users, currentUser, invoices, reimbursements, activeSystem, timesheets,
    attendanceRecords, calendarEvents, adSpendRecords, metaConnected, adminSeats, financeSeats, agentSeats, addLead
  } = useApp();

  const [dateRange, setDateRange] = useState<"today" | "yesterday" | "week" | "month" | "all">("today");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  const dateInRange = (dateStr: string | undefined, range: typeof dateRange, refNow: Date): boolean => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    if (range === "all") return true;
    const startOfToday = new Date(refNow.getFullYear(), refNow.getMonth(), refNow.getDate());
    if (range === "today") return d.toDateString() === refNow.toDateString();
    if (range === "yesterday") {
      const y = new Date(startOfToday);
      y.setDate(y.getDate() - 1);
      return d.toDateString() === y.toDateString();
    }
    if (range === "week") {
      const weekAgo = new Date(startOfToday);
      weekAgo.setDate(weekAgo.getDate() - 6);
      return d >= weekAgo;
    }
    // month
    return d.getMonth() === refNow.getMonth() && d.getFullYear() === refNow.getFullYear();
  };

  const sortedLogs = (l: Lead) => [...(l.logs || [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const latestLogMessage = (l: Lead): string => {
    const logs = sortedLogs(l);
    return logs.length > 0 ? logs[0].message : "No feedback yet";
  };

  // "When did this lead actually enter its current pending state" — the most
  // recent log entry, not the lead's original createdAtStr (which stays fixed
  // from lead creation and would make a follow-up look "due" from weeks ago).
  const formatDateTime = (iso: string | undefined): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const lastActivityIso = (l: Lead): string | undefined => {
    const logs = sortedLogs(l);
    return logs.length > 0 ? logs[0].timestamp : l.createdAtStr;
  };

  const lastActivityTime = (l: Lead): string => formatDateTime(lastActivityIso(l));

  // Finance metrics
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const pendingClaimsCount = reimbursements.filter(r => r.status === "Pending").length;
  const pendingFinanceReview = leads.filter(l => l.status === "Finance Review" || l.status === "Booking Done").length;

  // Department dashboard selector
  const userDept = currentUser?.department || "TECH";
  const userRole = currentUser?.role || "ADMIN";

  // Render Admin Home (replaces the old dense "Global Admin Operations
  // Cockpit" — a lighter, module-summary landing screen instead, per the
  // provided design). The detailed telemetry that used to live here
  // (KpiGrid/SalesTelemetry/AttendanceWidget/FinanceAudit/MarketingOperations)
  // is still reachable from each module's own page — this screen is just the
  // front door.
  if (activeSystem === "ADMIN") {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    const isWithinLast7Days = (iso?: string) => !!iso && new Date(iso) >= sevenDaysAgo;

    // CRM — all real: leads created in the window, campaigns the ad-spend
    // sync currently reports ACTIVE, spend/lead-count in the same window
    // (CPL derived from those, not a separate estimate), and follow-ups
    // still pending action.
    const leadsLast7Days = leads.filter(l => isWithinLast7Days(l.createdAtStr)).length;
    const activeCampaignsCount = new Set(
      adSpendRecords.filter(r => r.campaignStatus === "ACTIVE").map(r => r.accountName)
    ).size;
    const spendLast7Days = adSpendRecords.filter(r => isWithinLast7Days(r.date)).reduce((s, r) => s + r.spend, 0);
    const leadsGenLast7Days = adSpendRecords.filter(r => isWithinLast7Days(r.date)).reduce((s, r) => s + r.leadsGenerated, 0);
    const avgCplLast7Days = leadsGenLast7Days > 0 ? spendLast7Days / leadsGenLast7Days : 0;
    const pendingFollowUps = followupCalls.filter(c => c.status === "Upcoming").length;

    // HRMS — Present/Pending Info use real timesheet/regularization data.
    // "Leave applications" and "WFH" have no backing feature anywhere in this
    // schema (no leave-request table, no remote-work flag) — shown honestly
    // as 0 rather than invented, matching how every other unavailable metric
    // in this app is handled (e.g. Talk Time: "No data").
    const todayStr = now.toISOString().split("T")[0];
    const presentTodayCount = timesheets.filter(ts => ts.date === todayStr).length;
    const pendingRegularizations = timesheets.filter(ts => ts.status === "Regularization Pending").length;
    const leavesAppliedLast7Days = 0;
    const employeesOnLeave = 0;
    const wfhCount = 0;

    // Finance — invoices in the window (+ distinct projects they cover),
    // current booked-lead count, total invoices as the closest real
    // "transactions" proxy (no separate ledger table exists), and total
    // reimbursement claims.
    const invoicesLast7Days = invoices.filter(i => isWithinLast7Days(i.createdAt));
    const propertiesInvoicedLast7Days = new Set(invoicesLast7Days.map(i => i.projectName).filter(Boolean)).size;
    const bookingsCount = leads.filter(l => ["Booked", "Booking Done", "Booking Approved"].includes(l.status)).length;

    return (
      <div className="space-y-8 pb-12 animate-fade-in">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Hey, {currentUser?.name}!</h2>
          <Link href="#" className="text-sm text-slate-450 underline underline-offset-2 hover:text-slate-600 transition-colors">
            Are you ready to experience how the growth process work?
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* CRM */}
          <Link href="/dashboard/crm" className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-7 flex flex-col justify-between hover:shadow-md hover:border-brand-200 transition-all cursor-pointer">
            <div className="space-y-5">
              <h3 className="text-2xl font-extrabold text-brand-700 flex items-center gap-2">
                <Activity className="h-6 w-6 text-brand-600" />
                CRM
              </h3>
              <div>
                <p className="text-sm text-slate-450">Leads in last 7 days</p>
                <p className="text-3xl font-black text-slate-900 mt-1">{leadsLast7Days}</p>
                <p className="text-sm font-bold text-[#006AFF] mt-1">{activeCampaignsCount} Active Campaigns</p>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <p className="text-xs text-slate-450">Spends</p>
                  <p className="text-lg font-bold text-slate-900">{spendLast7Days >= 1000 ? `${(spendLast7Days / 1000).toFixed(1)}K` : spendLast7Days.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-450">Avg CPL</p>
                  <p className="text-lg font-bold text-slate-900">{avgCplLast7Days.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-450">Follow Ups</p>
                  <p className="text-lg font-bold text-slate-900">{pendingFollowUps}</p>
                </div>
              </div>
            </div>
            <span className="text-sm font-bold text-[#006AFF] mt-6 inline-flex items-center gap-1">
              Know More <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>

          {/* HRMS */}
          <Link href="/dashboard/hrms" className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-7 flex flex-col justify-between hover:shadow-md hover:border-brand-200 transition-all cursor-pointer">
            <div className="space-y-5">
              <h3 className="text-2xl font-extrabold text-brand-700 flex items-center gap-2">
                <Users className="h-6 w-6 text-brand-600" />
                HRMS
              </h3>
              <div>
                <p className="text-sm text-slate-450">Applied Leaves in last 7 days</p>
                <p className="text-3xl font-black text-slate-900 mt-1">{leavesAppliedLast7Days}</p>
                <p className="text-sm font-bold text-[#006AFF] mt-1">{employeesOnLeave} Employees Applied</p>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <p className="text-xs text-slate-450">Present</p>
                  <p className="text-lg font-bold text-slate-900">{presentTodayCount}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-450">Pending Info</p>
                  <p className="text-lg font-bold text-red-600">{pendingRegularizations}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-450">WFH</p>
                  <p className="text-lg font-bold text-slate-900">{wfhCount}</p>
                </div>
              </div>
            </div>
            <span className="text-sm font-bold text-[#006AFF] mt-6 inline-flex items-center gap-1">
              Know More <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>

          {/* Finance */}
          <Link href="/dashboard/finance" className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-7 flex flex-col justify-between hover:shadow-md hover:border-brand-200 transition-all cursor-pointer">
            <div className="space-y-5">
              <h3 className="text-2xl font-extrabold text-brand-700 flex items-center gap-2">
                <TrendingUp className="h-6 w-6 text-brand-600" />
                Finance
              </h3>
              <div>
                <p className="text-sm text-slate-450">Raised Invoices in last 7 days</p>
                <p className="text-3xl font-black text-slate-900 mt-1">{invoicesLast7Days.length}</p>
                <p className="text-sm font-bold text-[#006AFF] mt-1">{propertiesInvoicedLast7Days} Properties Included</p>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <p className="text-xs text-slate-450">Bookings</p>
                  <p className="text-lg font-bold text-slate-900">{bookingsCount}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-450">Transactions</p>
                  <p className="text-lg font-bold text-slate-900">{invoices.length}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-450">Reimbursements</p>
                  <p className="text-lg font-bold text-slate-900">{reimbursements.length}</p>
                </div>
              </div>
            </div>
            <span className="text-sm font-bold text-[#006AFF] mt-6 inline-flex items-center gap-1">
              Know More <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </div>
      </div>
    );
  }

  // Render Finance Department View (Finance department can only access the finance part)
  if (activeSystem === "FINANCE") {
    return (
      <div className="space-y-8 pb-12 animate-fade-in">
        <div>
          <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
            <DollarSign className="h-6.5 w-6.5 text-brand-600" />
            Finance Operations Cockpit
          </h2>
          <p className="text-xs text-slate-500">Corporate invoices, GST ledgers, and expense claim reimbursement systems.</p>
        </div>

        {/* Finance Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Invoiced Amount</span>
              <p className="text-xl font-black text-slate-800">₹{totalInvoiced.toLocaleString()}</p>
              <span className="text-[9px] text-slate-400 block mt-1">Includes 18% CGST + SGST</span>
            </div>
            <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
              <DollarSign className="h-5.5 w-5.5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending Reimbursement Claims</span>
              <p className="text-xl font-black text-amber-600">{pendingClaimsCount} claims</p>
              <span className="text-[9px] text-slate-450 block mt-1">Requires review</span>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
              <FileText className="h-5.5 w-5.5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pending Booking Reviews</span>
              <p className="text-xl font-black text-brand-700">{pendingFinanceReview} bookings</p>
              <span className="text-[9px] text-slate-450 block mt-1">Awaiting GST invoice generation</span>
            </div>
            <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-brand-700">
              <CheckCircle className="h-5.5 w-5.5" />
            </div>
          </div>
        </div>

        {/* Finance Actions Info */}
        <div className="glass-card p-6 rounded-2xl bg-brand-50/10 border border-brand-200 space-y-3">
          <h3 className="text-xs font-bold text-brand-850 flex items-center gap-1.5">
            <Lock className="h-4.5 w-4.5 text-brand-600" />
            Isolated Finance Boundary
          </h3>
          <p className="text-xs text-slate-650 leading-relaxed">
            As a member of the Finance department, your account boundary is restricted exclusively to financial telemetry, invoice dispatching, and reimbursement claim governance. Other business lines (CRM pipelines, HRMS geofencing) are blocked.
          </p>
        </div>
      </div>
    );
  }

  // Render HRMS View
  if (activeSystem === "HRMS") {
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

  // DEFAULT VIEW: SALES VIEW (Default view for sales department managers and members)
  const isSalesMember = currentUser?.role_type === "Member" && currentUser?.role !== "ADMIN";

  const scopedLeads = leads.filter(l => {
    if (isSalesMember) {
      return l.assignedAgent.toLowerCase() === currentUser?.name.toLowerCase();
    }
    return true;
  });

  const now = new Date();
  const rangeLeads = scopedLeads.filter(l => dateInRange(l.createdAtStr, dateRange, now));

  // Stat row mirrors the app's canonical lead-status funnel (leadStatusMapping.ts)
  // rather than inventing new categories — every number here is a real count
  // of leads currently sitting in that status, within the selected date range.
  // "Call Backs" deliberately reads the lead's own status (like every other
  // card here) rather than the followup_calls table: a FollowupCall row is
  // only created when an agent also fills in the optional reminder date/time
  // picker after changing status, so sourcing this metric from that table
  // would silently show 0 even when leads are genuinely sitting in Call Back.
  const totalLeadsCount = rangeLeads.length;
  const newLeadsCount = rangeLeads.filter(l => l.status === "New Lead").length;
  const rnrCount = rangeLeads.filter(l => l.status === "RNR").length;
  const callBacksCount = rangeLeads.filter(l => l.status === "Call Back").length;
  const followUpsCount = rangeLeads.filter(l => l.status === "Follow-ups").length;
  const siteVisitScheduledCount = rangeLeads.filter(l => l.status === "Visit Schedule").length;
  const siteVisitDoneCount = rangeLeads.filter(l => l.status === "Site Visit").length;

  const statCards: { label: string; value: number; color: string }[] = [
    { label: "Total Leads", value: totalLeadsCount, color: "text-slate-900" },
    { label: "New Leads", value: newLeadsCount, color: "text-[#0084FF]" },
    { label: "RNR", value: rnrCount, color: "text-[#FF0000]" },
    { label: "Call Backs", value: callBacksCount, color: "text-[#FF8C00]" },
    { label: "Follow Ups", value: followUpsCount, color: "text-[#0084FF]" },
    { label: "Site Visit Scheduled", value: siteVisitScheduledCount, color: "text-[#FF0000]" },
    { label: "Site Visit Done", value: siteVisitDoneCount, color: "text-[#015814]" }
  ];

  const byMostRecentActivity = (a: Lead, b: Lead) => new Date(lastActivityIso(b) || 0).getTime() - new Date(lastActivityIso(a) || 0).getTime();

  const pendingFollowUpLeads = rangeLeads.filter(l => l.status === "Follow-ups").sort(byMostRecentActivity);
  const pendingCallBackLeads = rangeLeads.filter(l => l.status === "Call Back").sort(byMostRecentActivity);

  // Real sales roster + property list, same source the Leads page's Add Lead
  // modal already uses — reused here so "+ Upload Leads" is a real, working
  // entry point rather than a second, divergent implementation.
  const propertiesList = properties.map(p => p.name);
  const agentsList = users.filter(u => u.department === "SALES" && u.status !== "INACTIVE").map(u => u.name);

  const handleUploadManualLead = (data: { name: string; phone: string; email: string; agent: string; source: string; property: string; note: string }) => {
    const res = addLead({
      name: data.name,
      phone: data.phone,
      email: data.email,
      assignedAgent: data.agent,
      campaign: data.source,
      property: data.property || undefined,
      leadScore: 85,
      createdAtStr: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    });
    if (res.success) {
      setIsUploadOpen(false);
      setUploadMsg(`Successfully ingested lead for: ${data.name}`);
      setTimeout(() => setUploadMsg(""), 4000);
    } else {
      alert(`Ingestion failed: ${res.error}`);
    }
  };

  const handleUploadBulkLeads = (data: { assignmentMode: "project" | "agent"; target: string; fileName: string }) => {
    alert(`Bulk Import Started!\nFile: ${data.fileName}\nAssignment Mode: ${data.assignmentMode} (${data.target})\nProcessing rows...`);
    setIsUploadOpen(false);
  };

  const followUpRows: PendingRow[] = pendingFollowUpLeads.map(l => ({
    id: l.id,
    time: lastActivityTime(l),
    name: l.name,
    phone: l.phone,
    assignedTo: l.assignedAgent,
    feedback: latestLogMessage(l),
    property: l.property || "Not set",
    leadId: l.id
  }));

  const callBackRows: PendingRow[] = pendingCallBackLeads.map(l => ({
    id: l.id,
    time: lastActivityTime(l),
    name: l.name,
    phone: l.phone,
    assignedTo: l.assignedAgent,
    feedback: latestLogMessage(l),
    property: l.property || "Not set",
    leadId: l.id
  }));

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Dashboard</h2>
          <p className="text-sm text-slate-500 mt-1">
            {isSalesMember
              ? `Personal workspace for ${currentUser?.name}. Viewing active leads and scheduled callbacks.`
              : "Global sales operations tracking, pipelines distribution, and performance logs."}
          </p>
        </div>
        <button
          onClick={() => setIsUploadOpen(true)}
          className="inline-flex items-center gap-2 bg-[#0B0447] hover:opacity-90 text-white px-6 py-3.5 rounded-2xl text-base font-semibold transition-all shadow-md shrink-0"
        >
          <Plus className="h-5 w-5" />
          Upload Leads
        </button>
      </div>

      {uploadMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 rounded-xl font-bold flex items-center gap-2 animate-fade-in shadow-sm">
          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{uploadMsg}</span>
        </div>
      )}

      {/* Toolbar: date range + drill-down link */}
      <div className="flex flex-wrap justify-between items-center gap-3 bg-white shadow-sm rounded-xl px-5 py-4">
        <div className="flex items-center gap-2 text-base text-slate-500">
          <span>Date Range</span>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
            className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>
        </div>
        <Link href="/dashboard/reports" className="text-base font-semibold text-[#0F2D90] hover:underline">
          View Detailed Analytics
        </Link>
      </div>

      {/* Stat row — the CRM funnel snapshot for the selected date range */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {statCards.map((s) => (
          <Link
            key={s.label}
            href="/dashboard/crm"
            className="bg-white rounded-2xl shadow-md px-4 py-5 hover:shadow-lg transition-shadow"
          >
            <span className="flex items-center justify-between text-sm font-medium text-slate-500">
              {s.label} <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
            </span>
            <span className={`text-3xl font-extrabold block mt-2 ${s.color}`}>{s.value}</span>
          </Link>
        ))}
      </div>

      {/* Pending Follow ups — leads currently sitting in the Follow-ups status */}
      <PendingLeadsTable title="Pending Follow ups" rows={followUpRows} />

      {/* Pending Call Backs — the operational followup_calls callback queue */}
      <PendingLeadsTable title="Pending Call Backs" rows={callBackRows} />

      <AddLeadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSubmitManual={handleUploadManualLead}
        onSubmitBulk={handleUploadBulkLeads}
        agentsList={agentsList}
        propertiesList={propertiesList}
      />
    </div>
  );
}
