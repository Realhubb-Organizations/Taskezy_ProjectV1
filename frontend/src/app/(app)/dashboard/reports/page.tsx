"use client";

import React, { Suspense, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useDialog } from "@/components/ui/DialogProvider";
import { useSearchParams, useRouter } from "next/navigation";
import { AlertTriangle, Clock } from "lucide-react";
import DateRangeFilter, { DateRange } from "@/components/reports/DateRangeFilter";
import MarketingReports from "@/components/reports/MarketingReports";
import ManagerReports from "@/components/reports/ManagerReports";
import TeamReports from "@/components/reports/TeamReports";
import { todayIso, toIsoDate } from "@/components/ui/DateRangePicker";
import { apiUpdateMyEodReportTime } from "@/lib/apiClient";

const MAIN_TABS = [
  { key: "agent", label: "Team Reports" },
  { key: "manager", label: "Manager Reports" },
  { key: "marketing", label: "Marketing Reports" }
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
  // Deep-linked from a MISSED_SLA escalation/digest notification naming one
  // specific agent (see Taskezy-Server/src/jobs/missedLeadScheduler.ts) —
  // read once; TeamReports pre-picks that salesperson on mount and the user
  // can still change the pick afterward.
  const initialAgentId = searchParams.get("agentId") || undefined;

  const [dateRange, setDateRange] = useState<DateRange>({ from: daysAgo(30), to: todayStr() });

  const handleTabChange = (tabKey: string) => {
    router.push(`/dashboard/reports?tab=${tabKey}`);
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

  // The whole EOD Time box opens its time picker, not just the time text.
  const openTimePicker = (e: React.MouseEvent<HTMLDivElement>) => {
    const input = e.currentTarget.querySelector<HTMLInputElement>('input[type="time"]');
    if (!input) return;
    input.focus();
    try { input.showPicker(); } catch { /* already open, or not supported — focus is enough */ }
  };

  return (
    <div className="space-y-4 pb-12 animate-fade-in">
      {/* Main section tabs — plain text tabs, the active one underlined
          (the top bar already shows "Reports"). */}
      {/* The tabs stay pinned at the top (Marketing and Team Reports pin their
          filter row below them too) while the rest scrolls — desktop only. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:sticky md:-top-6 lg:-top-8 md:z-30 md:h-12 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 md:-mt-6 lg:-mt-8 md:pt-4 md:bg-[#FCFDFE]">
        <div className="flex items-center gap-6 sm:gap-8 overflow-x-auto max-w-full">
          {visibleTabs.map(t => (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              className={`shrink-0 pb-1.5 text-[13px] font-semibold border-b-2 transition-colors ${
                activeTab === t.key ? "border-[#1E3A8A] text-[#1E3A8A]" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
        {/* Shared date-range filter — every report is generated for this selected window */}
        {/* Marketing and Team Reports have their own Date Range in their filter row */}
        {activeTab === "manager" && <DateRangeFilter value={dateRange} onChange={setDateRange} />}
        {/* End of Day report time — Admin sets the company-wide default,
            Manager sets their own team's override. Only on the Sales Agent
            Reports tab, since that's what these notifications are about. */}
        {activeTab === "agent" && isAdmin && (
          <div onClick={openTimePicker} className="inline-flex items-center gap-1.5 bg-white border border-slate-300/80 rounded-xl px-3 h-9 shadow-2xs cursor-pointer hover:bg-slate-50 transition-colors" title="Company-wide default time agents get their 'calls made today' notification">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">EOD Time</span>
            <input
              type="time"
              value={eodTimeInput || tenantSettings?.eodReportTime?.slice(0, 5) || ""}
              onChange={(e) => setEodTimeInput(e.target.value)}
              className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleSaveEodTime(); }}
              disabled={!eodTimeInput || savingEodTime}
              className="text-[11px] font-bold text-[#0B1E6E] hover:underline disabled:opacity-40 disabled:no-underline"
            >
              {savingEodTime ? "Saving…" : "Save"}
            </button>
          </div>
        )}
        {activeTab === "agent" && isManager && (
          <div onClick={openTimePicker} className="inline-flex items-center gap-1.5 bg-white border border-slate-300/80 rounded-xl px-3 h-9 shadow-2xs cursor-pointer hover:bg-slate-50 transition-colors" title="Your own override for when your team's EOD report arrives — leave unset to use the company default">
            <Clock className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">Your Team&apos;s EOD Time</span>
            <input
              type="time"
              value={managerEodTimeInput}
              onChange={(e) => setManagerEodTimeInput(e.target.value)}
              className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-none cursor-pointer"
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleSaveManagerEodTime(); }}
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
          {activeTab === "marketing" && <MarketingReports dateRange={dateRange} onDateRangeChange={setDateRange} />}
          {activeTab === "manager" && <ManagerReports dateRange={dateRange} />}
          {activeTab === "agent" && <TeamReports dateRange={dateRange} onDateRangeChange={setDateRange} initialAgentId={initialAgentId} />}
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
