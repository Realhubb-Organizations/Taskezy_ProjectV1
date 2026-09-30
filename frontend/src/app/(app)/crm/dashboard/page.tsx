"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useApp, Lead } from "@/context/AppContext";
import AddLeadModal from "@/components/crm/AddLeadModal";
import LeadDrillDownPanel, { LeadQuickViewDrawer, useLeadStatusChange } from "@/components/crm/LeadDrillDownPanel";
import TeamTasksTable, { TeamTaskTab } from "@/components/dashboard/TeamTasksTable";
import TaskInsightsCharts from "@/components/dashboard/TaskInsightsCharts";
import SalesPendingTasksTable from "@/components/dashboard/SalesPendingTasksTable";
import { computeLeadSummaryStats } from "@/lib/leadSummaryStats";
import { ChevronDown, Plus, CheckCircle } from "lucide-react";
import { LineSkeleton } from "@/components/ui/Skeletons";
import DateRangeSelect from "@/components/ui/DateRangeSelect";
import { DateRangeValue, toIsoDate } from "@/components/ui/DateRangePicker";

// CRM's own overview — moved out of the old bare /dashboard route (which
// branched its content by department/activeSystem, so the same URL showed a
// different page depending on runtime state, and was also registered as the
// CRM sidebar group's own "Dashboard" item — force-expanding CRM any time
// this rendered, even for users who weren't in CRM at all) into its own
// real path, alongside /hrms/dashboard and /finance/dashboard.
export default function CrmDashboardPage() {
  const { leads, properties, users, currentUser, addLead, followupCalls, isDataLoading } = useApp();

  const [dateRange, setDateRange] = useState<"today" | "yesterday" | "week" | "month" | "all" | "custom">("today");
  // The range picked via the Date Range dropdown's "Custom" option.
  const [customRange, setCustomRange] = useState<DateRangeValue | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  // Shared by the team tasks table and the charts under it, so both show the same tab.
  const [teamTaskTab, setTeamTaskTab] = useState<TeamTaskTab>("all");
  const [uploadMsg, setUploadMsg] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [quickViewLead, setQuickViewLead] = useState<Lead | null>(null);

  // Presets only — DateRangeSelect appends "Custom" itself.
  const DATE_RANGE_OPTIONS: { value: typeof dateRange; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "week", label: "This Week" },
    { value: "month", label: "This Month" },
    { value: "all", label: "All Time" }
  ];

  const dateInRange = (dateStr: string | undefined, range: typeof dateRange, refNow: Date): boolean => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    if (range === "all") return true;
    if (range === "custom") {
      if (!customRange) return true;
      const day = toIsoDate(d);
      return day >= customRange.start && day <= customRange.end;
    }
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

  const isSalesMember = currentUser?.role_type === "Member" && currentUser?.role !== "ADMIN";

  // "View Detailed Analytics" — links to the real Leads Analytics tab on the
  // Leads page (LeadDashboard.tsx's canViewLeadsAnalytics, which is Admin or
  // Manager). A sales agent (Member) has no lead-analytics page at all, so
  // the link is hidden for them entirely rather than pointing somewhere
  // that isn't actually theirs.
  const canViewLeadAnalytics = currentUser?.role === "ADMIN" || currentUser?.role_type === "Manager";

  const scopedLeads = leads.filter(l => {
    if (isSalesMember) {
      return l.assignedAgent.toLowerCase() === currentUser?.name.toLowerCase();
    }
    return true;
  });

  const now = new Date();
  // Every card below now respects Date Range — including RNR/Call Backs/
  // Follow Ups/Site Visit Scheduled/Site Visit Done, which used to
  // deliberately stay all-time live-pipeline snapshots (a lead created
  // last week that's marked RNR today would used to still count; it won't
  // now unless it was also created within the selected range). The user
  // explicitly chose full Date Range reactivity across every admin CRM
  // page over that older behavior. computeLeadSummaryStats is the single
  // shared source for these 7 predicates — the admin Leads page and the
  // Campaigns page's top bar call the exact same function, so a same-
  // named card can never drift into a different real number per page.
  const rangeLeads = scopedLeads.filter(l => dateInRange(l.createdAtStr, dateRange, now));
  const stats = computeLeadSummaryStats(scopedLeads, l => dateInRange(l.createdAtStr, dateRange, now));

  // Each card's real underlying lead list — same predicates
  // computeLeadSummaryStats uses — so clicking a card can drill into
  // exactly what it counted.
  const categoryLeads: Record<string, Lead[]> = {
    "Total Leads": rangeLeads,
    "New Leads": rangeLeads.filter(l => l.status === "New Lead"),
    "RNR": rangeLeads.filter(l => l.status === "RNR"),
    "Call Backs": rangeLeads.filter(l => l.status === "Call Back"),
    "Follow Ups": rangeLeads.filter(l => l.status === "Follow-ups"),
    "Site Visit Scheduled": rangeLeads.filter(l => l.status === "Visit Schedule"),
    "Site Visit Done": rangeLeads.filter(l => l.status === "Site Visit")
  };

  const statCards: { label: string; value: number; color: string }[] = [
    { label: "Total Leads", value: stats.totalLeads, color: "text-slate-900" },
    { label: "New Leads", value: stats.newLeads, color: "text-[#0084FF]" },
    { label: "RNR", value: stats.rnr, color: "text-[#FF0000]" },
    { label: "Call Backs", value: stats.callBacks, color: "text-[#FF8C00]" },
    { label: "Follow Ups", value: stats.followUps, color: "text-[#0084FF]" },
    { label: "Site Visit Scheduled", value: stats.siteVisitScheduled, color: "text-[#FF0000]" },
    { label: "Site Visit Done", value: stats.siteVisitDone, color: "text-[#015814]" }
  ];

  // Pending Follow ups/Call Backs rows only carry a summary shape
  // (PendingRow), not the full Lead the quick-view needs — look the real
  // record up by id from the same `leads` list everything else here reads.
  const openQuickView = (leadId: string) => {
    const found = leads.find(l => l.id === leadId);
    if (found) setQuickViewLead(found);
  };

  // Used by the sales Pending Tasks table's row status editor — same
  // Booking deal-value guard as the drill-down/quick-view status menus.
  const handleDrillStatusChange = useLeadStatusChange();

  // Real sales roster + property list, same source the Leads page's Add Lead
  // modal already uses — reused here so "+ Upload Leads" is a real, working
  // entry point rather than a second, divergent implementation.
  const propertiesList = properties.map(p => p.name);
  const agentsList = users.filter(u => u.department === "SALES" && u.status !== "INACTIVE").map(u => u.name);
  // Chart agent filters — the active roster plus anyone still holding leads
  // (e.g. a deactivated agent whose leads haven't been reassigned yet).
  const chartAgents = Array.from(new Set([...agentsList, ...scopedLeads.map(l => l.assignedAgent).filter(Boolean)])).sort();

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

  return (
    <div className="space-y-4 pb-8 animate-fade-in">
      {/* No in-page title here — the shared app header above already shows
          "Dashboard" for this route, so repeating it as a page heading was
          just duplication. */}
      <div className="flex justify-end">
        <button
          onClick={() => setIsUploadOpen(true)}
          className="inline-flex items-center gap-1.5 bg-[#0B0447] hover:opacity-90 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-md shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          Upload Leads
        </button>
      </div>

      {uploadMsg && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-100 text-[11px] text-emerald-700 rounded-xl font-bold flex items-center gap-2 animate-fade-in shadow-sm">
          <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span>{uploadMsg}</span>
        </div>
      )}

      {/* Date Filter & Metrics — one unified card: a header bar (date range +
          drill-down link) sitting directly on top of the stat columns,
          separated by dividers rather than floating as separate shadowed
          cards with gaps between them. */}
      <div className="bg-slate-100/70 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
        {/* Header bar */}
        <div className="flex justify-between items-center px-4 py-2.5 text-[11px] border-b border-slate-200/60">
          <div className="flex items-center gap-1.5 font-bold text-slate-700">
            <span className="font-normal text-slate-500">Date Range</span>
            <DateRangeSelect
              options={DATE_RANGE_OPTIONS}
              value={dateRange}
              customValue="custom"
              customRange={customRange}
              onPresetChange={(v) => { setDateRange(v); setCustomRange(null); }}
              onCustomApply={(r) => { setCustomRange(r); setDateRange("custom"); }}
            />
          </div>
          {canViewLeadAnalytics && (
            <Link href="/dashboard/crm?tab=analytics" className="text-blue-600 font-extrabold hover:underline">
              View Detailed Analytics
            </Link>
          )}
        </div>

        {/* Stat columns — the CRM funnel snapshot for the selected date range.
            Clicking a column drills into its real leads in the table below,
            instead of navigating away to the Leads page. */}
        <div className="flex md:grid md:grid-cols-7 bg-white divide-x divide-slate-100 overflow-x-auto min-w-full">
          {statCards.map((s) => {
            const isActive = selectedCategory === s.label;
            return (
              <button
                key={s.label}
                onClick={() => setSelectedCategory(prev => (prev === s.label ? null : s.label))}
                className={`p-3 flex flex-col justify-between min-h-[70px] min-w-[110px] md:min-w-0 flex-1 text-left group transition-colors ${
                  isActive ? "bg-blue-50/70" : "hover:bg-slate-50/50"
                }`}
              >
                <span className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                  {s.label}
                  <ChevronDown className={`h-3 w-3 text-slate-300 shrink-0 transition-transform ${isActive ? "rotate-180 text-blue-500" : ""}`} />
                </span>
                <span className={`text-lg font-extrabold block mt-1.5 ${s.color}`}>
                  {isDataLoading ? <LineSkeleton width={32} height={18} /> : s.value}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <LeadDrillDownPanel
        title={selectedCategory}
        leads={selectedCategory ? categoryLeads[selectedCategory] : []}
        onClose={() => setSelectedCategory(null)}
      />

      {isSalesMember ? (
        // Sales agent: one color-coded Pending Tasks queue (missed / pending /
        // upcoming) in place of the two per-status tables below. followupCalls
        // is already scoped server-side to the agent's own calls.
        <SalesPendingTasksTable
          leads={scopedLeads}
          followupCalls={followupCalls}
          onViewLead={openQuickView}
          onStatusChange={handleDrillStatusChange}
          isLoading={isDataLoading}
        />
      ) : (
        // Admin / Manager: team-wide task counts per agent (All Task /
        // Pending Task), then the same open tasks charted by due date and
        // by task type.
        <>
          <TeamTasksTable leads={scopedLeads} followupCalls={followupCalls} teamMembers={agentsList} tab={teamTaskTab} onTabChange={setTeamTaskTab} isLoading={isDataLoading} />
          <TaskInsightsCharts leads={scopedLeads} followupCalls={followupCalls} agents={chartAgents} tab={teamTaskTab} />
        </>
      )}

      <AddLeadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSubmitManual={handleUploadManualLead}
        onSubmitBulk={handleUploadBulkLeads}
        agentsList={agentsList}
        propertiesList={propertiesList}
      />

      {/* Lead quick-view for the sales Pending Tasks table above (the
          drill-down panel opens its own). */}
      {quickViewLead && (
        <LeadQuickViewDrawer lead={quickViewLead} onLeadChange={setQuickViewLead} onClose={() => setQuickViewLead(null)} />
      )}
    </div>
  );
}
