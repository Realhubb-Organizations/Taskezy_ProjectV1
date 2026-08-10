"use client";

import React, { Suspense, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useSearchParams, useRouter } from "next/navigation";
import { BarChart, Download, Megaphone, Users, UserCog } from "lucide-react";
import DateRangeFilter, { DateRange } from "@/components/reports/DateRangeFilter";
import MarketingReports from "@/components/reports/MarketingReports";
import ManagerReports from "@/components/reports/ManagerReports";
import AgentReports from "@/components/reports/AgentReports";

const MAIN_TABS = [
  { key: "marketing", label: "Marketing Reports", icon: Megaphone },
  { key: "manager", label: "Manager Reports", icon: Users },
  { key: "agent", label: "Sales Agent Reports", icon: UserCog }
] as const;

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function ReportsPageContent() {
  const { leads, currentUser } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Marketing spend/CPL/campaign data isn't a sales agent's concern — hide
  // the tab entirely for a Member, and don't let a direct ?tab=marketing
  // URL bypass that (defense in depth, not just a hidden button).
  const isSalesMember = currentUser?.role === "AGENT" && currentUser?.role_type === "Member";
  const visibleTabs = isSalesMember ? MAIN_TABS.filter(t => t.key !== "marketing") : MAIN_TABS;

  const requestedTab = (searchParams.get("tab") as (typeof MAIN_TABS)[number]["key"]) || "marketing";
  const activeTab = visibleTabs.some(t => t.key === requestedTab) ? requestedTab : visibleTabs[0].key;

  const [dateRange, setDateRange] = useState<DateRange>({ from: daysAgo(30), to: todayStr() });

  const handleTabChange = (tabKey: string) => {
    router.push(`/dashboard/reports?tab=${tabKey}`);
  };

  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Name,Phone,Email,Status,Assigned Agent,Property,Assigned At,First Response At\n";
    leads.forEach(l => {
      csvContent += `"${l.id}","${l.name}","${l.phone}","${l.email}","${l.status}","${l.assignedAgent}","${l.property || "N/A"}","${l.assignedAt || ""}","${l.firstResponseAt || ""}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `taskezy_leads_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Title Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
            <BarChart className="h-5.5 w-5.5 text-brand-600" />
            Platform Analytics &amp; Reports
          </h2>
          <p className="text-xs text-slate-500">
            Micro-management telemetry across marketing spend, manager pipelines, and individual agent performance.
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-1.5 bg-brand-700 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-md shadow-brand-700/10 shrink-0"
        >
          <Download className="h-4 w-4" />
          Export Leads CSV
        </button>
      </div>

      {/* Main section tabs */}
      <div className="flex flex-wrap gap-2">
        {visibleTabs.map(t => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === t.key ? "bg-brand-700 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-500 hover:text-slate-700"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Shared date-range filter — every report is generated for this selected window */}
      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      {activeTab === "marketing" && <MarketingReports dateRange={dateRange} />}
      {activeTab === "manager" && <ManagerReports dateRange={dateRange} />}
      {activeTab === "agent" && <AgentReports dateRange={dateRange} />}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh] flex items-center justify-center text-xs font-bold text-slate-400">Loading reports portal...</div>}>
      <ReportsPageContent />
    </Suspense>
  );
}
