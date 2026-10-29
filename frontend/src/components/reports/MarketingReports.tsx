"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, FileText, Home, Users } from "lucide-react";
import ProjectReportTable, { type ProjectReportColumn } from "./ProjectReportTable";
import LeadDrillDownPanel from "@/components/crm/LeadDrillDownPanel";
import { useApp } from "@/context/AppContext";
import { DateRange } from "./DateRangeFilter";
import DateRangePicker from "@/components/ui/DateRangePicker";
import { SearchableMultiSelect } from "@/components/ui/SearchableDropdown";
import { PlatformLabel } from "@/components/icons/ContactIcons";
import TablePagination, { usePagination } from "@/components/ui/TablePagination";
import { LineSkeleton } from "@/components/ui/Skeletons";
import { formatCurrency } from "@/lib/reportMetrics";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import {
  apiGetDistinctCampaigns,
  apiGetMarketingProjectStats,
  type LeadListFilters,
  type MarketingProjectRow,
  type MarketingProjectStats,
  type MarketingSiteVisitRow,
  type MarketingSource
} from "@/lib/apiClient";

// Reports → Marketing tab. One set of filters (Campaigns / Date Range /
// Property / Team / Source) drives both the KPI cards and the Project-wise
// Lead Report — all counted from the CRM's own leads, with ad spend for the
// same campaigns/properties/platforms (Taskezy-Server ad-spend.routes.ts
// /marketing-project-stats). Team narrows leads only; ads have no agent.

const NOT_SET = "Not set";
const SOURCE_OPTIONS: { value: MarketingSource; label: string }[] = [
  { value: "META", label: "Meta" },
  { value: "GOOGLE", label: "Google" },
  { value: "DATA", label: "Data" }
];

// Same "qualified" statuses as the server (ad-spend.routes.ts BUYER_CODES).
const QUALIFIED_CODES = ["CALL_BACK", "FOLLOWUP", "EOI", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "BOOKED"];

const ZERO_STATS: MarketingProjectStats = {
  kpis: { activeCampaigns: 0, totalLeads: 0, qualified: 0, rnr: 0, followUps: 0, callBacks: 0, siteVisits: 0 },
  activeCampaignList: [],
  byProject: [],
  siteVisitsByProject: []
};

const formatCpl = (spend: number, leads: number) =>
  leads > 0 ? `₹${(spend / leads).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
const formatPercent = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

// Project-wise Lead Report — usual columns first; `extra` ones start hidden.
const LEAD_REPORT_COLUMNS: ProjectReportColumn<MarketingProjectRow>[] = [
  { key: "spend", label: "Amount Spend", render: r => (r.spend > 0 ? formatCurrency(r.spend) : "—") },
  { key: "total", label: "Grand Total", render: r => r.totalLeads },
  { key: "cpl", label: "CPL", render: r => (r.spend > 0 ? formatCpl(r.spend, r.totalLeads) : "—") },
  { key: "qualified", label: "Qualified", menuLabel: "Qualified Leads", render: r => r.qualified },
  { key: "followups", label: "Followup", render: r => r.followUps },
  { key: "workable", label: "Workable % (Q/G)", render: r => formatPercent(r.qualified, r.totalLeads) },
  { key: "lowBudget", label: "Low Budget", extra: true, render: r => r.lowBudget },
  { key: "otherReq", label: "Other Req.", extra: true, render: r => r.otherRequirement },
  { key: "unqualified", label: "Unqualified", menuLabel: "Unqualified Leads", extra: true, render: r => r.unqualified },
  { key: "rnr", label: "RNR", extra: true, render: r => r.rnr }
];

// Project-wise Site Visits Report. "Lead …" = leads, "SV …" = site-visit
// appointments (see the server's /marketing-project-stats).
const SITE_VISIT_COLUMNS: ProjectReportColumn<MarketingSiteVisitRow>[] = [
  { key: "total", label: "Total Site Visits", render: r => r.totalSiteVisits },
  { key: "leadScheduled", label: "Lead SV Scheduled", render: r => r.leadsScheduled },
  { key: "svScheduled", label: "SV Scheduled", render: r => r.svScheduled },
  { key: "completed", label: "SV Completed L", menuLabel: "SV Completed Leads", render: r => r.leadsCompleted },
  { key: "leadMissed", label: "Lead SV Missed", render: r => r.leadsMissed },
  { key: "svMissed", label: "SV Missed", render: r => r.svMissed },
  { key: "booked", label: "Booked", render: r => r.booked }
];

export default function MarketingReports({ dateRange, onDateRangeChange }: { dateRange: DateRange; onDateRangeChange: (range: DateRange) => void }) {
  const { properties, users, adSpendRecords } = useApp();

  // ---- Filters ----
  const [campaignFilter, setCampaignFilter] = useState<string[]>([]);
  const [propertyFilter, setPropertyFilter] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<string[]>([]); // manager ids
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);

  // Campaign names from both sides: what the ad platforms report spend for,
  // and what leads in the CRM are tagged with.
  const [leadCampaigns, setLeadCampaigns] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiGetDistinctCampaigns({})
      .then(result => { if (!cancelled) setLeadCampaigns(result); })
      .catch(() => { /* the ad-spend names below still populate the list */ });
    return () => { cancelled = true; };
  }, []);
  const campaignOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    [...adSpendRecords.map(r => r.accountName), ...leadCampaigns].forEach(name => {
      const trimmed = name?.trim();
      if (trimmed && !byKey.has(trimmed.toLowerCase())) byKey.set(trimmed.toLowerCase(), trimmed);
    });
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
  }, [adSpendRecords, leadCampaigns]);

  const propertyOptions = useMemo(() => [...properties.map(p => p.name).sort((a, b) => a.localeCompare(b)), NOT_SET], [properties]);

  // A team = a Manager plus everyone reporting to them.
  const teamOptions = useMemo(
    () => users.filter(u => u.role_type === "Manager").map(u => ({ value: u.id, label: `${u.name}'s team` })).sort((a, b) => a.label.localeCompare(b.label)),
    [users]
  );
  const teamAgentIds = useMemo(() => {
    if (teamFilter.length === 0) return undefined;
    const ids = new Set<string>();
    teamFilter.forEach(managerId => {
      ids.add(managerId);
      users.filter(u => u.managerId === managerId).forEach(u => ids.add(u.id));
    });
    return Array.from(ids);
  }, [teamFilter, users]);

  // ---- Data ----
  const [stats, setStats] = useState<MarketingProjectStats>(ZERO_STATS);
  const [loading, setLoading] = useState(true);
  const { liveVersion, isBackground } = useLiveRefresh("leads");
  const filters = {
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    campaign: campaignFilter.length > 0 ? campaignFilter : undefined,
    propertyId: properties.filter(p => propertyFilter.includes(p.name)).map(p => p.id),
    noProperty: propertyFilter.includes(NOT_SET) || undefined,
    assignedAgentId: teamAgentIds,
    source: sourceFilter.length > 0 ? (sourceFilter as MarketingSource[]) : undefined
  };
  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    const background = isBackground();
    let cancelled = false;
    if (!background) setLoading(true);
    apiGetMarketingProjectStats(filters)
      .then(result => { if (!cancelled) setStats(result); })
      .catch(() => { /* keep the previous numbers on a transient failure */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // filtersKey covers every filter value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, liveVersion]);

  // status = the leads behind each card (undefined = every lead); Active
  // Campaigns lists campaigns instead of leads.
  const kpiCards: { label: string; value: number; color: string; status?: string[] }[] = [
    { label: "Active Campaigns", value: stats.kpis.activeCampaigns, color: "text-slate-900" },
    { label: "Total Leads", value: stats.kpis.totalLeads, color: "text-green-600" },
    { label: "Qualified Leads", value: stats.kpis.qualified, color: "text-[#FF0000]", status: QUALIFIED_CODES },
    { label: "RNR", value: stats.kpis.rnr, color: "text-[#FF8C00]", status: ["RNR"] },
    { label: "Follow Ups", value: stats.kpis.followUps, color: "text-[#0084FF]", status: ["FOLLOWUP"] },
    { label: "Call Backs", value: stats.kpis.callBacks, color: "text-[#FF8C00]", status: ["CALL_BACK"] },
    { label: "Site Visits", value: stats.kpis.siteVisits, color: "text-[#0084FF]", status: ["SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE"] }
  ];

  // Clicking a card opens its list below the cards — same as the Dashboard.
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const selected = kpiCards.find(c => c.label === selectedCard);
  // Same filters as the numbers above, so the list matches the card's count.
  const drillFilters: LeadListFilters = {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    campaign: filters.campaign,
    campaignIgnoreCase: true,
    propertyId: filters.propertyId.length > 0 ? filters.propertyId : undefined,
    noProperty: filters.noProperty,
    assignedAgentId: filters.assignedAgentId,
    sourceBucket: filters.source,
    // No source picked = leave out the Data Calling pool (as the numbers do).
    excludeBulkUpload: filters.source ? undefined : true,
    status: selected?.status
  };

  const { pageRows: campaignPageRows, paginationProps: campaignPaginationProps } = usePagination(stats.activeCampaignList, 10, filtersKey);

  // Filter buttons carry a blue icon (per the mockup).
  const filterIcon = (Icon: typeof Home) => <Icon className="h-4 w-4 text-blue-600 shrink-0" />;

  return (
    <div className="bg-white rounded-3xl shadow-sm px-4 sm:px-6 py-5 space-y-5">
      {/* Filters + number cards stay pinned under the tabs (desktop) while
          the lists below scroll underneath. */}
      <div className="md:sticky md:top-6 lg:top-4 md:z-20 bg-white -mx-4 px-4 sm:-mx-6 sm:px-6 md:pt-4 md:-mt-4 pb-1 space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-end gap-2 pb-5 border-b border-slate-200">
        <SearchableMultiSelect variant="toolbar"
          label="Campaigns"
          options={campaignOptions}
          selected={campaignFilter}
          onChange={setCampaignFilter}
          searchPlaceholder="Search campaigns..."
          panelWidth={260}
          align="right"
        />
        <DateRangePicker
          value={{ start: dateRange.from, end: dateRange.to }}
          onChange={(v) => { if (v) onDateRangeChange({ from: v.start, to: v.end }); }}
          clearable={false}
          label="Date Range"
          triggerClassName="!text-[13px] !font-semibold"
        />
        <SearchableMultiSelect variant="toolbar"
          label="Property"
          icon={filterIcon(Home)}
          options={propertyOptions}
          selected={propertyFilter}
          onChange={setPropertyFilter}
          searchPlaceholder="Search properties..."
          panelWidth={240}
          align="right"
        />
        <SearchableMultiSelect variant="toolbar"
          label="Team"
          icon={filterIcon(Users)}
          options={teamOptions}
          selected={teamFilter}
          onChange={setTeamFilter}
          searchPlaceholder="Search teams..."
          panelWidth={240}
          align="right"
        />
        <SearchableMultiSelect variant="toolbar"
          label="Source"
          icon={filterIcon(FileText)}
          options={SOURCE_OPTIONS}
          selected={sourceFilter}
          onChange={setSourceFilter}
          searchPlaceholder="Search sources..."
          renderLabel={(l) => <PlatformLabel text={l} />}
          panelWidth={200}
          align="right"
        />
      </div>

      {/* KPI cards — dark band on top, one bordered row of cards */}
      <div className="rounded-2xl overflow-hidden shadow-sm">
        <div className="h-6 bg-[#0B0E4F]" />
        <div className="flex md:grid md:grid-cols-7 border-x border-b border-slate-300 rounded-b-2xl bg-white divide-x divide-slate-300 overflow-x-auto">
          {kpiCards.map(s => {
            const isActive = selectedCard === s.label;
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => setSelectedCard(prev => (prev === s.label ? null : s.label))}
                className={`p-3 flex items-center justify-between gap-2 min-h-[70px] min-w-[120px] md:min-w-0 text-left transition-colors ${
                  isActive ? "bg-blue-50/70" : "hover:bg-slate-50/50"
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-[11px] font-medium text-slate-500 truncate">{s.label}</span>
                  <span className={`block text-lg font-extrabold mt-1.5 ${s.color}`}>
                    {loading ? <LineSkeleton width={36} height={18} /> : s.value.toLocaleString("en-IN")}
                  </span>
                </span>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${isActive ? "rotate-180 text-blue-500" : "text-slate-400"}`} />
              </button>
            );
          })}
        </div>
      </div>

      </div>

      {/* The selected card's list */}
      {selectedCard === "Active Campaigns" ? (
        <div className="bg-white rounded-2xl shadow-md border border-slate-100 animate-fade-in">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="ui-title">Active Campaigns</h3>
            <button onClick={() => setSelectedCard(null)} className="text-[11px] font-bold text-slate-400 hover:text-slate-700">
              Close ✕
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[520px]">
              <thead>
                <tr className="border-b border-slate-200 font-bold text-slate-800">
                  <th className="px-4 py-3 whitespace-nowrap">Campaign</th>
                  <th className="px-4 py-3 whitespace-nowrap">Source</th>
                  <th className="px-4 py-3 whitespace-nowrap">Amount Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaignPageRows.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400 italic">No active campaigns for these filters.</td></tr>
                ) : (
                  campaignPageRows.map(c => (
                    <tr key={c.name}>
                      <td className="px-4 py-3 text-slate-800 font-semibold [overflow-wrap:anywhere]">{c.name}</td>
                      <td className="px-4 py-3"><PlatformLabel text={c.platform === "GOOGLE" ? "Google" : "Meta"} /></td>
                      <td className="px-4 py-3 text-slate-700 tabular-nums">{formatCurrency(c.spend)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <TablePagination {...campaignPaginationProps} rowLabel="Campaign" />
        </div>
      ) : (
        <LeadDrillDownPanel
          title={selectedCard}
          baseFilters={selectedCard ? drillFilters : {}}
          onClose={() => setSelectedCard(null)}
        />
      )}

      <ProjectReportTable
        title="Project-wise Lead Report"
        projectLabel="Project"
        columns={LEAD_REPORT_COLUMNS}
        rows={stats.byProject}
        loading={loading}
        resetKey={filtersKey}
        emptyText="No leads or ad spend for these filters."
      />

      <ProjectReportTable
        title="Project-wise Site Visits Report"
        projectLabel="Project Name"
        columns={SITE_VISIT_COLUMNS}
        rows={stats.siteVisitsByProject}
        loading={loading}
        resetKey={filtersKey}
        emptyText="No site visits for these filters."
      />
    </div>
  );
}
