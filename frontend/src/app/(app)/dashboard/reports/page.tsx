"use client";

import React, { Suspense, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useDialog } from "@/components/ui/DialogProvider";
import { useSearchParams, useRouter } from "next/navigation";
import { Download, Megaphone, Users, UserCog, AlertTriangle, Clock } from "lucide-react";
import DateRangeFilter, { DateRange } from "@/components/reports/DateRangeFilter";
import MarketingReports from "@/components/reports/MarketingReports";
import ManagerReports from "@/components/reports/ManagerReports";
import AgentReports from "@/components/reports/AgentReports";
import { todayIso, toIsoDate } from "@/components/ui/DateRangePicker";
import { maskPhone, maskEmail } from "@/lib/maskPII";
import { apiListAllLeads, apiUpdateMyEodReportTime } from "@/lib/apiClient";

const MAIN_TABS = [
  { key: "marketing", label: "Marketing Reports", icon: Megaphone },
  { key: "manager", label: "Manager Reports", icon: Users },
  { key: "agent", label: "Sales Agent Reports", icon: UserCog }
] as const;

function todayStr(): string {
  return todayIso();
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toIsoDate(d);
}

function ReportsPageContent() {
  const { currentUser, activeRole, isDataLoading, dataLoadError, triggerManualRefresh, tenantSettings, updateTenantSettings } = useApp();
  const { toast } = useDialog();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdmin = activeRole === "ADMIN";
  const isManager = !isAdmin && currentUser?.role_type === "Manager";

  // Marketing spend/CPL/campaign data and other managers' team performance
  // aren't a Manager's or Member's concern — hide both tabs entirely for
  // non-admins, and don't let a direct ?tab=marketing/?tab=manager URL
  // bypass that (defense in depth, not just hidden buttons —
  // ManagerReports.tsx also independently scopes its own data server-role-side).
  const visibleTabs = isAdmin ? MAIN_TABS : MAIN_TABS.filter(t => t.key === "agent");

  const requestedTab = (searchParams.get("tab") as (typeof MAIN_TABS)[number]["key"]) || "marketing";
  const activeTab = visibleTabs.some(t => t.key === requestedTab) ? requestedTab : visibleTabs[0].key;

  const [dateRange, setDateRange] = useState<DateRange>({ from: daysAgo(30), to: todayStr() });

  const handleTabChange = (tabKey: string) => {
    router.push(`/dashboard/reports?tab=${tabKey}`);
  };

  const [exportingCSV, setExportingCSV] = useState(false);
  const handleExportCSV = async () => {
    if (exportingCSV) return;
    setExportingCSV(true);
    try {
      // Every matching lead, unfiltered/company-wide — same as before this
      // button moved off the bulk array; the on-screen Date Range picker is
      // cosmetic to this export, not a filter (a pre-existing gap, not this
      // migration's job to fix).
      const leads = await apiListAllLeads();
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "ID,Name,Phone,Email,Status,Assigned Agent,Property,Assigned At,First Response At\n";
      leads.forEach(l => {
        const phone = isAdmin ? l.phone : maskPhone(l.phone);
        const email = isAdmin ? (l.email || "") : maskEmail(l.email || "");
        csvContent += `"${l.id}","${l.name}","${phone}","${email}","${l.status_label}","${l.assigned_agent_name}","${l.property_name || "N/A"}","${l.assigned_at || ""}","${l.first_response_at || ""}"\n`;
      });
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `taskezy_leads_report_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setExportingCSV(false);
    }
  };

  // Admin's company-wide default EOD report time (Sales Agent Reports tab) —
  // bound to tenantSettings, same read/save pattern as every other
  // tenant-settings field elsewhere in the app.
  const [eodTimeInput, setEodTimeInput] = useState("");
  const [savingEodTime, setSavingEodTime] = useState(false);
  const handleSaveEodTime = async () => {
    if (!eodTimeInput || savingEodTime) return;
    setSavingEodTime(true);
    const result = await updateTenantSettings({ eodReportTime: eodTimeInput });
    setSavingEodTime(false);
    if (result.success) toast("Company default EOD report time saved.", "success");
    else toast(result.error || "Could not save the EOD report time. Please try again.", "error");
  };

  // Manager's own override for their team's EOD time — write-only (no
  // pre-fill from the current value, keeping this a small, self-contained
  // control instead of threading a new field through the User model/login
  // response just to echo it back).
  const [managerEodTimeInput, setManagerEodTimeInput] = useState("");
  const [savingManagerEodTime, setSavingManagerEodTime] = useState(false);
  const handleSaveManagerEodTime = async () => {
    if (!managerEodTimeInput || savingManagerEodTime) return;
    setSavingManagerEodTime(true);
    try {
      await apiUpdateMyEodReportTime(managerEodTimeInput);
      toast("Your team's EOD report time saved.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save the EOD report time. Please try again.", "error");
    } finally {
      setSavingManagerEodTime(false);
    }
  };

  return (
    <div className="space-y-4 pb-12 animate-fade-in">
      {/* Main section tabs — same segmented pill switcher as the Leads and
          Campaigns tab toggles (bg-slate-200/70 track, bg-white active pill),
          not a standalone page title: the top bar already shows "Reports". */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="ui-toggle overflow-x-auto max-w-full">
          {visibleTabs.map(t => (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              className={`ui-toggle-item shrink-0 ${activeTab === t.key ? "ui-toggle-item-active" : ""}`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
        {/* Shared date-range filter — every report is generated for this selected window */}
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
        {/* Bulk lead export (incl. phone/email) is an Admin-only capability —
            Manager/Member never get a raw CSV of leads beyond their own scope. */}
        {isAdmin && (
          <button
            onClick={handleExportCSV}
            disabled={exportingCSV}
            className="ui-btn ui-btn-primary shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            {exportingCSV ? "Exporting…" : "Export Leads CSV"}
          </button>
        )}
        {/* End of Day report time — Admin sets the company-wide default,
            Manager sets their own team's override. Only on the Sales Agent
            Reports tab, since that's what these notifications are about. */}
        {activeTab === "agent" && isAdmin && (
          <div className="inline-flex items-center gap-1.5 bg-white border border-slate-300/80 rounded-xl px-3 h-9 shadow-2xs" title="Company-wide default time agents get their 'calls made today' notification">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[11px] font-bold text-slate-500">EOD Time</span>
            <input
              type="time"
              value={eodTimeInput || tenantSettings?.eodReportTime?.slice(0, 5) || ""}
              onChange={(e) => setEodTimeInput(e.target.value)}
              className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveEodTime}
              disabled={!eodTimeInput || savingEodTime}
              className="text-[11px] font-bold text-[#0B1E6E] hover:underline disabled:opacity-40 disabled:no-underline"
            >
              {savingEodTime ? "Saving…" : "Save"}
            </button>
          </div>
        )}
        {activeTab === "agent" && isManager && (
          <div className="inline-flex items-center gap-1.5 bg-white border border-slate-300/80 rounded-xl px-3 h-9 shadow-2xs" title="Your own override for when your team's EOD report arrives — leave unset to use the company default">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[11px] font-bold text-slate-500">Your Team&apos;s EOD Time</span>
            <input
              type="time"
              value={managerEodTimeInput}
              onChange={(e) => setManagerEodTimeInput(e.target.value)}
              className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveManagerEodTime}
              disabled={!managerEodTimeInput || savingManagerEodTime}
              className="text-[11px] font-bold text-[#0B1E6E] hover:underline disabled:opacity-40 disabled:no-underline"
            >
              {savingManagerEodTime ? "Saving…" : "Save"}
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Every report below is driven entirely by AppContext's single bulk
          data load (leads/adSpend/properties) — there's no per-report fetch
          of its own. A failed load there must not look like a genuinely
          empty reporting period, so it gets the same distinct error+retry
          treatment as the other pages' own fetch effects, just sourced from
          the shared dataLoadError flag instead of a local one. */}
      {dataLoadError && !isDataLoading ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center border border-dashed border-slate-200 rounded-2xl bg-white">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <p className="text-xs font-semibold text-slate-600">Couldn&apos;t load report data.</p>
          <button
            type="button"
            onClick={triggerManualRefresh}
            className="ui-btn ui-btn-primary"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {activeTab === "marketing" && <MarketingReports dateRange={dateRange} />}
          {activeTab === "manager" && <ManagerReports dateRange={dateRange} />}
          {activeTab === "agent" && <AgentReports dateRange={dateRange} />}
        </>
      )}
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
