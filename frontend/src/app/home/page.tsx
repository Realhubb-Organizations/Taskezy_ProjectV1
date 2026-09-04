"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";

export default function DashboardHome() {
  const router = useRouter();
  const {
    leads,
    followupCalls,
    currentUser,
    invoices,
    reimbursements,
    timesheets,
    adSpendRecords,
    setActiveSystem
  } = useApp();

  const getFirstName = (fullName: string) => {
    if (!fullName) return "Bhavuk";
    return fullName.split(" ")[0];
  };

  // --- Dynamic Stats Calculations with fallback to screenshot values ---
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // CRM Card Stats
  const leadsLast7Days = leads.filter(l => l.createdAtStr && new Date(l.createdAtStr) >= sevenDaysAgo).length;
  const activeCampaigns = new Set(adSpendRecords.map(r => r.accountName)).size;
  const totalSpends = adSpendRecords.reduce((sum, r) => sum + r.spend, 0);
  const spendsDisplay = totalSpends > 0 ? `${(totalSpends / 1000).toFixed(1)}K` : "0";
  const totalLeadsGenerated = adSpendRecords.reduce((sum, r) => sum + r.leadsGenerated, 0);
  const avgCPL = totalLeadsGenerated > 0 ? (totalSpends / totalLeadsGenerated).toFixed(2) : "0.00";
  const followUpsCount = followupCalls.filter(c => c.status === "Upcoming").length;

  // HRMS Card Stats
  const appliedLeavesCount = "—";
  const employeesAppliedCount = "—";
  const presentCount = 0;
  const pendingInfoCount = timesheets.filter(ts => ts.status === "Regularization Pending").length;
  const wfhCount = "—";

  // Finance Card Stats
  const raisedInvoicesLast7Days = invoices.filter(inv => inv.createdAt && new Date(inv.createdAt) >= sevenDaysAgo).length;
  const propertiesIncludedCount = new Set(invoices.map(inv => inv.projectName || "Property")).size;
  const bookingsCount = leads.filter(l => l.status === "Booking Done" || l.status === "Booking Approved").length;
  const transactionsCount = invoices.filter(inv => inv.status === "Paid").length;
  const reimbursementsCount = reimbursements.length;

  const navigateToModule = (system: "CRM" | "HRMS" | "FINANCE", path: string) => {
    setActiveSystem(system);
    router.push(path);
  };

  return (
    <div className="w-full pb-12 pt-0">
      <div className="pt-0 pb-2 -mt-5">
        <h1 className="text-[22px] font-extrabold text-black tracking-tight leading-none pt-0">
          Hey, {currentUser?.name }!
        </h1>
        <p className="text-[#888D96] text-[14px] font-normal mt-1.5 leading-none">
          Are you ready to experience how the growth process work?
        </p>
      </div>

      {/* Horizontal Divider Line */}
      <div className="border-t border-[#E5E7EB] w-full mb-5"></div>

      {/* 3 Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* CRM Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-[24px] p-6 shadow-sm flex flex-col justify-between min-h-[300px]">
          <div>
            {/* Logo Section */}
            <div className="flex items-center h-[52px]">
              <img src="/crm_logo.png" alt="iCRM Logo" className="h-[48px] w-auto object-contain" />
            </div>

            {/* Main Stats */}
            <div className="mt-4">
              <span className="text-[#888D96] text-[13px] font-normal block tracking-tight">Leads in last 7 days</span>
              <span className="text-black font-extrabold text-[32px] block mt-1 leading-none">{leadsLast7Days}</span>
              <span className="text-[13px] mt-2 block">
                <span className="text-[#0055FF] font-extrabold">{activeCampaigns} Active</span>{" "}
                <span className="text-[#555] font-bold">Campaigns</span>
              </span>
            </div>

            {/* Grid Metrics */}
            <div className="mt-5">
              {/* Labels Row */}
              <div className="grid grid-cols-3 gap-2">
                <span className="text-[#888D96] text-[13px] font-normal leading-tight block">Spends</span>
                <span className="text-[#888D96] text-[13px] font-normal leading-tight block">Avg CPL</span>
                <span className="text-[#888D96] text-[13px] font-normal leading-tight block">Follow Ups</span>
              </div>
              {/* Values Row */}
              <div className="grid grid-cols-3 gap-2 mt-1">
                <span className="text-black font-bold text-[18px] block">{spendsDisplay}</span>
                <span className="text-black font-bold text-[18px] block">{avgCPL}</span>
                <span className="text-black font-bold text-[18px] block">{followUpsCount}</span>
              </div>
            </div>
          </div>

          {/* Action */}
          <button 
            onClick={() => navigateToModule("CRM", "/dashboard/crm")}
            className="text-[#0055FF] font-normal text-[13px] hover:underline flex items-center gap-1 mt-6 self-start"
          >
            Know More <span className="text-[12px] font-medium">&gt;</span>
          </button>
        </div>

        {/* HRMS Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-[24px] p-6 shadow-sm flex flex-col justify-between min-h-[300px]">
          <div>
            {/* Logo Section */}
            <div className="flex items-center h-[52px]">
              <img src="/hrms_logo.png" alt="HRMS Logo" className="h-[48px] w-auto object-contain" />
            </div>

            {/* Main Stats */}
            <div className="mt-4">
              <span className="text-[#888D96] text-[13px] font-normal block tracking-tight">Applied Leaves in last 7 days</span>
              <span className="text-black font-extrabold text-[32px] block mt-1 leading-none">{appliedLeavesCount}</span>
              <span className="text-[13px] mt-2 block">
                <span className="text-[#0055FF] font-extrabold">{employeesAppliedCount} Employees</span>{" "}
                <span className="text-[#555] font-bold">Applied</span>
              </span>
            </div>

            {/* Grid Metrics */}
            <div className="mt-5">
              {/* Labels Row */}
              <div className="grid grid-cols-3 gap-2">
                <span className="text-[#888D96] text-[13px] font-normal leading-tight block">Present</span>
                <span className="text-[#888D96] text-[13px] font-normal leading-tight block">Pending Info</span>
                <span className="text-[#888D96] text-[13px] font-normal leading-tight block">WFH</span>
              </div>
              {/* Values Row */}
              <div className="grid grid-cols-3 gap-2 mt-1">
                <span className="text-black font-bold text-[18px] block">{presentCount}</span>
                <span className="text-[#EF4444] font-bold text-[18px] block">{pendingInfoCount}</span>
                <span className="text-black font-bold text-[18px] block">{wfhCount}</span>
              </div>
            </div>
          </div>

          {/* Action */}
          <button 
            onClick={() => navigateToModule("HRMS", "/dashboard/hrms?tab=dashboard")}
            className="text-[#0055FF] font-normal text-[13px] hover:underline flex items-center gap-1 mt-6 self-start"
          >
            Know More <span className="text-[12px] font-medium">&gt;</span>
          </button>
        </div>

        {/* Finance Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-[24px] p-6 shadow-sm flex flex-col justify-between min-h-[300px]">
          <div>
            {/* Logo Section */}
            <div className="flex items-center h-[52px]">
              <img src="/finance_logo.png" alt="Finance Logo" className="h-[48px] w-auto object-contain" />
            </div>

            {/* Main Stats */}
            <div className="mt-4">
              <span className="text-[#888D96] text-[13px] font-normal block tracking-tight">Raised Invoices in last 7 days</span>
              <span className="text-black font-extrabold text-[32px] block mt-1 leading-none">{raisedInvoicesLast7Days}</span>
              <span className="text-[13px] mt-2 block">
                <span className="text-[#0055FF] font-extrabold">{propertiesIncludedCount} Properties</span>{" "}
                <span className="text-[#555] font-bold">Included</span>
              </span>
            </div>

            {/* Grid Metrics */}
            <div className="mt-5">
              {/* Labels Row */}
              <div className="grid grid-cols-3 gap-2">
                <span className="text-[#888D96] text-[13px] font-normal leading-tight block">Bookings</span>
                <span className="text-[#888D96] text-[13px] font-normal leading-tight block">Transactions</span>
                <span className="text-[#888D96] text-[13px] font-normal leading-tight block">Reimbursements</span>
              </div>
              {/* Values Row */}
              <div className="grid grid-cols-3 gap-2 mt-1">
                <span className="text-black font-bold text-[18px] block">{bookingsCount}</span>
                <span className="text-black font-bold text-[18px] block">{transactionsCount}</span>
                <span className="text-black font-bold text-[18px] block">{reimbursementsCount}</span>
              </div>
            </div>
          </div>

          {/* Action */}
          <button 
            onClick={() => navigateToModule("FINANCE", "/dashboard/finance?tab=dashboard")}
            className="text-[#0055FF] font-normal text-[13px] hover:underline flex items-center gap-1 mt-6 self-start"
          >
            Know More <span className="text-[12px] font-medium">&gt;</span>
          </button>
        </div>

      </div>
    </div>
  );
}

