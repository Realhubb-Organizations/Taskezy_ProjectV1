"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, FileText, Home, Users } from "lucide-react";
import ProjectReportTable, { type ProjectReportColumn, type ReportNameColumn } from "./ProjectReportTable";
import LeadDrillDownPanel from "@/components/crm/LeadDrillDownPanel";
import MissedCountBadge from "@/components/crm/MissedCountBadge";
import MissedTaskReport from "./MissedTaskReport";
import { useApp } from "@/context/AppContext";
import { DateRange } from "./DateRangeFilter";
import DateRangePicker from "@/components/ui/DateRangePicker";
import { SearchableMultiSelect } from "@/components/ui/SearchableDropdown";
import { PlatformLabel } from "@/components/icons/ContactIcons";
import TablePagination, { usePagination } from "@/components/ui/TablePagination";
import { LineSkeleton, TableRowsSkeleton } from "@/components/ui/Skeletons";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { isLeadAssignableUser } from "@/lib/leadAssignment";
import { dbCodeToFrontendStatus } from "@/lib/leadStatusMapping";
import { maskPhone } from "@/lib/maskPII";
import { downloadReportCsv } from "@/lib/csv";
import { openOnRowClick, LEAD_ROW_CLASS } from "@/lib/rowClick";
import { useLeadQuickView } from "@/components/crm/useLeadQuickView";
import ReportNumberLink from "./ReportNumberLink";
import type { ReportDetail } from "@/lib/reportDetail";
import { useDialog } from "@/components/ui/DialogProvider";
import type { ReportExportFilters } from "@/lib/apiClient";
import {
  apiGetDistinctCampaigns,
  apiGetTeamReport,
  apiListTeamDataCallingLeads,
  apiListTeamMissedTasks,
  type LeadListFilters,
  type MarketingSource,
  type TeamDataCallingLeadRow,
  type TeamMissedTaskRow,
  type TeamReport,
  type TeamReportCounts,
  type TeamReportFilters,
  type TeamReportMode,
  type TeamReportSalespersonRow,
  type TeamSiteVisitLead
} from "@/lib/apiClient";

// Reports → Team Reports, from GET /reports/team (Taskezy-Server
// reports/teamReport.routes.ts), scoped server-side: Admin = everyone,
// Manager = their team, Member = themselves.
//   Leads:        KPI cards · Salesperson Leads Report · Salesperson Site
//                 Visit Report · Salesperson Missed Task Report (MissedTaskReport.tsx)
//   Data Calling: KPI cards (call outcomes) · Salesperson Leads Report ·
//                 Salesperson Data Calling Report · Salesperson Site Visit Report

const NOT_SET = "Not set";
const SOURCE_OPTIONS: { value: MarketingSource; label: string }[] = [
  { value: "META", label: "Meta" },
  { value: "GOOGLE", label: "Google" },
  { value: "DATA", label: "Data" }
];
// Same "qualified" statuses as the server.
const QUALIFIED_CODES = ["CALL_BACK", "FOLLOWUP", "EOI", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "BOOKED"];
const CALL_STATUSES = ["Connected", "Called", "Not Reachable", "Wrong Number"];
// No salesperson can match this — used when the Team and Salesperson picks don't overlap.
const NOBODY = "00000000-0000-0000-0000-000000000000";

const ZERO_COUNTS: TeamReportCounts = {
  totalLeads: 0, assigned: 0, qualified: 0, notQualified: 0, callsMade: 0, connected: 0,
  siteVisits: 0, rnr: 0, followUps: 0, callBacks: 0, missedTasks: 0
};
const ZERO_REPORT: TeamReport = {
  kpis: ZERO_COUNTS,
  salespeople: [],
  siteVisits: { kpis: { qualified: 0, leads: 0, scheduled: 0, done: 0, missedLeads: 0, missedTasks: 0, avgReschedules: 0 }, leads: [] },
  subSources: []
};

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";
const formatDateTime = (iso: string | null) =>
  iso ? `${formatDate(iso)}, ${new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "-";
const formatPercent = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—");

const CALL_TYPE_LABEL: Record<TeamMissedTaskRow["call_type"], string> = { CALLBACK: "Call Back", MEETING: "Meeting", SITE_VISIT: "Site Visit" };

const leadNameCell = (name: string, phone: string | null, missedTaskCount?: number) => (
  <>
    <p className="font-semibold text-slate-800">{name}</p>
    {phone && <p className="text-[10px] text-slate-400 font-mono">{maskPhone(phone)}</p>}
    <MissedCountBadge count={missedTaskCount} />
  </>
);

const DownloadButton = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={onClick} className="ui-btn ui-btn-secondary border !px-2.5" title="Download CSV" aria-label="Download CSV">
    <Download className="h-4 w-4 text-blue-600" />
  </button>
);

// One KPI card — same look as Marketing Reports' cards.
function KpiCard({ label, value, color, active, loading, onClick }: {
  label: string; value: string; color: string; active: boolean; loading: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-3 flex items-center justify-between gap-2 min-h-[70px] min-w-[120px] md:min-w-0 text-left transition-colors ${
        active ? "bg-blue-50/70" : "hover:bg-slate-50/50"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-slate-500 leading-tight">{label}</span>
        <span className={`block text-lg font-extrabold mt-1.5 ${color}`}>
          {loading ? <LineSkeleton width={36} height={18} /> : value}
        </span>
      </span>
      <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${active ? "rotate-90 text-blue-500" : "text-slate-400"}`} />
    </button>
  );
}

// Dark band on top (Data Calling: the Sub-Source picker), one bordered row of cards.
function KpiBlock({ band, children }: { band?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden shadow-sm">
      <div className={`bg-[#0B0E4F] px-4 flex items-center ${band ? "h-9" : "h-6"}`}>{band}</div>
      <div className="flex md:grid md:grid-cols-7 border-x border-b border-slate-300 rounded-b-2xl bg-white divide-x divide-slate-300 overflow-x-auto">
        {children}
      </div>
    </div>
  );
}

// "Sub-Source  Ajneeti Data ▾" in the dark band — same selection as the Source filter.
function SubSourceBand({ options, selected, onChange }: { options: string[]; selected: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-slate-300 min-w-0">
      <span className="shrink-0">Sub-Source</span>
      <SearchableMultiSelect variant="inline"
        options={options}
        selected={selected}
        onChange={onChange}
        placeholder="All"
        searchPlaceholder="Search sub-sources..."
        panelWidth={240}
        className="!text-white !font-semibold text-[12px] hover:!text-slate-200"
      />
    </div>
  );
}

// A report card whose rows come from the server a page at a time.
export function PagedReportCard<R>({ title, columns, fetchPage, resetKey, rowKey, emptyText, rowLabel, onClose, refreshKey, onRowClick }: {
  title: string;
  columns: { label: string; render: (row: R) => React.ReactNode }[];
  fetchPage: (page: number, pageSize: number) => Promise<{ rows: R[]; totalCount: number }>;
  /** Changes when the filters change (back to page 1). */
  resetKey: string;
  /** Changes on live updates (same page, fresh rows). */
  refreshKey?: unknown;
  rowKey: (row: R) => string;
  emptyText: string;
  rowLabel: string;
  /** Shown as a Close link (the Missed Tasks card's list). */
  onClose?: () => void;
  /** Makes each row clickable (e.g. open the lead's details). */
  onRowClick?: (row: R) => void;
}) {
  const [rows, setRows] = useState<R[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(onClose ? 10 : 100);
  const [loading, setLoading] = useState(true);
  useEffect(() => { setPage(1); }, [resetKey]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPage(page, rowsPerPage)
      .then(result => { if (!cancelled) { setRows(result.rows); setTotalCount(result.totalCount); } })
      .catch(() => { /* keep the previous page on a transient failure */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // resetKey stands for fetchPage's filters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, refreshKey, page, rowsPerPage]);

  return (
    <div className={onClose ? "bg-white rounded-2xl shadow-md border border-slate-100 animate-fade-in" : "border border-slate-300 rounded-3xl shadow-sm overflow-hidden"}>
      {onClose ? (
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="ui-title">{title}</h3>
          <button onClick={onClose} className="text-[11px] font-bold text-slate-400 hover:text-slate-700">Close ✕</button>
        </div>
      ) : (
        <div className="px-5 sm:px-6 pt-5 pb-3">
          <h3 className="ui-section-title">{title}</h3>
        </div>
      )}
      <div className={`overflow-x-auto ${onClose ? "" : "px-5 sm:px-6"}`}>
        <table className="w-full table-fixed text-left border-collapse" style={{ minWidth: `${columns.length * 140}px` }}>
          <thead>
            <tr className="border-b border-slate-200 text-xs font-bold text-slate-800">
              {columns.map(c => <th key={c.label} className={`py-3 pr-4 ${onClose ? "first:pl-4" : ""}`}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading && rows.length === 0 ? (
              <TableRowsSkeleton rows={4} columns={columns.length} />
            ) : rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="py-10 text-center text-xs text-slate-400 italic">{emptyText}</td></tr>
            ) : (
              rows.map(r => (
                <tr
                  key={rowKey(r)}
                  onClick={onRowClick ? openOnRowClick(() => onRowClick(r)) : undefined}
                  className={onRowClick ? LEAD_ROW_CLASS : undefined}
                >
                  {columns.map(c => (
                    <td key={c.label} className={`py-3.5 pr-4 text-xs text-slate-700 [overflow-wrap:anywhere] ${onClose ? "first:pl-4" : ""}`}>{c.render(r)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <TablePagination
        totalRows={totalCount}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={setPage}
        onRowsPerPageChange={(n) => { setRowsPerPage(n); setPage(1); }}
        rowLabel={rowLabel}
      />
    </div>
  );
}

export const MISSED_TASK_COLUMNS: { label: string; render: (r: TeamMissedTaskRow) => React.ReactNode }[] = [
  { label: "Lead Name", render: r => leadNameCell(r.lead_name, r.phone, r.missed_task_count) },
  { label: "Salesperson", render: r => r.assigned_to_name ?? "—" },
  { label: "Task", render: r => CALL_TYPE_LABEL[r.call_type] ?? r.call_type },
  { label: "Missed Date", render: r => formatDateTime(r.scheduled_at) },
  { label: "Lead Status", render: r => dbCodeToFrontendStatus(r.lead_status) },
  { label: "Next Call Date", render: r => formatDateTime(r.next_call_at) }
];

const DATA_CALLING_COLUMNS: { label: string; render: (r: TeamDataCallingLeadRow) => React.ReactNode }[] = [
  { label: "Lead Name", render: r => leadNameCell(r.lead_name, r.phone, r.missed_task_count) },
  { label: "Salesperson", render: r => r.assigned_to_name ?? "—" },
  { label: "Sub-Source", render: r => r.sub_source ?? "—" },
  { label: "Call Status", render: r => r.call_status ?? "Not called yet" },
  { label: "Qualification", render: r => (r.call_status === "Connected" && r.call_sub_status ? (r.call_sub_status === "Qualified" ? "Qualified" : "Not Qualified") : "-") },
  { label: "Last Called", render: r => formatDateTime(r.last_called_at) },
  { label: "Next Call Date", render: r => formatDateTime(r.next_call_at) }
];

// A Site Visit card's list: the leads behind its number, opened under the cards.
export function SiteVisitCardList({ title, rows, count, onClose, onRowClick, loading }: {
  title: string;
  rows: TeamSiteVisitLead[];
  count?: { label: string; value: (r: TeamSiteVisitLead) => number };
  /** Shown as a Close link; left out on the full detail page. */
  onClose?: () => void;
  /** Makes each row clickable (open the lead's details). */
  onRowClick?: (row: TeamSiteVisitLead) => void;
  loading?: boolean;
}) {
  const { pageRows, paginationProps } = usePagination(rows, 10);
  return (
    <div className="bg-white rounded-2xl shadow-md border border-slate-100 animate-fade-in">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="ui-title">{title}</h3>
        {onClose && <button onClick={onClose} className="text-[11px] font-bold text-slate-400 hover:text-slate-700">Close ✕</button>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-200 font-bold text-slate-800">
              <th className="px-4 py-3 whitespace-nowrap">Lead Name</th>
              <th className="px-4 py-3 whitespace-nowrap">Salesperson</th>
              <th className="px-4 py-3 whitespace-nowrap">SV Schedule Date</th>
              <th className="px-4 py-3 whitespace-nowrap">SV Done Date</th>
              <th className="px-4 py-3 whitespace-nowrap">Lead Status</th>
              {count && <th className="px-4 py-3 whitespace-nowrap">{count.label}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && pageRows.length === 0 ? (
              <TableRowsSkeleton rows={4} columns={count ? 6 : 5} />
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={count ? 6 : 5} className="px-4 py-8 text-center text-slate-400 italic">No leads for this card.</td></tr>
            ) : (
              pageRows.map(r => (
                <tr
                  key={r.leadId}
                  onClick={onRowClick ? openOnRowClick(() => onRowClick(r)) : undefined}
                  className={`text-slate-700 ${onRowClick ? LEAD_ROW_CLASS : ""}`}
                >
                  <td className="px-4 py-3">{leadNameCell(r.name, r.phone, r.missedTaskCount)}</td>
                  <td className="px-4 py-3">{r.salesperson ?? "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.scheduledAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.doneAt ? formatDate(r.doneAt) : r.done ? "Done" : "-"}</td>
                  <td className="px-4 py-3">{dbCodeToFrontendStatus(r.status)}</td>
                  {count && <td className="px-4 py-3 font-bold text-slate-900 tabular-nums">{count.value(r)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <TablePagination {...paginationProps} rowLabel="Lead" />
    </div>
  );
}

// Salesperson Site Visit Report — one row per lead with a site visit due in the range.
const SV_NAME_COLUMN: ReportNameColumn<TeamSiteVisitLead> = {
  key: r => r.leadId,
  text: r => r.name,
  render: r => leadNameCell(r.name, r.phone, r.missedTaskCount),
  menuLabel: "Lead Name",
  searchPlaceholder: "Search lead...",
  noMatchLabel: "lead"
};
const SV_MENU = { main: ["missed", "q2sv"], extra: ["missedTasks", "nextCall"] };

export default function TeamReports({ dateRange, onDateRangeChange, initialAgentId }: {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  initialAgentId?: string;
}) {
  const { properties, users, currentUser, activeRole } = useApp();
  const { toast } = useDialog();
  // Clicking a lead row anywhere on this tab opens the lead's details.
  const quickView = useLeadQuickView();
  const isAdmin = activeRole === "ADMIN";
  const isManager = !isAdmin && currentUser?.role_type === "Manager";

  // ---- Filters ----
  const [mode, setMode] = useState<TeamReportMode>("LEADS");
  const dataCalling = mode === "DATA_CALLING";
  const [campaignFilter, setCampaignFilter] = useState<string[]>([]); // Leads only
  const [propertyFilter, setPropertyFilter] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState<string[]>([]); // manager ids (Admin only)
  const [sourceFilter, setSourceFilter] = useState<string[]>([]); // Leads: Meta/Google/Data
  const [subSourceFilter, setSubSourceFilter] = useState<string[]>([]); // Data Calling
  // Salesperson Name column's multi-select; a notification link can pre-pick one.
  const [salespersonFilter, setSalespersonFilter] = useState<string[]>(() => (initialAgentId ? [initialAgentId] : []));

  // Campaigns that have leads in the picked date range.
  const [leadCampaigns, setLeadCampaigns] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiGetDistinctCampaigns({ dateFrom: dateRange.from, dateTo: dateRange.to, excludeBulkUpload: true })
      .then(result => { if (!cancelled) setLeadCampaigns(result); })
      .catch(() => { /* the list just keeps its last values */ });
    return () => { cancelled = true; };
  }, [dateRange.from, dateRange.to]);
  const campaignOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    // A picked campaign stays listed even if the new range has no leads for it.
    [...leadCampaigns, ...campaignFilter].forEach(name => {
      const trimmed = name?.trim();
      if (trimmed && !byKey.has(trimmed.toLowerCase())) byKey.set(trimmed.toLowerCase(), trimmed);
    });
    return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
  }, [leadCampaigns, campaignFilter]);
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

  // Who can be picked in the Salesperson Name column (the server scopes the data either way).
  const salespersonOptions = useMemo(() => {
    const pool = isAdmin
      ? users.filter(isLeadAssignableUser)
      : isManager
        ? users.filter(u => u.id === currentUser?.id || u.managerId === currentUser?.id)
        : [];
    return pool.map(u => ({ value: u.id, label: u.name })).sort((a, b) => a.label.localeCompare(b.label));
  }, [users, isAdmin, isManager, currentUser?.id]);

  const agentIds = useMemo(() => {
    const picked = salespersonFilter.length > 0 ? salespersonFilter : undefined;
    if (!teamAgentIds) return picked;
    if (!picked) return teamAgentIds;
    const both = picked.filter(id => teamAgentIds.includes(id));
    return both.length > 0 ? both : [NOBODY];
  }, [salespersonFilter, teamAgentIds]);

  // ---- Data ----
  const filters: TeamReportFilters = {
    mode,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    campaign: !dataCalling && campaignFilter.length > 0 ? campaignFilter : undefined,
    propertyId: properties.filter(p => propertyFilter.includes(p.name)).map(p => p.id),
    noProperty: propertyFilter.includes(NOT_SET) || undefined,
    assignedAgentId: agentIds,
    source: !dataCalling && sourceFilter.length > 0 ? (sourceFilter as MarketingSource[]) : undefined,
    subSource: dataCalling && subSourceFilter.length > 0 ? subSourceFilter : undefined
  };
  const filtersKey = JSON.stringify(filters);
  const [report, setReport] = useState<TeamReport>(ZERO_REPORT);
  const [loading, setLoading] = useState(true);
  const { liveVersion, isBackground } = useLiveRefresh("leads", "followups");
  useEffect(() => {
    const background = isBackground();
    let cancelled = false;
    if (!background) setLoading(true);
    apiGetTeamReport(filters)
      .then(result => { if (!cancelled) setReport(result); })
      .catch(() => { /* keep the previous numbers on a transient failure */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // filtersKey covers every filter value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, liveVersion]);

  // Sub-sources come with the Data Calling report; keep the last list while it reloads.
  const [subSourceOptions, setSubSourceOptions] = useState<string[]>([]);
  useEffect(() => { if (report.subSources.length > 0) setSubSourceOptions(report.subSources); }, [report.subSources]);

  // ---- KPI cards → their lists ----
  // Same filters as the numbers, so each list matches its card's count.
  const baseDrill: LeadListFilters = {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    campaign: filters.campaign,
    campaignIgnoreCase: true,
    propertyId: filters.propertyId && filters.propertyId.length > 0 ? filters.propertyId : undefined,
    noProperty: filters.noProperty,
    assignedAgentId: filters.assignedAgentId,
    ...(dataCalling
      ? { dataCallingOnly: true, subSource: filters.subSource }
      : { excludeBulkUpload: true, sourceBucket: filters.source })
  };
  const qualifiedDrill: LeadListFilters = dataCalling ? { callSubStatus: ["Qualified"] } : { status: QUALIFIED_CODES };
  const k = report.kpis;
  const kpiCards: { label: string; value: number; color: string; drill?: LeadListFilters }[] = dataCalling
    ? [
      { label: "Total Leads Assigned", value: k.assigned, color: "text-slate-900", drill: { assignedOnly: true } },
      { label: "Call Made", value: k.callsMade, color: "text-green-600", drill: { callStatus: CALL_STATUSES } },
      { label: "Connected", value: k.connected, color: "text-[#FF0000]", drill: { callStatus: ["Connected"] } },
      { label: "Not Qualified", value: k.notQualified, color: "text-[#FF8C00]", drill: { callSubStatus: ["Unqualified"] } },
      { label: "Qualified", value: k.qualified, color: "text-[#0084FF]", drill: qualifiedDrill },
      { label: "RNR", value: k.rnr, color: "text-[#FF8C00]", drill: { callStatus: ["Not Reachable"] } },
      { label: "Missed Tasks", value: k.missedTasks, color: "text-[#0084FF]" }
    ]
    : [
      { label: "Total Leads", value: k.totalLeads, color: "text-slate-900", drill: {} },
      { label: "Qualified Leads", value: k.qualified, color: "text-green-600", drill: qualifiedDrill },
      { label: "Site Visits", value: k.siteVisits, color: "text-[#FF0000]", drill: { status: ["SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE"] } },
      { label: "RNR", value: k.rnr, color: "text-[#FF8C00]", drill: { status: ["RNR"] } },
      { label: "Follow Ups", value: k.followUps, color: "text-[#0084FF]", drill: { status: ["FOLLOWUP"] } },
      { label: "Call Backs", value: k.callBacks, color: "text-[#FF8C00]", drill: { status: ["CALL_BACK"] } },
      { label: "Missed Tasks", value: k.missedTasks, color: "text-[#0084FF]" }
    ];
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const selected = kpiCards.find(c => c.label === selectedCard);
  const switchMode = (next: TeamReportMode) => {
    if (next === mode) return;
    setMode(next);
    setSelectedCard(null); // the two modes have different cards
  };

  const subSourceBand = dataCalling
    ? <SubSourceBand options={subSourceOptions} selected={subSourceFilter} onChange={setSubSourceFilter} />
    : undefined;
  const fileTag = `${dateRange.from}_to_${dateRange.to}`;
  // The filters a download was made with, as people read them — saved with
  // the download record (Reports → Download History).
  const nameOf = (id: string) => users.find(u => u.id === id)?.name ?? id;
  const exportFilters: ReportExportFilters = {
    View: dataCalling ? "Data Calling" : "Leads",
    "Date Range": `${dateRange.from} to ${dateRange.to}`,
    ...(campaignFilter.length > 0 && !dataCalling ? { Campaigns: campaignFilter } : {}),
    ...(propertyFilter.length > 0 ? { Property: propertyFilter } : {}),
    ...(teamFilter.length > 0 ? { Team: teamFilter.map(id => `${nameOf(id)}'s team`) } : {}),
    ...(!dataCalling && sourceFilter.length > 0 ? { Source: sourceFilter } : {}),
    ...(dataCalling && subSourceFilter.length > 0 ? { "Sub-Source": subSourceFilter } : {}),
    ...(salespersonFilter.length > 0 ? { Salesperson: salespersonFilter.map(nameOf) } : {})
  };
  const runDownload = (job: () => Promise<void>) =>
    job().catch(() => toast("Couldn't start the download. Please try again.", "error"));

  // ---- Salesperson Leads Report ----
  // Each number opens its detail page: that salesperson's leads (or missed
  // tasks) with the page's filters — the same ones the number is counted with.
  const leadsOf = (r: TeamReportSalespersonRow, label: string, extra: LeadListFilters): ReportDetail => ({
    view: "leads",
    title: `${r.name} · ${label}`,
    filters: { ...baseDrill, assignedAgentId: [r.agentId], ...extra }
  });
  const salesColumns: { label: string; value: (r: TeamReportSalespersonRow) => number; detail: (r: TeamReportSalespersonRow) => ReportDetail }[] = dataCalling
    ? [
      { label: "Leads Assigned", value: r => r.assigned, detail: r => leadsOf(r, "Leads Assigned", { assignedOnly: true }) },
      { label: "Call Made", value: r => r.callsMade, detail: r => leadsOf(r, "Call Made", { callStatus: CALL_STATUSES }) },
      { label: "Connected", value: r => r.connected, detail: r => leadsOf(r, "Connected", { callStatus: ["Connected"] }) },
      { label: "Qualified Leads", value: r => r.qualified, detail: r => leadsOf(r, "Qualified Leads", qualifiedDrill) },
      { label: "RNR", value: r => r.rnr, detail: r => leadsOf(r, "RNR", { callStatus: ["Not Reachable"] }) },
      { label: "Not Qualified", value: r => r.notQualified, detail: r => leadsOf(r, "Not Qualified", { callSubStatus: ["Unqualified"] }) }
    ]
    : [
      { label: "Qualified Leads", value: r => r.qualified, detail: r => leadsOf(r, "Qualified Leads", qualifiedDrill) },
      { label: "Site Visits", value: r => r.siteVisits, detail: r => leadsOf(r, "Site Visits", { status: ["SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE"] }) },
      { label: "RNR", value: r => r.rnr, detail: r => leadsOf(r, "RNR", { status: ["RNR"] }) },
      { label: "Follow Ups", value: r => r.followUps, detail: r => leadsOf(r, "Follow Ups", { status: ["FOLLOWUP"] }) },
      { label: "Call Backs", value: r => r.callBacks, detail: r => leadsOf(r, "Call Backs", { status: ["CALL_BACK"] }) },
      {
        label: "Missed Tasks",
        value: r => r.missedTasks,
        detail: r => ({ view: "missed-tasks", title: `${r.name} · Missed Tasks`, filters: { ...filters, assignedAgentId: [r.agentId] } })
      }
    ];
  const { pageRows: salesRows, paginationProps: salesPagination } = usePagination(report.salespeople, 100, filtersKey);
  const downloadSalespeople = () => runDownload(() => downloadReportCsv(
    "Team Reports · Salesperson Leads Report",
    exportFilters,
    `salesperson-${dataCalling ? "data-calling" : "leads"}-report_${fileTag}.csv`,
    ["Salesperson Name", ...salesColumns.map(c => c.label)],
    report.salespeople.map(r => [r.name, ...salesColumns.map(c => c.value(r))])
  ));

  // ---- Salesperson Site Visit Report ----
  const svKpis = report.siteVisits.kpis;
  // Each card opens the leads behind its number (Qualified Leads: the lead
  // list, like the cards at the top). `count` is the column that adds up to
  // the card for the event counts.
  const svCards: {
    key: string; label: string; value: string; color: string;
    matches?: (r: TeamSiteVisitLead) => boolean;
    count?: { label: string; value: (r: TeamSiteVisitLead) => number };
  }[] = [
    { key: "qualified", label: "Qualified Leads", value: svKpis.qualified.toLocaleString("en-IN"), color: "text-slate-900" },
    { key: "leads", label: "Total Lead SV", value: svKpis.leads.toLocaleString("en-IN"), color: "text-green-600", matches: () => true },
    { key: "scheduled", label: "Total SV Scheduled", value: svKpis.scheduled.toLocaleString("en-IN"), color: "text-[#FF8C00]", matches: () => true, count: { label: "Times Scheduled", value: r => r.siteVisitCount } },
    { key: "done", label: "Site Visit Done", value: svKpis.done.toLocaleString("en-IN"), color: "text-green-600", matches: r => r.done },
    { key: "missedLeads", label: "SV Missed Leads", value: svKpis.missedLeads.toLocaleString("en-IN"), color: "text-[#0084FF]", matches: r => r.missedCount > 0, count: { label: "SV Missed", value: r => r.missedCount } },
    { key: "missedTasks", label: "SV Missed Task", value: svKpis.missedTasks.toLocaleString("en-IN"), color: "text-[#FF0000]", matches: r => r.missedCount > 0, count: { label: "SV Missed", value: r => r.missedCount } },
    { key: "avg", label: "Avg. SV Reschedule", value: svKpis.avgReschedules.toLocaleString("en-IN", { maximumFractionDigits: 1 }), color: "text-[#0084FF]", matches: r => r.rescheduleCount > 0, count: { label: "Reschedule Count", value: r => r.rescheduleCount } }
  ];
  const [svCard, setSvCard] = useState<string | null>(null);
  useEffect(() => { setSvCard(null); }, [filtersKey]);
  const openSvCard = svCards.find(c => c.key === svCard);
  const svCardRows = useMemo(
    () => (openSvCard?.matches ? report.siteVisits.leads.filter(openSvCard.matches) : []),
    // openSvCard is rebuilt every render; svCard identifies it
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [report.siteVisits.leads, svCard]
  );
  const svRows = report.siteVisits.leads;
  // Q2SV %age = the lead's salesperson's Site Visits ÷ Qualified Leads (same as their row above).
  const salespersonById = useMemo(() => new Map(report.salespeople.map(r => [r.agentId, r])), [report.salespeople]);
  const q2svOf = (r: TeamSiteVisitLead) => {
    const s = r.salespersonId ? salespersonById.get(r.salespersonId) : undefined;
    return s ? formatPercent(s.siteVisits, s.qualified) : "—";
  };
  const svColumns: ProjectReportColumn<TeamSiteVisitLead>[] = [
    { key: "scheduled", label: "SV Schedule Date", render: r => formatDate(r.scheduledAt) },
    { key: "done", label: "SV Done Date", render: r => (r.doneAt ? formatDate(r.doneAt) : r.done ? "Done" : "-") },
    { key: "rescheduled", label: "SV Reschedule Date", render: r => formatDate(r.rescheduledAt) },
    { key: "reason", label: "Reschedule Reason", render: r => <span className="[overflow-wrap:anywhere]">{r.rescheduleReason || "-"}</span> },
    { key: "missed", label: "SV Missed", render: r => r.missedCount },
    { key: "count", label: "Reschedule Count", render: r => <span className="font-bold text-slate-900">{r.rescheduleCount}</span> },
    { key: "q2sv", label: "Q2SV %age", render: q2svOf },
    { key: "missedTasks", label: "SV Missed Tasks", extra: true, render: r => r.allMissedCount },
    { key: "nextCall", label: "Next Call Date", extra: true, render: r => formatDateTime(r.nextCallAt) }
  ];
  const downloadSiteVisits = () => runDownload(() => downloadReportCsv(
    "Team Reports · Salesperson Site Visit Report",
    exportFilters,
    `salesperson-site-visit-report_${fileTag}.csv`,
    ["Lead Name", "Phone", "Salesperson", "SV Schedule Date", "SV Done Date", "SV Reschedule Date", "Reschedule Reason", "SV Missed", "Reschedule Count", "Q2SV %age", "SV Missed Tasks", "Next Call Date"],
    svRows.map(r => [
      r.name, maskPhone(r.phone), r.salesperson ?? "", formatDate(r.scheduledAt), r.doneAt ? formatDate(r.doneAt) : r.done ? "Done" : "-",
      formatDate(r.rescheduledAt), r.rescheduleReason ?? "-", r.missedCount, r.rescheduleCount, q2svOf(r), r.allMissedCount, formatDateTime(r.nextCallAt)
    ])
  ));

  const siteVisitReport = (
    <ProjectReportTable
      title="Salesperson Site Visit Report"
      projectLabel="Lead Name"
      nameColumn={SV_NAME_COLUMN}
      columns={svColumns}
      menu={SV_MENU}
      rows={svRows}
      loading={loading}
      resetKey={filtersKey}
      emptyText="No site visits for these filters."
      onDownload={downloadSiteVisits}
      onRowClick={r => quickView.open(r.leadId)}
      headerExtra={
        <div className="px-5 sm:px-6 pb-4 space-y-4">
          <KpiBlock band={subSourceBand}>
            {svCards.map(c => (
              <KpiCard
                key={c.key}
                label={c.label}
                value={c.value}
                color={c.color}
                loading={loading}
                active={svCard === c.key}
                onClick={() => setSvCard(prev => (prev === c.key ? null : c.key))}
              />
            ))}
          </KpiBlock>
          <LeadDrillDownPanel
            title={svCard === "qualified" ? "Qualified Leads" : null}
            baseFilters={svCard === "qualified" ? { ...baseDrill, ...qualifiedDrill } : {}}
            onClose={() => setSvCard(null)}
          />
          {openSvCard?.matches && (
            <SiteVisitCardList
              key={openSvCard.key}
              title={openSvCard.label}
              rows={svCardRows}
              count={openSvCard.count}
              onClose={() => setSvCard(null)}
              onRowClick={r => quickView.open(r.leadId)}
            />
          )}
        </div>
      }
    />
  );

  const filterIcon = (Icon: typeof Home) => <Icon className="h-4 w-4 text-blue-600 shrink-0" />;

  return (
    <div className="bg-white rounded-3xl shadow-sm px-4 sm:px-6 py-5 space-y-5">
      {/* The toggle and filters stay pinned under the tabs (desktop) — the
          page scrolls under this line. */}
      <div className="md:sticky md:top-6 lg:top-4 md:z-[25] bg-white -mx-4 px-4 sm:-mx-6 sm:px-6 md:pt-4 md:-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-200">
          <div className="inline-flex items-center bg-slate-200/70 rounded-lg p-1 shadow-sm">
            {([["LEADS", "Leads"], ["DATA_CALLING", "Data Calling"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => switchMode(value)}
                className={`px-4 py-1.5 rounded-md text-[13px] transition-colors ${
                  mode === value ? "bg-white text-slate-900 font-semibold shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!dataCalling && (
              <SearchableMultiSelect variant="toolbar"
                label="Campaigns"
                options={campaignOptions}
                selected={campaignFilter}
                onChange={setCampaignFilter}
                searchPlaceholder="Search campaigns..."
                panelWidth={260}
                align="right"
              />
            )}
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
            {isAdmin && (
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
            )}
            {dataCalling ? (
              <SearchableMultiSelect variant="toolbar"
                label="Source"
                icon={filterIcon(FileText)}
                options={subSourceOptions}
                selected={subSourceFilter}
                onChange={setSubSourceFilter}
                searchPlaceholder="Search sub-sources..."
                panelWidth={240}
                align="right"
              />
            ) : (
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
            )}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <KpiBlock band={subSourceBand}>
        {kpiCards.map(c => (
          <KpiCard
            key={c.label}
            label={c.label}
            value={c.value.toLocaleString("en-IN")}
            color={c.color}
            loading={loading}
            active={selectedCard === c.label}
            onClick={() => setSelectedCard(prev => (prev === c.label ? null : c.label))}
          />
        ))}
      </KpiBlock>

      {selectedCard === "Missed Tasks" ? (
        <PagedReportCard
          title="Missed Tasks"
          columns={MISSED_TASK_COLUMNS}
          fetchPage={(page, size) => apiListTeamMissedTasks(filters, page, size)}
          resetKey={filtersKey}
          rowKey={r => r.id}
          emptyText="No missed tasks for these filters."
          rowLabel="Task"
          onClose={() => setSelectedCard(null)}
          onRowClick={r => quickView.open(r.lead_id)}
        />
      ) : (
        <LeadDrillDownPanel
          title={selectedCard}
          baseFilters={selected?.drill ? { ...baseDrill, ...selected.drill } : {}}
          onClose={() => setSelectedCard(null)}
        />
      )}

      {/* Salesperson Leads Report */}
      <div className="border border-slate-300 rounded-3xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 pb-3">
          <h3 className="ui-section-title">Salesperson Leads Report</h3>
          <DownloadButton onClick={downloadSalespeople} />
        </div>
        <div className="overflow-x-auto px-5 sm:px-6">
          <table className="w-full table-fixed text-left border-collapse min-w-[840px]">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold text-slate-800">
                <th className="py-3 pr-4 whitespace-nowrap">
                  {salespersonOptions.length > 0 ? (
                    <SearchableMultiSelect variant="inline"
                      label="Salesperson Name"
                      options={salespersonOptions}
                      selected={salespersonFilter}
                      onChange={setSalespersonFilter}
                      searchPlaceholder="Search salesperson..."
                      panelWidth={240}
                    />
                  ) : "Salesperson Name"}
                </th>
                {salesColumns.map(c => <th key={c.label} className="py-3 pr-4">{c.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading && report.salespeople.length === 0 ? (
                <TableRowsSkeleton rows={3} columns={7} />
              ) : salesRows.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-xs text-slate-400 italic">No leads for these filters.</td></tr>
              ) : (
                salesRows.map(r => (
                  <tr key={r.agentId} className="text-xs text-slate-700 tabular-nums">
                    <td className="py-3.5 pr-4 font-semibold text-slate-800 [overflow-wrap:anywhere]">{r.name}</td>
                    {salesColumns.map(c => (
                      <td key={c.label} className="py-3.5 pr-4">
                        {/* A removed agent ("removed:<name>", server) keeps their missed tasks
                            under their name, but has no account to open a list for. */}
                        {r.agentId.startsWith("removed:") ? c.value(r) : <ReportNumberLink tab="agent" value={c.value(r)} detail={c.detail(r)} />}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePagination {...salesPagination} rowLabel="Row" />
      </div>

      {dataCalling ? (
        <>
          <PagedReportCard
            title="Salesperson Data Calling Report"
            columns={DATA_CALLING_COLUMNS}
            fetchPage={(page, size) => apiListTeamDataCallingLeads(filters, page, size)}
            resetKey={filtersKey}
            refreshKey={liveVersion}
            rowKey={r => r.lead_id}
            onRowClick={r => quickView.open(r.lead_id)}
            emptyText="No Data Calling leads for these filters."
            rowLabel="Row"
          />
          {siteVisitReport}
        </>
      ) : (
        <>
          {siteVisitReport}
          <MissedTaskReport filters={filters} baseDrill={baseDrill} refreshKey={liveVersion} exportFilters={exportFilters} />
        </>
      )}
      {quickView.drawer}
    </div>
  );
}
