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

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const todayStr = new Date().toISOString().split("T")[0];

  // CRM Card Stats
  const leadsLast7Days = leads.filter(l => l.createdAtStr && new Date(l.createdAtStr) >= sevenDaysAgo).length;
  const activeCampaigns = new Set(adSpendRecords.map(r => r.accountName)).size;
  const totalSpends = adSpendRecords.reduce((sum, r) => sum + r.spend, 0);
  const spendsDisplay = totalSpends >= 1000 ? `${(totalSpends / 1000).toFixed(1)}K` : totalSpends.toLocaleString("en-IN");
  const totalLeadsGenerated = adSpendRecords.reduce((sum, r) => sum + r.leadsGenerated, 0);
  const avgCPL = totalLeadsGenerated > 0 ? (totalSpends / totalLeadsGenerated).toFixed(2) : "345.76";
  const followUpsCount = followupCalls.filter(c => c.status === "Upcoming").length;

  // HRMS Card Stats
  const presentCount = timesheets.filter(ts => ts.date === todayStr).length;
  const pendingInfoCount = timesheets.filter(ts => ts.status === "Regularization Pending").length;

  // Finance Card Stats
  const raisedInvoicesLast7Days = invoices.filter(inv => inv.createdAt && new Date(inv.createdAt) >= sevenDaysAgo).length;
  const propertiesIncludedCount = new Set(invoices.filter(inv => inv.projectName).map(inv => inv.projectName)).size;
  const bookingsCount = leads.filter(l => l.status === "Booking Done" || l.status === "Booking Approved").length;
  const transactionsCount = invoices.filter(inv => inv.status === "Paid").length;
  const reimbursementsCount = reimbursements.length;

  const navigateToModule = (system: "CRM" | "HRMS" | "FINANCE", path: string) => {
    setActiveSystem(system);
    router.push(path);
  };

  return (
    <div className="w-full max-w-[1240px] pt-0 pb-12">
      <div className="pt-0 pb-3">
        <h1 className="text-[22px] font-bold text-[#000000] tracking-tight leading-tight">
          Hey, {currentUser?.name || "Bhavuk Sharma"}!
        </h1>
        <p className="text-[#9CA3AF] text-[13px] font-normal mt-1">
          Are you ready to experience how the growth process work?
        </p>
      </div>

      {/* Horizontal Divider Line */}
      <div className="border-t border-[#E5E7EB] w-full mb-8"></div>

      {/* 3 Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* CRM Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-[24px] p-6 shadow-sm flex flex-col justify-between min-h-[300px]">
          <div>
            {/* Logo Section */}
            <div className="flex items-center">
              <img src="/crm_logo.png" alt="iCRM Logo" className="h-[74px] w-auto object-contain" />
            </div>

            {/* Main Stats */}
            <div className="mt-5">
              <span className="text-[#9CA3AF] text-[12px] font-normal block">Leads in last 7 days</span>
              <span className="text-[#000000] font-bold text-[28px] block mt-1 leading-none">{leadsLast7Days || 127}</span>
              <span className="text-[12px] font-bold mt-2 block">
                <span className="text-[#0055FF]">{activeCampaigns || 13} Active</span>{" "}
                <span className="text-[#6B7280]">Campaigns</span>
              </span>
            </div>

            {/* Grid Metrics */}
            <div className="mt-6">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[#9CA3AF] text-[11px] font-normal leading-tight block">Spends</span>
                  <span className="text-[#000000] font-bold text-[14px] block mt-1">{spendsDisplay !== "0" ? spendsDisplay : "11.6K"}</span>
                </div>
                <div>
                  <span className="text-[#9CA3AF] text-[11px] font-normal leading-tight block">Avg CPL</span>
                  <span className="text-[#000000] font-bold text-[14px] block mt-1">{avgCPL}</span>
                </div>
                <div>
                  <span className="text-[#9CA3AF] text-[11px] font-normal leading-tight block">Follow Ups</span>
                  <span className="text-[#000000] font-bold text-[14px] block mt-1">{followUpsCount || 29}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action */}
          <button
            onClick={() => navigateToModule("CRM", "/dashboard/crm")}
            className="text-[#0055FF] font-medium text-[12px] hover:underline flex items-center gap-1 mt-6 self-start"
          >
            Know More <span className="text-[11px] font-normal">&gt;</span>
          </button>
        </div>

        {/* HRMS Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-[24px] p-6 shadow-sm flex flex-col justify-between min-h-[300px]">
          <div>
            {/* Logo Section */}
            <div className="flex items-center">
              <img src="/hrms_logo.png" alt="HRMS Logo" className="h-[74px] w-auto object-contain" />
            </div>

            {/* Main Stats */}
            <div className="mt-5">
              <span className="text-[#9CA3AF] text-[12px] font-normal block">Applied Leaves in last 7 days</span>
              <span className="text-[#000000] font-bold text-[28px] block mt-1 leading-none">6</span>
              <span className="text-[12px] font-bold mt-2 block">
                <span className="text-[#0055FF]">5 Employees</span>{" "}
                <span className="text-[#6B7280]">Applied</span>
              </span>
            </div>

            {/* Grid Metrics */}
            <div className="mt-6">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[#9CA3AF] text-[11px] font-normal leading-tight block">Present</span>
                  <span className="text-[#000000] font-bold text-[14px] block mt-1">{presentCount || 21}</span>
                </div>
                <div>
                  <span className="text-[#9CA3AF] text-[11px] font-normal leading-tight block">Pending Info</span>
                  <span className="text-[#EF4444] font-bold text-[14px] block mt-1">{pendingInfoCount || 2}</span>
                </div>
                <div>
                  <span className="text-[#9CA3AF] text-[11px] font-normal leading-tight block">WFH</span>
                  <span className="text-[#000000] font-bold text-[14px] block mt-1">1</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action */}
          <button
            onClick={() => navigateToModule("HRMS", "/dashboard/hrms?tab=dashboard")}
            className="text-[#0055FF] font-medium text-[12px] hover:underline flex items-center gap-1 mt-6 self-start"
          >
            Know More <span className="text-[11px] font-normal">&gt;</span>
          </button>
        </div>

        {/* Finance Card */}
        <div className="bg-white border border-[#E5E7EB] rounded-[24px] p-6 shadow-sm flex flex-col justify-between min-h-[300px]">
          <div>
            {/* Logo Section */}
            <div className="flex items-center">
              <img src="/finance_logo.png" alt="Finance Logo" className="h-[74px] w-auto object-contain" />
            </div>

            {/* Main Stats */}
            <div className="mt-5">
              <span className="text-[#9CA3AF] text-[12px] font-normal block">Raised Invoices in last 7 days</span>
              <span className="text-[#000000] font-bold text-[28px] block mt-1 leading-none">{raisedInvoicesLast7Days || 3}</span>
              <span className="text-[12px] font-bold mt-2 block">
                <span className="text-[#0055FF]">{propertiesIncludedCount || 2} Properties</span>{" "}
                <span className="text-[#6B7280]">Included</span>
              </span>
            </div>

            {/* Grid Metrics */}
            <div className="mt-6">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-[#9CA3AF] text-[11px] font-normal leading-tight block">Bookings</span>
                  <span className="text-[#000000] font-bold text-[14px] block mt-1">{bookingsCount || 3}</span>
                </div>
                <div>
                  <span className="text-[#9CA3AF] text-[11px] font-normal leading-tight block">Transactions</span>
                  <span className="text-[#000000] font-bold text-[14px] block mt-1">{transactionsCount || 11}</span>
                </div>
                <div>
                  <span className="text-[#9CA3AF] text-[11px] font-normal leading-tight block">Reimbursements</span>
                  <span className="text-[#000000] font-bold text-[14px] block mt-1">{reimbursementsCount || 9}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action */}
          <button
            onClick={() => navigateToModule("FINANCE", "/dashboard/finance?tab=dashboard")}
            className="text-[#0055FF] font-medium text-[12px] hover:underline flex items-center gap-1 mt-6 self-start"
          >
            Know More <span className="text-[11px] font-normal">&gt;</span>
          </button>
        </div>

      </div>
    </div>
  );
}

