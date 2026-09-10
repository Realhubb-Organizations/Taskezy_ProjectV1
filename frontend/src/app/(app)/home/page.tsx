"use client";

import React from "react";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import { Activity, Users, TrendingUp, ArrowRight } from "lucide-react";

// The universal post-login landing page — a lightweight, module-summary
// front door (CRM/HRMS/Finance), distinct from each module's own dashboard
// at /crm/dashboard, /hrms/dashboard and /finance/dashboard. Used to be one
// of several branches inside the old bare /dashboard route, which made
// /dashboard show either this or a module-specific view depending on
// runtime state — confusing both as a URL and in the sidebar (that route
// was also registered as CRM's own "Dashboard" nav item, so it force-
// expanded the CRM group even when this generic view was what rendered).
export default function HomePage() {
  const { leads, followupCalls, currentUser, invoices, reimbursements, timesheets, adSpendRecords } = useApp();

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
    <div className="space-y-5 pb-8 animate-fade-in">
      <div>
        <h2 className="text-base font-bold text-slate-900">Hey, {currentUser?.name}!</h2>
        <p className="text-xs text-slate-450">Are you ready to experience how the growth process work?</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* CRM */}
        <Link href="/crm/dashboard" className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between hover:shadow-md hover:border-brand-200 transition-all cursor-pointer">
          <div className="space-y-3.5">
            <h3 className="text-sm font-extrabold text-brand-700 flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-brand-600" />
              CRM
            </h3>
            <div>
              <p className="text-xs text-slate-450">Leads in last 7 days</p>
              <p className="text-xl font-black text-slate-900 mt-0.5">{leadsLast7Days}</p>
              <p className="text-xs font-bold text-[#006AFF] mt-0.5">{activeCampaignsCount} Active Campaigns</p>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
              <div>
                <p className="text-[10px] text-slate-450">Spends</p>
                <p className="text-sm font-bold text-slate-900">{spendLast7Days >= 1000 ? `${(spendLast7Days / 1000).toFixed(1)}K` : spendLast7Days.toFixed(0)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-450">Avg CPL</p>
                <p className="text-sm font-bold text-slate-900">{avgCplLast7Days.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-450">Follow Ups</p>
                <p className="text-sm font-bold text-slate-900">{pendingFollowUps}</p>
              </div>
            </div>
          </div>
          <span className="text-xs font-bold text-[#006AFF] mt-4 inline-flex items-center gap-1">
            Know More <ArrowRight className="h-3 w-3" />
          </span>
        </Link>

        {/* HRMS */}
        <Link href="/hrms/dashboard" className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between hover:shadow-md hover:border-brand-200 transition-all cursor-pointer">
          <div className="space-y-3.5">
            <h3 className="text-sm font-extrabold text-brand-700 flex items-center gap-1.5">
              <Users className="h-4 w-4 text-brand-600" />
              HRMS
            </h3>
            <div>
              <p className="text-xs text-slate-450">Applied Leaves in last 7 days</p>
              <p className="text-xl font-black text-slate-900 mt-0.5">{leavesAppliedLast7Days}</p>
              <p className="text-xs font-bold text-[#006AFF] mt-0.5">{employeesOnLeave} Employees Applied</p>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
              <div>
                <p className="text-[10px] text-slate-450">Present</p>
                <p className="text-sm font-bold text-slate-900">{presentTodayCount}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-450">Pending Info</p>
                <p className="text-sm font-bold text-red-600">{pendingRegularizations}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-450">WFH</p>
                <p className="text-sm font-bold text-slate-900">{wfhCount}</p>
              </div>
            </div>
          </div>
          <span className="text-xs font-bold text-[#006AFF] mt-4 inline-flex items-center gap-1">
            Know More <ArrowRight className="h-3 w-3" />
          </span>
        </Link>

        {/* Finance */}
        <Link href="/finance/dashboard" className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col justify-between hover:shadow-md hover:border-brand-200 transition-all cursor-pointer">
          <div className="space-y-3.5">
            <h3 className="text-sm font-extrabold text-brand-700 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-brand-600" />
              Finance
            </h3>
            <div>
              <p className="text-xs text-slate-450">Raised Invoices in last 7 days</p>
              <p className="text-xl font-black text-slate-900 mt-0.5">{invoicesLast7Days.length}</p>
              <p className="text-xs font-bold text-[#006AFF] mt-0.5">{propertiesInvoicedLast7Days} Properties Included</p>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
              <div>
                <p className="text-[10px] text-slate-450">Bookings</p>
                <p className="text-sm font-bold text-slate-900">{bookingsCount}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-450">Transactions</p>
                <p className="text-sm font-bold text-slate-900">{invoices.length}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-450">Reimbursements</p>
                <p className="text-sm font-bold text-slate-900">{reimbursements.length}</p>
              </div>
            </div>
          </div>
          <span className="text-xs font-bold text-[#006AFF] mt-4 inline-flex items-center gap-1">
            Know More <ArrowRight className="h-3 w-3" />
          </span>
        </Link>
      </div>
    </div>
  );
}
