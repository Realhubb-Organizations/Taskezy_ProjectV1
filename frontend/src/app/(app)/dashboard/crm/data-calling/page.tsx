"use client";

import React, { useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useApp, Lead } from "@/context/AppContext";
import { ChevronRight, Search, Sliders, Minus, X, Copy, Users, Plus, Check } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import UploadLeadsModal from "@/components/crm/UploadLeadsModal";
import LeadDetailDrawer from "@/components/crm/LeadDetailDrawer";
import { LineSkeleton, TableRowsSkeleton } from "@/components/ui/Skeletons";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/SearchableDropdown";
import TablePagination, { usePagination } from "@/components/ui/TablePagination";
import DateRangePicker, { DatePicker, DateRangeValue, formatDisplayDate, todayIso, toIsoDate } from "@/components/ui/DateRangePicker";
import DateRangeSelect from "@/components/ui/DateRangeSelect";

// Data Calling's whole status model is deliberately just these three — a
// cold-outreach triage pipeline, not the full CRM pipeline: a fresh
// bulk-uploaded row is New Lead; RNR (no answer) always requires picking a
// next-call date before it commits, same as Follow-up/Call Back does
// elsewhere via the follow-up scheduling mechanism; Connected always
// requires a Qualified/Not Qualified sub-status before it commits. Once
// Connected + Qualified, the lead is promoted out of Data Calling entirely
// (see updateLeadStatus's source flip), so there's nothing further to pick
// here — the rest of its journey happens in the main CRM pipeline.
const ROW_STATUS_OPTIONS: Lead["status"][] = ["New Lead", "RNR", "Connected"];

function formatDateTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// leads.assigned_agent_id is NOT NULL at the DB level (leads.repository.ts
// inner-joins users on it), so assignedAgent is always some real agent's
// name even for a lead nobody has actually started working yet — that
// pipeline state lives in the separate `status` field as "Unassigned"
// instead. That's the real signal the bulk Assign button keys off; a
// missing/placeholder assignedAgent is kept as a defensive fallback only.
function isUnassignedLead(l: Lead): boolean {
  return l.status === "Unassigned" || !l.assignedAgent || l.assignedAgent === "Not Assigned";
}

// Togglable columns for the Data Calling table, driven by its own Filter
// drawer (same bordered-card pattern as the Campaigns page). Lead Name/
// Email/Status/Next Call Date are always shown (the table's identity +
// core contact-workflow columns), same convention as every other table in
// this app keeping its primary column(s) outside the toggle list.
// "Qualified Leads"/"Unqualified Leads"/"CPL"/"Qualified %age" are
// aggregate concepts that don't have a real per-lead-row meaning, so those
// cells honestly render "—" rather than a fabricated number when shown.
type DataCallingColumnKey =
  | "property" | "date" | "qualifiedLeads" | "dataCallSource" | "unqualifiedLeads"
  | "cpl" | "assignedTo" | "usageCount" | "notes" | "qualifiedPercent";

const DATA_CALLING_COLUMNS: { key: DataCallingColumnKey; label: string }[] = [
  { key: "property", label: "Property" },
  { key: "date", label: "Date" },
  { key: "qualifiedLeads", label: "Qualified Leads" },
  { key: "dataCallSource", label: "Data Call Source" },
  { key: "unqualifiedLeads", label: "Unqualified Leads" },
  { key: "cpl", label: "CPL" },
  { key: "assignedTo", label: "Assigned To" },
  { key: "usageCount", label: "Usage Count" },
  { key: "notes", label: "Notes" },
  { key: "qualifiedPercent", label: "Qualified %age" }
];

const DATA_CALLING_DEFAULT_VISIBLE_COLUMNS: Record<DataCallingColumnKey, boolean> = {
  property: true, date: true, qualifiedLeads: false, dataCallSource: false, unqualifiedLeads: false,
  cpl: false, assignedTo: true, usageCount: false, notes: true, qualifiedPercent: false
};

// The Analytics tab's Source Performance table's extra togglable columns —
// the exact same label set (and default on/off state) as the Campaigns
// page's own Campaign Name table Filter drawer, reused here for visual and
// interaction consistency across the app's ads/leads breakdown tables. Most
// have no real backing field for a calling source (no ad spend, click, or
// impression tracking exists at that level here), so they honestly render
// "—" rather than a fabricated number, same convention as Campaigns.
type AnalyticsColumnKey =
  | "cpl" | "date" | "status" | "ctr" | "siteVisit" | "clicks"
  | "adSetName" | "impressions" | "source" | "qcpl" | "unqualifiedLeads" | "qualifiedLeads";

const ANALYTICS_COLUMNS: { key: AnalyticsColumnKey; label: string }[] = [
  { key: "cpl", label: "CPL" },
  { key: "date", label: "Date" },
  { key: "status", label: "Status" },
  { key: "ctr", label: "CTR" },
  { key: "siteVisit", label: "Site Visits" },
  { key: "clicks", label: "Clicks" },
  { key: "adSetName", label: "Ad set name" },
  { key: "impressions", label: "Impressions" },
  { key: "source", label: "Source" },
  { key: "qcpl", label: "QCPL" },
  { key: "unqualifiedLeads", label: "Unqualified Leads" },
  { key: "qualifiedLeads", label: "Qualified Leads" }
];

const ANALYTICS_DEFAULT_VISIBLE_COLUMNS: Record<AnalyticsColumnKey, boolean> = {
  cpl: true, date: false, status: true, ctr: false, siteVisit: true, clicks: false,
  adSetName: false, impressions: false, source: false, qcpl: false,
  unqualifiedLeads: true, qualifiedLeads: true
};

const ANALYTICS_CHART_METRICS = ["Qualified", "RNR", "Calls Made", "Total Leads", "Not Qualified"] as const;
type AnalyticsChartMetric = typeof ANALYTICS_CHART_METRICS[number];

interface AnalyticsPerformanceRow {
  name: string;
  totalLeads: number;
  callsMade: number;
  connected: number;
  qualifiedLeads: number;
  unqualifiedLeads: number;
  rnr: number;
  siteVisits: number;
  qualificationRate: string;
}

function computeAnalyticsPerformanceRows(list: Lead[], groupBy: (l: Lead) => string | undefined): AnalyticsPerformanceRow[] {
  const groups = new Map<string, Lead[]>();
  list.forEach(l => {
    const key = groupBy(l);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(l);
  });
  return Array.from(groups.entries()).map(([name, group]) => {
    const qualifiedLeads = group.filter(l => l.subStatus === "Qualified").length;
    return {
      name,
      totalLeads: group.length,
      callsMade: group.filter(l => l.logs && l.logs.length > 0).length,
      connected: group.filter(l => l.status === "Connected").length,
      qualifiedLeads,
      unqualifiedLeads: group.length - qualifiedLeads,
      rnr: group.filter(l => l.status === "RNR").length,
      siteVisits: group.filter(l => l.status === "Visit Schedule" || l.status === "Site Visit").length,
      qualificationRate: group.length > 0 ? `${((qualifiedLeads / group.length) * 100).toFixed(1)}%` : "0.0%"
    };
  }).sort((a, b) => b.totalLeads - a.totalLeads);
}

function analyticsLeadMatchesMetric(l: Lead, metric: AnalyticsChartMetric): boolean {
  switch (metric) {
    case "Qualified": return l.subStatus === "Qualified";
    case "RNR": return l.status === "RNR";
    case "Calls Made": return !!(l.logs && l.logs.length > 0);
    case "Total Leads": return true;
    case "Not Qualified": return l.subStatus === "Not Qualified";
  }
}

export default function DataCallingPage() {
  // Data Calling is the bulk-uploaded cold-outreach pipeline, kept separate
  // from the rest of the CRM's real, ad-driven leads — dataCallingLeads is
  // the ONLY-bulk-upload view AppContext derives for exactly this page (see
  // AppContext.tsx), aliased to `leads` here so the rest of this large file
  // needs no other changes.
  const { dataCallingLeads: leads, followupCalls, properties, users, activeRole, updateLeadStatus, reassignLead, bulkImportLeads, addFollowupCall, isDataLoading } = useApp();
  // Bulk select + Assign/Reshuffle are an admin-only workflow — a sales
  // agent has no one to hand leads off to in that sense, so the checkbox
  // column and both toolbar buttons stay admin-only.
  const isAdmin = activeRole === "ADMIN";
  const propertiesList = properties.map(p => p.name);
  // Bulk upload's own property/agent pickers need real ids (they drive
  // server-side assignment), unlike propertiesList above which only ever
  // feeds display/filter UI.
  const bulkUploadPropertiesList = useMemo(() => properties.map(p => ({ id: p.id, name: p.name })), [properties]);
  const bulkUploadAgentsList = useMemo(
    () => users.filter(u => u.role === "AGENT" && u.status !== "INACTIVE").map(u => ({ id: u.id, name: u.name })),
    [users]
  );

  const [isUploadLeadsOpen, setIsUploadLeadsOpen] = useState(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState("");

  const [activeTab, setActiveTab] = useState<"DataCalling" | "Analytics">("DataCalling");

  // Summary card date range — every one of the 5 cards below respects it
  // (see categoryLeadsInRange), same as the CRM Dashboard/Campaigns pages.
  // "Custom" = summaryCustomRange (picked from the dropdown's own calendar).
  const [dateRange, setDateRange] = useState<"Today" | "Yesterday" | "This Week" | "This Month" | "All Time" | "Custom">("Today");
  const [summaryCustomRange, setSummaryCustomRange] = useState<DateRangeValue | null>(null);

  const today = new Date();

  const mapDateRangeToKey = (dr: typeof dateRange): "today" | "yesterday" | "week" | "month" | "all" | "custom" => {
    switch (dr) {
      case "Today": return "today";
      case "Yesterday": return "yesterday";
      case "This Week": return "week";
      case "This Month": return "month";
      case "Custom": return "custom";
      default: return "all";
    }
  };
  const dateInRange = (
    dateStr: string | undefined,
    range: "today" | "yesterday" | "week" | "month" | "all" | "custom",
    refNow: Date,
    customRange: DateRangeValue | null = null
  ): boolean => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    if (range === "all") return true;
    // Custom: inclusive start..end, compared on the lead's local calendar day.
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
    return d.getMonth() === refNow.getMonth() && d.getFullYear() === refNow.getFullYear();
  };
  const leadInSelectedRange = (l: Lead) => dateInRange(l.createdAtStr, mapDateRangeToKey(dateRange), today, summaryCustomRange);

  // Custom date-range calendar pill (toolbar) — the shared CRM
  // DateRangePicker. Independent of the summary-card preset above; null =
  // no custom range (every lead).
  const [appliedCustomRange, setAppliedCustomRange] = useState<DateRangeValue | null>(null);

  // Data Calling Analytics tab — its own Sub-Source scope, Filter drawer
  // (Source Performance table's extra columns), and chart controls. Shares
  // the page's existing calendar (appliedCustomRange, above) rather than
  // keeping a second date filter, so both tabs stay in sync on "when".
  // [] = every source.
  const [analyticsSubSources, setAnalyticsSubSources] = useState<string[]>([]);

  const [isAnalyticsFilterOpen, setIsAnalyticsFilterOpen] = useState(false);
  const [analyticsVisibleColumns, setAnalyticsVisibleColumns] = useState<Record<AnalyticsColumnKey, boolean>>(ANALYTICS_DEFAULT_VISIBLE_COLUMNS);
  const toggleAnalyticsColumn = (key: AnalyticsColumnKey) => setAnalyticsVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleSelectAllAnalyticsColumns = () => {
    const allOn = ANALYTICS_COLUMNS.every(c => analyticsVisibleColumns[c.key]);
    const next: Record<AnalyticsColumnKey, boolean> = { ...analyticsVisibleColumns };
    ANALYTICS_COLUMNS.forEach(c => { next[c.key] = !allOn; });
    setAnalyticsVisibleColumns(next);
  };

  const [salespersonSearchOpen, setSalespersonSearchOpen] = useState(false);
  const [salespersonSearch, setSalespersonSearch] = useState("");
  const [sourceSearchOpen, setSourceSearchOpen] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");

  const [analyticsChartMetric, setAnalyticsChartMetric] = useState<AnalyticsChartMetric>("Qualified");

  // Analytics tab's own stat-card drill-down — same click-to-expand pattern
  // as the Data Calling tab's cards above, kept as separate state so the two
  // tabs' drill-downs don't fight over which category/page is open.
  const [analyticsSelectedCategory, setAnalyticsSelectedCategory] = useState<string | null>(null);
  const [analyticsDrillSearchQuery, setAnalyticsDrillSearchQuery] = useState("");
  const [analyticsDrillPage, setAnalyticsDrillPage] = useState(1);
  const [analyticsDrillRowsPerPage, setAnalyticsDrillRowsPerPage] = useState(8);
  const analyticsDrillScrollRef = useRef<HTMLDivElement>(null);
  const analyticsDrillPageRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const analyticsDrillProgrammaticScroll = useRef(false);

  const handleAnalyticsDrillScroll = () => {
    if (analyticsDrillProgrammaticScroll.current) return;
    const container = analyticsDrillScrollRef.current;
    if (!container) return;
    const scrollTop = container.scrollTop;
    let current = 1;
    for (let i = 0; i < analyticsDrillPageRowRefs.current.length; i++) {
      const row = analyticsDrillPageRowRefs.current[i];
      if (row && row.offsetTop - container.offsetTop <= scrollTop + 4) {
        current = i + 1;
      }
    }
    setAnalyticsDrillPage(prev => (prev !== current ? current : prev));
  };

  const goToAnalyticsDrillPage = (page: number, totalPages: number) => {
    const clamped = Math.max(1, Math.min(totalPages, page));
    setAnalyticsDrillPage(clamped);
    const row = analyticsDrillPageRowRefs.current[clamped - 1];
    const container = analyticsDrillScrollRef.current;
    if (!row || !container) return;
    analyticsDrillProgrammaticScroll.current = true;
    container.scrollTop = clamped === 1 ? 0 : row.offsetTop - container.offsetTop;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { analyticsDrillProgrammaticScroll.current = false; });
    });
  };

  const toggleAnalyticsCategory = (label: string) => {
    setAnalyticsSelectedCategory(prev => (prev === label ? null : label));
    setAnalyticsDrillSearchQuery("");
    setAnalyticsDrillPage(1);
  };

  // Each summary card's real underlying lead list — same predicates the
  // numbers below use — so clicking a card can drill into exactly what it
  // counted, same "open the respective card" pattern as the CRM Dashboard
  // and Campaigns page. Every card here now respects Date Range (not just
  // Total, like this page used to do) — same page-wide decision already
  // applied to the Dashboard/Campaigns pages, so a lead outside the
  // selected range no longer silently inflates RNR/Not Qualified/etc.
  const categoryLeads: Record<string, Lead[]> = useMemo(() => ({
    "Total Leads Assigned": leads.filter(l => !!l.assignedAgent),
    "Calls Made": leads.filter(l => l.logs && l.logs.length > 0),
    // Qualified/Not Qualified is Data Calling's own Connected sub-status
    // (see updateLeadStatus), not a CRM-wide status list — a
    // Connected+Not-Qualified lead must not also count as "qualified".
    "Qualified Leads": leads.filter(l => l.subStatus === "Qualified"),
    "RNR": leads.filter(l => l.status === "RNR"),
    "Not Qualified": leads.filter(l => l.subStatus === "Not Qualified")
  }), [leads]);

  const categoryLeadsInRange = useMemo(() => {
    const out: Record<string, Lead[]> = {};
    Object.entries(categoryLeads).forEach(([key, list]) => {
      out[key] = list.filter(leadInSelectedRange);
    });
    return out;
  }, [categoryLeads, dateRange, summaryCustomRange]);

  // Summary metrics — real, no hardcoded fallbacks.
  const summaryMetrics = useMemo(() => ({
    totalAssigned: categoryLeadsInRange["Total Leads Assigned"].length,
    callsMade: categoryLeadsInRange["Calls Made"].length,
    qualifiedLeads: categoryLeadsInRange["Qualified Leads"].length,
    rnr: categoryLeadsInRange["RNR"].length,
    notQualified: categoryLeadsInRange["Not Qualified"].length
  }), [categoryLeadsInRange]);

  // Analytics tab derived data — scoped by the page's shared calendar range
  // (appliedCustomRange) and, for everything except Source Performance, by
  // whichever Sub-Source is selected up top. Source Performance deliberately
  // stays unscoped by Sub-Source — it's the breakdown ACROSS every source.
  const leadMatchesAppliedRange = (l: Lead): boolean => {
    if (!appliedCustomRange) return true;
    if (!l.createdAtStr) return false;
    const d = new Date(l.createdAtStr);
    if (isNaN(d.getTime())) return false;
    const start = new Date(appliedCustomRange.start);
    const end = new Date(appliedCustomRange.end);
    end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  };

  const analyticsDateFilteredLeads = useMemo(
    () => leads.filter(leadMatchesAppliedRange),
    [leads, appliedCustomRange]
  );

  const dataCallSources = useMemo(
    () => Array.from(new Set(leads.map(l => l.source).filter((s): s is string => !!s))).sort(),
    [leads]
  );

  const subSourceScopedLeads = useMemo(
    () => analyticsSubSources.length === 0
      ? analyticsDateFilteredLeads
      : analyticsDateFilteredLeads.filter(l => !!l.source && analyticsSubSources.includes(l.source)),
    [analyticsDateFilteredLeads, analyticsSubSources]
  );

  const analyticsSummaryMetrics = useMemo(() => ({
    totalAssigned: subSourceScopedLeads.filter(l => !!l.assignedAgent).length,
    callsMade: subSourceScopedLeads.filter(l => l.logs && l.logs.length > 0).length,
    qualifiedLeads: subSourceScopedLeads.filter(l => l.subStatus === "Qualified").length,
    rnr: subSourceScopedLeads.filter(l => l.status === "RNR").length,
    notQualified: subSourceScopedLeads.filter(l => l.subStatus === "Not Qualified").length
  }), [subSourceScopedLeads]);

  // Real underlying lead list behind each Analytics stat card, keyed the
  // same way as the Data Calling tab's own categoryLeadsInRange — so
  // clicking a card here drills into exactly what it counted.
  const analyticsCategoryLeads: Record<string, Lead[]> = useMemo(() => ({
    "Total Leads Assigned": subSourceScopedLeads.filter(l => !!l.assignedAgent),
    "Calls Made": subSourceScopedLeads.filter(l => l.logs && l.logs.length > 0),
    "Qualified Leads": subSourceScopedLeads.filter(l => l.subStatus === "Qualified"),
    "RNR": subSourceScopedLeads.filter(l => l.status === "RNR"),
    "Not Qualified": subSourceScopedLeads.filter(l => l.subStatus === "Not Qualified")
  }), [subSourceScopedLeads]);

  const salespersonRows = useMemo(
    () => computeAnalyticsPerformanceRows(subSourceScopedLeads, l => l.assignedAgent),
    [subSourceScopedLeads]
  );
  const filteredSalespersonRows = useMemo(() => {
    const q = salespersonSearch.trim().toLowerCase();
    return q ? salespersonRows.filter(r => r.name.toLowerCase().includes(q)) : salespersonRows;
  }, [salespersonRows, salespersonSearch]);

  const sourceRows = useMemo(
    () => computeAnalyticsPerformanceRows(analyticsDateFilteredLeads, l => l.source),
    [analyticsDateFilteredLeads]
  );
  const filteredSourceRows = useMemo(() => {
    const q = sourceSearch.trim().toLowerCase();
    return q ? sourceRows.filter(r => r.name.toLowerCase().includes(q)) : sourceRows;
  }, [sourceRows, sourceSearch]);

  // Salesperson/Source Performance pagination — back to page 1 whenever the
  // table's own search or the page-wide scope (date range, Sub-Source) changes.
  const salespersonPagination = usePagination(
    filteredSalespersonRows,
    10,
    JSON.stringify([salespersonSearch, analyticsSubSources, appliedCustomRange])
  );
  const sourcePagination = usePagination(
    filteredSourceRows,
    10,
    JSON.stringify([sourceSearch, appliedCustomRange])
  );

  // Performance Line Graph — one point per real calendar day, either the
  // last 7 days (default) or the applied custom range (capped at 31 points
  // so a huge range doesn't render an unreadable chart).
  const chartDays = useMemo(() => {
    const end = appliedCustomRange ? new Date(appliedCustomRange.end) : new Date();
    const start = appliedCustomRange
      ? new Date(appliedCustomRange.start)
      : new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6);
    const days: Date[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cursor <= last && days.length < 31) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [appliedCustomRange]);

  const chartData = useMemo(() => {
    return chartDays.map(day => {
      const dayStr = day.toDateString();
      const dayLeads = subSourceScopedLeads.filter(l => l.createdAtStr && new Date(l.createdAtStr).toDateString() === dayStr);
      const value = dayLeads.filter(l => analyticsLeadMatchesMetric(l, analyticsChartMetric)).length;
      return {
        label: day.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        value
      };
    });
  }, [chartDays, subSourceScopedLeads, analyticsChartMetric]);

  const chartAverage = chartData.length > 0
    ? chartData.reduce((sum, d) => sum + d.value, 0) / chartData.length
    : 0;

  // Stat-card drill-down — clicking a card shows the real leads it counted,
  // same scroll-spy + synced-pagination pattern as the Campaigns page's
  // drill-down: rows render continuously in a capped-height scroll
  // container, scrolling past a page boundary advances drillPage, and the
  // pagination arrows scroll that page's first row back to the top.
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [drillSearchQuery, setDrillSearchQuery] = useState("");
  const [drillPage, setDrillPage] = useState(1);
  const [drillRowsPerPage, setDrillRowsPerPage] = useState(8);
  const drillScrollRef = useRef<HTMLDivElement>(null);
  const drillPageRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const drillProgrammaticScroll = useRef(false);

  const handleDrillScroll = () => {
    if (drillProgrammaticScroll.current) return;
    const container = drillScrollRef.current;
    if (!container) return;
    const scrollTop = container.scrollTop;
    let current = 1;
    for (let i = 0; i < drillPageRowRefs.current.length; i++) {
      const row = drillPageRowRefs.current[i];
      if (row && row.offsetTop - container.offsetTop <= scrollTop + 4) {
        current = i + 1;
      }
    }
    setDrillPage(prev => (prev !== current ? current : prev));
  };

  const goToDrillPage = (page: number, totalPages: number) => {
    const clamped = Math.max(1, Math.min(totalPages, page));
    setDrillPage(clamped);
    const row = drillPageRowRefs.current[clamped - 1];
    const container = drillScrollRef.current;
    if (!row || !container) return;
    drillProgrammaticScroll.current = true;
    container.scrollTop = clamped === 1 ? 0 : row.offsetTop - container.offsetTop;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { drillProgrammaticScroll.current = false; });
    });
  };

  const toggleCategory = (label: string) => {
    setSelectedCategory(prev => (prev === label ? null : label));
    setDrillSearchQuery("");
    setDrillPage(1);
  };

  // Table filters
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const statusOptions = useMemo(() => Array.from(new Set(leads.map(l => l.status))).sort(), [leads]);

  // Sub-status filter — Qualified/Not Qualified, only ever set while a
  // lead's status is Connected (see updateLeadStatus/backend). "—" covers
  // every lead that either isn't Connected or hasn't been given a
  // sub-status yet.
  const [subStatusFilters, setSubStatusFilters] = useState<string[]>([]);
  const SUB_STATUS_NONE = "—";
  const subStatusOptions = useMemo(
    () => Array.from(new Set(leads.map(l => l.subStatus || SUB_STATUS_NONE))).sort(),
    [leads]
  );

  const [assignedFilters, setAssignedFilters] = useState<string[]>([]);
  const assignedOptions = useMemo(() => Array.from(new Set(leads.map(l => l.assignedAgent).filter(Boolean))).sort(), [leads]);

  // Data Call Source filter — bulk upload's per-batch sub-source (e.g.
  // "Kashmiri Data") when set, else the ingestion source (Meta, Google Ads
  // Sheet, Bulk Upload, etc.). This is what lets an admin pull up one bulk
  // upload batch to filter → select all → Assign/Reshuffle as a group.
  const [dataCallSourceFilters, setDataCallSourceFilters] = useState<string[]>([]);
  const dataCallSourceOptions = useMemo(
    () => Array.from(new Set(leads.map(l => l.subSource || l.source).filter(Boolean) as string[])).sort(),
    [leads]
  );

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<DataCallingColumnKey, boolean>>(DATA_CALLING_DEFAULT_VISIBLE_COLUMNS);
  const toggleColumn = (key: DataCallingColumnKey) => setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleSelectAllColumns = () => {
    const allOn = DATA_CALLING_COLUMNS.every(c => visibleColumns[c.key]);
    const next: Record<DataCallingColumnKey, boolean> = { ...visibleColumns };
    DATA_CALLING_COLUMNS.forEach(c => { next[c.key] = !allOn; });
    setVisibleColumns(next);
  };

  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelectRow = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Bulk "Assign" toolbar button — only surfaces once the selection actually
  // contains an unassigned lead (per product decision: it's for handing out
  // fresh/unassigned leads, not for reassigning already-worked ones).
  // "Reshuffle" is the mirror image — only surfaces once the selection
  // contains a lead that's already assigned to someone, for handing an
  // already-worked lead to a different agent.
  const selectedUnassignedIds = useMemo(
    () => leads.filter(l => selectedIds.has(l.id) && isUnassignedLead(l)).map(l => l.id),
    [leads, selectedIds]
  );
  const selectedAssignedIds = useMemo(
    () => leads.filter(l => selectedIds.has(l.id) && !isUnassignedLead(l)).map(l => l.id),
    [leads, selectedIds]
  );

  // Assign/Reshuffle share one modal — same two-field, property-scopes-
  // assignee mechanics either way. `assignFlowMode` picks which of the two
  // button clicks opened it, which in turn picks the target lead set, the
  // modal's copy, and whether confirming also clears "Unassigned" status.
  // A property must be picked first (it scopes which agents are even
  // eligible — an agent "connected" to a property is one on that
  // property's assignedTeam, same restriction the Properties page's
  // CUSTOM_MEMBERS mode enforces; ALL_MEMBERS properties open it to every
  // agent), then the Assignee field unlocks. Both fields need a value
  // before the modal's own confirm button goes live.
  const [assignFlowMode, setAssignFlowMode] = useState<"assign" | "reshuffle" | null>(null);
  const flowTargetIds = assignFlowMode === "reshuffle" ? selectedAssignedIds : selectedUnassignedIds;
  const [assignSelectedPropertyIds, setAssignSelectedPropertyIds] = useState<Set<string>>(new Set());
  const [assignSelectedAssigneeId, setAssignSelectedAssigneeId] = useState<string>("");

  const eligibleAssignees = useMemo(() => {
    if (assignSelectedPropertyIds.size === 0) return [];
    const selectedProps = properties.filter(p => assignSelectedPropertyIds.has(p.id));
    let anyAllMembers = false;
    const restrictedIds = new Set<string>();
    selectedProps.forEach(p => {
      if (p.teamAssignmentMode === "CUSTOM_MEMBERS" && p.assignedTeam && p.assignedTeam.length > 0) {
        p.assignedTeam.forEach(m => restrictedIds.add(m.userId));
      } else {
        anyAllMembers = true;
      }
    });
    return anyAllMembers ? users.filter(u => u.role === "AGENT") : users.filter(u => restrictedIds.has(u.id));
  }, [assignSelectedPropertyIds, properties, users]);
  const selectedAssigneeName = useMemo(
    () => users.find(u => u.id === assignSelectedAssigneeId)?.name || "",
    [users, assignSelectedAssigneeId]
  );
  const canConfirmAssign = assignSelectedPropertyIds.size > 0 && !!assignSelectedAssigneeId;

  const openAssignFlow = (mode: "assign" | "reshuffle") => {
    setAssignSelectedPropertyIds(new Set());
    setAssignSelectedAssigneeId("");
    setAssignFlowMode(mode);
  };
  const closeAssignFlow = () => setAssignFlowMode(null);
  const changePropertySelection = (ids: string[]) => {
    setAssignSelectedPropertyIds(new Set(ids));
    // Property set changed — an assignee chosen under the old scope may no
    // longer be eligible, so make the admin re-pick rather than silently
    // keep a stale selection.
    setAssignSelectedAssigneeId("");
  };
  const confirmBulkAssign = () => {
    if (!canConfirmAssign || !assignFlowMode) return;
    const agentName = selectedAssigneeName;
    const targetIds = flowTargetIds;
    targetIds.forEach(id => {
      const lead = leads.find(l => l.id === id);
      reassignLead(id, agentName);
      // Move it off the "Unassigned" pipeline state now that it actually has
      // someone on it — otherwise it'd stay eligible for the Assign button.
      // "New Lead" (not "Assigned") since Data Calling's status model is
      // deliberately just New Lead/RNR/Connected. Not relevant to Reshuffle:
      // those leads already have a real status.
      if (assignFlowMode === "assign" && lead?.status === "Unassigned") updateLeadStatus(id, "New Lead");
    });
    setSelectedIds(prev => {
      const next = new Set(prev);
      targetIds.forEach(id => next.delete(id));
      return next;
    });
    closeAssignFlow();
  };

  // Individual lead view — same LeadDetailDrawer the main admin dashboard
  // uses, opened by clicking a lead's name, but scoped to Data Calling's
  // own restricted status model (see statusOptions/restrictedStatuses below).
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // RNR and Connected can't commit as a bare status change — RNR always
  // needs a next-call date (scheduled the same way Follow-up/Call Back
  // does elsewhere, via addFollowupCall) and Connected always needs a
  // Qualified/Not Qualified sub-status (see updateLeadStatus). Picking
  // either from the row Status dropdown opens this modal instead of
  // committing immediately; New Lead still commits straight away.
  const [pendingStatusAction, setPendingStatusAction] = useState<{ leadId: string; leadName: string; status: "RNR" | "Connected" } | null>(null);
  const [rnrDate, setRnrDate] = useState("");
  const [rnrTime, setRnrTime] = useState("10:00");
  const [pendingActionError, setPendingActionError] = useState<string | null>(null);

  const openStatusChange = (lead: Lead, status: Lead["status"]) => {
    if (status === "RNR" || status === "Connected") {
      setPendingActionError(null);
      setRnrDate("");
      setRnrTime("10:00");
      setPendingStatusAction({ leadId: lead.id, leadName: lead.name, status });
      return;
    }
    updateLeadStatus(lead.id, status);
  };

  const confirmRnr = () => {
    if (!pendingStatusAction) return;
    if (!rnrDate) {
      setPendingActionError("Please select the next calling date.");
      return;
    }
    const lead = leads.find(l => l.id === pendingStatusAction.leadId);
    updateLeadStatus(pendingStatusAction.leadId, "RNR");
    addFollowupCall({
      scheduledAt: new Date(`${rnrDate}T${rnrTime}`).toISOString(),
      leadId: pendingStatusAction.leadId,
      leadName: pendingStatusAction.leadName,
      phone: lead?.phone,
      callType: "CALLBACK",
      assignedToName: lead?.assignedAgent || ""
    });
    setPendingStatusAction(null);
  };

  const confirmConnected = (subStatus: "Qualified" | "Not Qualified") => {
    if (!pendingStatusAction) return;
    updateLeadStatus(pendingStatusAction.leadId, "Connected", undefined, undefined, subStatus);
    setPendingStatusAction(null);
  };

  const copyToClipboard = (text: string) => {
    if (text) navigator.clipboard?.writeText(text).catch(() => {});
  };

  const latestLogMessage = (l: Lead): string => {
    if (!l.logs || l.logs.length === 0) return "No feedback yet";
    const sorted = [...l.logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return sorted[0].message;
  };
  const nextCallDateFor = (leadId: string): string => {
    const upcoming = followupCalls
      .filter(f => f.leadId === leadId && f.status === "Upcoming")
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    if (upcoming.length === 0) return "—";
    const f = upcoming[0];
    const parsed = new Date(`${f.date} ${f.time}`);
    if (isNaN(parsed.getTime())) return `${f.date} ${f.time}`;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${f.date} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:00`;
  };

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter(l => {
      const matchesSearch = !q || l.name.toLowerCase().includes(q);
      const matchesStatus = statusFilters.length === 0 || statusFilters.includes(l.status);
      const matchesAssigned = assignedFilters.length === 0 || assignedFilters.includes(l.assignedAgent);
      const matchesDataCallSource = dataCallSourceFilters.length === 0 || dataCallSourceFilters.includes(l.subSource || l.source || "");
      const matchesSubStatus = subStatusFilters.length === 0 || subStatusFilters.includes(l.subStatus || SUB_STATUS_NONE);
      const matchesDate = appliedCustomRange
        ? (() => {
            if (!l.createdAtStr) return false;
            const d = new Date(l.createdAtStr);
            if (isNaN(d.getTime())) return false;
            const start = new Date(appliedCustomRange.start);
            const end = new Date(appliedCustomRange.end);
            end.setHours(23, 59, 59, 999);
            return d >= start && d <= end;
          })()
        : true;
      return matchesSearch && matchesStatus && matchesAssigned && matchesDataCallSource && matchesSubStatus && matchesDate;
    });
  }, [leads, searchQuery, statusFilters, assignedFilters, dataCallSourceFilters, subStatusFilters, appliedCustomRange]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / rowsPerPage));
  const currentPageClamped = Math.min(currentPage, totalPages);
  const paginatedLeads = filteredLeads.slice((currentPageClamped - 1) * rowsPerPage, currentPageClamped * rowsPerPage);

  const allOnPageSelected = paginatedLeads.length > 0 && paginatedLeads.every(l => selectedIds.has(l.id));
  const toggleSelectAllOnPage = () => setSelectedIds(prev => {
    const next = new Set(prev);
    if (allOnPageSelected) paginatedLeads.forEach(l => next.delete(l.id));
    else paginatedLeads.forEach(l => next.add(l.id));
    return next;
  });

  const visibleColCount = (isAdmin ? 5 : 4) + DATA_CALLING_COLUMNS.filter(c => visibleColumns[c.key]).length;

  return (
    <div className="space-y-4 pb-8 animate-fade-in text-slate-800">
      {/* Top Toggle Switcher: Data Calling vs Data Calling Analytics */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="bg-slate-200/70 p-1 rounded-xl flex items-center gap-1">
          <button
            onClick={() => setActiveTab("DataCalling")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "DataCalling" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Data Calling
          </button>
          <button
            onClick={() => setActiveTab("Analytics")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "Analytics" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Data Calling Analytics
          </button>
        </div>
        {isAdmin && activeTab === "DataCalling" && (
          <button
            onClick={() => setIsUploadLeadsOpen(true)}
            className="inline-flex items-center gap-2 bg-[#0B1E6E] hover:bg-[#081650] text-white px-4 py-2.5 rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer shrink-0"
          >
            <Plus className="h-4 w-4" />
            Upload Leads
          </button>
        )}
      </div>

      {uploadSuccessMsg && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-100 text-[11px] text-emerald-700 rounded-xl font-bold flex items-center gap-2 animate-fade-in shadow-sm">
          <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span>{uploadSuccessMsg}</span>
        </div>
      )}

      {/* Date Filter & Metrics — same unified card pattern as the CRM
          Dashboard/Campaigns pages: a header bar (date range) sitting
          directly on the stat columns, no separate padded/shadowed cards. */}
      {activeTab === "DataCalling" && (
      <div className="bg-slate-100/70 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center px-4 py-2.5 text-[11px] border-b border-slate-200/60">
          <div className="flex items-center gap-1.5 font-bold text-slate-700">
            <span className="font-normal text-slate-500">Date Range</span>
            <DateRangeSelect
              value={dateRange}
              customValue="Custom"
              customRange={summaryCustomRange}
              onPresetChange={(v) => { setDateRange(v); setSummaryCustomRange(null); }}
              onCustomApply={(range) => { setSummaryCustomRange(range); setDateRange("Custom"); }}
              options={(["Today", "Yesterday", "This Week", "This Month", "All Time"] as const).map(v => ({ value: v, label: v }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          {([
            { label: "Total Leads Assigned", value: summaryMetrics.totalAssigned, color: "text-slate-900" },
            { label: "Calls Made", value: summaryMetrics.callsMade, color: "text-slate-900" },
            { label: "Qualified Leads", value: summaryMetrics.qualifiedLeads, color: "text-rose-600" },
            { label: "RNR", value: summaryMetrics.rnr, color: "text-amber-500" },
            { label: "Not Qualified", value: summaryMetrics.notQualified, color: "text-red-500" }
          ] as const).map(s => {
            const isActive = selectedCategory === s.label;
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => toggleCategory(s.label)}
                className={`p-3 flex items-center justify-between text-left group transition-colors ${
                  isActive ? "bg-blue-50/70" : "hover:bg-slate-50/50"
                }`}
              >
                <div>
                  <span className="text-[11px] font-medium text-slate-500 block">{s.label}</span>
                  <span className={`text-lg font-extrabold mt-1.5 block ${s.color}`}>
                    {isDataLoading ? <LineSkeleton width={32} height={18} /> : s.value}
                  </span>
                </div>
                <ChevronRight className={`h-4 w-4 text-slate-300 shrink-0 transition-transform ${isActive ? "rotate-90 text-blue-500" : "group-hover:translate-x-0.5"}`} />
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* Sub-Source scope bar + summary cards — the Analytics tab's
          equivalent of the Data Calling tab's own Date Range bar above,
          scoped by data-call source instead of a date preset (the shared
          calendar in the toolbar below covers the "when"). */}
      {activeTab === "Analytics" && (
      <div className="bg-slate-100/70 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center px-4 py-2.5 text-[11px] border-b border-slate-200/60">
          <div className="flex items-center gap-1.5 font-bold text-slate-700">
            <span className="font-normal text-slate-500">Sub-Source</span>
            <SearchableMultiSelect
              selected={analyticsSubSources}
              onChange={setAnalyticsSubSources}
              options={dataCallSources}
              placeholder="All Sources"
              searchPlaceholder="Search sources..."
              panelWidth={180}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          {([
            { label: "Total Leads Assigned", value: analyticsSummaryMetrics.totalAssigned, color: "text-slate-900" },
            { label: "Calls Made", value: analyticsSummaryMetrics.callsMade, color: "text-slate-900" },
            { label: "Qualified Leads", value: analyticsSummaryMetrics.qualifiedLeads, color: "text-rose-600" },
            { label: "RNR", value: analyticsSummaryMetrics.rnr, color: "text-amber-500" },
            { label: "Not Qualified", value: analyticsSummaryMetrics.notQualified, color: "text-red-500" }
          ] as const).map(s => {
            const isActive = analyticsSelectedCategory === s.label;
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => toggleAnalyticsCategory(s.label)}
                className={`p-3 flex items-center justify-between text-left group transition-colors ${
                  isActive ? "bg-blue-50/70" : "hover:bg-slate-50/50"
                }`}
              >
                <div>
                  <span className="text-[11px] font-medium text-slate-500 block">{s.label}</span>
                  <span className={`text-lg font-extrabold mt-1.5 block ${s.color}`}>
                    {isDataLoading ? <LineSkeleton width={32} height={18} /> : s.value}
                  </span>
                </div>
                <ChevronRight className={`h-4 w-4 text-slate-300 shrink-0 transition-transform ${isActive ? "rotate-90 text-blue-500" : "group-hover:translate-x-0.5"}`} />
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* Analytics stat-card drill-down — same pattern as the Data Calling
          tab's own drill-down, scoped to whichever Sub-Source is selected. */}
      {activeTab === "Analytics" && analyticsSelectedCategory && (() => {
        const q = analyticsDrillSearchQuery.trim().toLowerCase();
        const shownLeads = (analyticsCategoryLeads[analyticsSelectedCategory] || []).filter(l =>
          !q || l.name.toLowerCase().includes(q) || l.phone.includes(q) || (l.assignedAgent || "").toLowerCase().includes(q)
        );
        const shownCount = shownLeads.length;
        const totalPages = Math.max(1, Math.ceil(shownCount / analyticsDrillRowsPerPage));
        const currentPage = Math.min(analyticsDrillPage, totalPages);

        return (
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200/80 gap-3">
              <h3 className="text-sm font-bold text-slate-900 whitespace-nowrap">
                {analyticsSelectedCategory}
                <span className="text-slate-400 font-medium ml-1.5">({shownCount})</span>
              </h3>
              <div className="flex items-center gap-3 flex-1 justify-end">
                <div className="relative w-full max-w-[220px]">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={analyticsDrillSearchQuery}
                    onChange={(e) => { setAnalyticsDrillSearchQuery(e.target.value); setAnalyticsDrillPage(1); }}
                    placeholder="Search name, phone, agent..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:border-[#0B1E6E]"
                  />
                </div>
                <button type="button" onClick={() => setAnalyticsSelectedCategory(null)} className="text-slate-400 hover:text-slate-700 shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div ref={analyticsDrillScrollRef} onScroll={handleAnalyticsDrillScroll} className="max-h-80 overflow-y-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-500">
                    <th className="px-5 py-2.5">Name</th>
                    <th className="px-5 py-2.5">Phone</th>
                    <th className="px-5 py-2.5">Status</th>
                    <th className="px-5 py-2.5">Assigned To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[12px] text-slate-700">
                  {isDataLoading && shownLeads.length === 0 ? (
                    <TableRowsSkeleton rows={6} columns={4} />
                  ) : shownLeads.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-center text-slate-400 italic">
                        No leads found for this category.
                      </td>
                    </tr>
                  ) : (
                    (analyticsDrillPageRowRefs.current = [], shownLeads.map((l, idx) => (
                      <tr
                        key={l.id}
                        ref={idx % analyticsDrillRowsPerPage === 0 ? (el) => { analyticsDrillPageRowRefs.current[Math.floor(idx / analyticsDrillRowsPerPage)] = el; } : undefined}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-5 py-2.5 font-semibold text-slate-900">{l.name}</td>
                        <td className="px-5 py-2.5 font-mono">{l.phone}</td>
                        <td className="px-5 py-2.5">{l.status}</td>
                        <td className="px-5 py-2.5">{l.assignedAgent || "—"}</td>
                      </tr>
                    )))
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              totalRows={shownCount}
              page={currentPage}
              rowsPerPage={analyticsDrillRowsPerPage}
              onPageChange={(p) => goToAnalyticsDrillPage(p, totalPages)}
              onRowsPerPageChange={(n) => {
                analyticsDrillProgrammaticScroll.current = true;
                setAnalyticsDrillRowsPerPage(n);
                setAnalyticsDrillPage(1);
                analyticsDrillScrollRef.current?.scrollTo(0, 0);
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => { analyticsDrillProgrammaticScroll.current = false; });
                });
              }}
              rowsPerPageOptions={[8, 25, 50, 100]}
              rowLabel="Lead"
            />
          </div>
        );
      })()}

      {/* Stat-card drill-down — the real leads behind whichever card was
          last clicked, same pattern as the Campaigns page's drill-down. */}
      {activeTab === "DataCalling" && selectedCategory && (() => {
        const q = drillSearchQuery.trim().toLowerCase();
        const shownLeads = (categoryLeadsInRange[selectedCategory] || []).filter(l =>
          !q || l.name.toLowerCase().includes(q) || l.phone.includes(q) || (l.assignedAgent || "").toLowerCase().includes(q)
        );
        const shownCount = shownLeads.length;
        const totalPages = Math.max(1, Math.ceil(shownCount / drillRowsPerPage));
        const currentPage = Math.min(drillPage, totalPages);

        return (
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200/80 gap-3">
              <h3 className="text-sm font-bold text-slate-900 whitespace-nowrap">
                {selectedCategory}
                <span className="text-slate-400 font-medium ml-1.5">({shownCount})</span>
              </h3>
              <div className="flex items-center gap-3 flex-1 justify-end">
                <div className="relative w-full max-w-[220px]">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={drillSearchQuery}
                    onChange={(e) => { setDrillSearchQuery(e.target.value); setDrillPage(1); }}
                    placeholder="Search name, phone, agent..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:border-[#0B1E6E]"
                  />
                </div>
                <button type="button" onClick={() => setSelectedCategory(null)} className="text-slate-400 hover:text-slate-700 shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div ref={drillScrollRef} onScroll={handleDrillScroll} className="max-h-80 overflow-y-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-500">
                    <th className="px-5 py-2.5">Name</th>
                    <th className="px-5 py-2.5">Phone</th>
                    <th className="px-5 py-2.5">Status</th>
                    <th className="px-5 py-2.5">Assigned To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[12px] text-slate-700">
                  {isDataLoading && shownLeads.length === 0 ? (
                    <TableRowsSkeleton rows={6} columns={4} />
                  ) : shownLeads.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-center text-slate-400 italic">
                        No leads found for this category.
                      </td>
                    </tr>
                  ) : (
                    (drillPageRowRefs.current = [], shownLeads.map((l, idx) => (
                      <tr
                        key={l.id}
                        ref={idx % drillRowsPerPage === 0 ? (el) => { drillPageRowRefs.current[Math.floor(idx / drillRowsPerPage)] = el; } : undefined}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="px-5 py-2.5 font-semibold text-slate-900">{l.name}</td>
                        <td className="px-5 py-2.5 font-mono">{l.phone}</td>
                        <td className="px-5 py-2.5">{l.status}</td>
                        <td className="px-5 py-2.5">{l.assignedAgent || "—"}</td>
                      </tr>
                    )))
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              totalRows={shownCount}
              page={currentPage}
              rowsPerPage={drillRowsPerPage}
              onPageChange={(p) => goToDrillPage(p, totalPages)}
              onRowsPerPageChange={(n) => {
                drillProgrammaticScroll.current = true;
                setDrillRowsPerPage(n);
                setDrillPage(1);
                drillScrollRef.current?.scrollTo(0, 0);
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => { drillProgrammaticScroll.current = false; });
                });
              }}
              rowsPerPageOptions={[8, 25, 50, 100]}
              rowLabel="Lead"
            />
          </div>
        );
      })()}

      {/* Action Toolbar (Bulk Assign/Reshuffle, Date Picker Pill, Filter Button) —
              shared by both tabs; the Filter button targets whichever tab's own
              column drawer is relevant, and the calendar always drives the
              same appliedCustomRange so both tabs agree on "when". */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
            {activeTab === "DataCalling" && isAdmin && selectedUnassignedIds.length > 0 && (
              <button
                type="button"
                onClick={() => openAssignFlow("assign")}
                className="flex items-center gap-2 bg-white border border-slate-300/80 rounded-xl px-3.5 py-1.5 text-xs text-slate-700 font-semibold hover:bg-slate-50 shadow-2xs transition-colors"
              >
                <Users className="h-3.5 w-3.5 text-blue-600" />
                Assign
              </button>
            )}
            {activeTab === "DataCalling" && isAdmin && selectedAssignedIds.length > 0 && (
              <button
                type="button"
                onClick={() => openAssignFlow("reshuffle")}
                className="flex items-center gap-2 bg-white border border-slate-300/80 rounded-xl px-3.5 py-1.5 text-xs text-slate-700 font-semibold hover:bg-slate-50 shadow-2xs transition-colors"
              >
                <Users className="h-3.5 w-3.5 text-blue-600" />
                Reshuffle
              </button>
            )}
            <DateRangePicker
              value={appliedCustomRange}
              onChange={(v) => {
                setAppliedCustomRange(v);
                setCurrentPage(1);
              }}
              emptyLabel={formatDisplayDate(todayIso())}
            />

            <button
              type="button"
              onClick={() => (activeTab === "DataCalling" ? setIsFilterOpen(true) : setIsAnalyticsFilterOpen(true))}
              className="flex items-center gap-2 border border-slate-300/80 bg-white rounded-xl px-3.5 py-1.5 text-xs text-slate-700 font-semibold hover:bg-slate-50 shadow-2xs transition-colors"
            >
              <Sliders className="h-3.5 w-3.5 text-blue-600" />
              Filter
            </button>
          </div>

          {activeTab === "Analytics" ? (
          <div className="space-y-4">
            {/* Salesperson Performance */}
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200/80">
                <h3 className="text-sm font-bold text-slate-900">Salesperson Performance</h3>
              </div>
              <div className="overflow-auto max-h-[55vh]">
                <table className="w-full text-left border-collapse min-w-[720px]">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b border-slate-200/80 text-[12px] font-bold text-slate-900">
                      <th className="px-5 py-3 w-48">
                        {salespersonSearchOpen ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={salespersonSearch}
                              onChange={(e) => setSalespersonSearch(e.target.value)}
                              placeholder="Filter salesperson..."
                              className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs font-normal focus:outline-none w-36"
                            />
                            <button onClick={() => { setSalespersonSearch(""); setSalespersonSearchOpen(false); }} className="text-slate-400 hover:text-slate-600">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span>Salesperson Name</span>
                            <button onClick={() => setSalespersonSearchOpen(true)} className="text-slate-400 hover:text-slate-700" title="Search salesperson">
                              <Search className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </th>
                      <th className="px-5 py-3 whitespace-nowrap">Leads Assgned</th>
                      <th className="px-5 py-3 whitespace-nowrap">Calls Made</th>
                      <th className="px-5 py-3 whitespace-nowrap">Connected</th>
                      <th className="px-5 py-3 whitespace-nowrap">Qualified Leads</th>
                      <th className="px-5 py-3 whitespace-nowrap">RNR</th>
                      <th className="px-5 py-3 whitespace-nowrap">Qualification Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[13px] text-slate-700">
                    {isDataLoading && filteredSalespersonRows.length === 0 ? (
                      <TableRowsSkeleton rows={6} columns={7} />
                    ) : filteredSalespersonRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-8 text-center text-slate-400 italic">No salesperson activity found for this scope.</td>
                      </tr>
                    ) : (
                      salespersonPagination.pageRows.map(r => (
                        <tr key={r.name} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3 font-semibold text-slate-900">{r.name}</td>
                          <td className="px-5 py-3">{r.totalLeads}</td>
                          <td className="px-5 py-3">{r.callsMade}</td>
                          <td className="px-5 py-3">{r.connected}</td>
                          <td className="px-5 py-3">{r.qualifiedLeads}</td>
                          <td className="px-5 py-3">{r.rnr}</td>
                          <td className="px-5 py-3">{r.qualificationRate}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <TablePagination {...salespersonPagination.paginationProps} rowLabel="Salesperson" />
            </div>

            {/* Performance Line Graph */}
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-3 gap-2">
                <h3 className="text-sm font-bold text-slate-900">Performance Line Graph</h3>
                <SearchableMultiSelect
                  selected={analyticsSubSources}
                  onChange={setAnalyticsSubSources}
                  options={dataCallSources}
                  placeholder="All Sources"
                  searchPlaceholder="Search sources..."
                  panelWidth={180}
                  align="right"
                />
              </div>
              {chartData.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-xs text-slate-400 italic">No data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      formatter={(v) => [Number(v), analyticsChartMetric]}
                      labelStyle={{ fontSize: 11, fontWeight: 600 }}
                      contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: "#e2e8f0" }}
                    />
                    <ReferenceLine y={chartAverage} stroke="#6366f1" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="value" name={analyticsChartMetric} stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
              <div className="mt-2">
                <SearchableSelect
                  variant="pill"
                  value={analyticsChartMetric}
                  onChange={(v) => setAnalyticsChartMetric(v as AnalyticsChartMetric)}
                  options={[...ANALYTICS_CHART_METRICS]}
                  searchPlaceholder="Search metrics..."
                  panelWidth={140}
                />
              </div>
            </div>

            {/* Source Performance — flat, borderless card, sized to match
                the Salesperson Performance/Performance Line Graph cards
                above rather than standing out oversized. */}
            <div className="bg-white rounded-2xl p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Source Performance</h3>
              <div className="overflow-auto max-h-[55vh]">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b border-slate-200 text-[12px] font-bold text-slate-900">
                      <th className="pr-5 pb-3 w-48">
                        {sourceSearchOpen ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={sourceSearch}
                              onChange={(e) => setSourceSearch(e.target.value)}
                              placeholder="Filter source..."
                              className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs font-normal focus:outline-none w-36"
                            />
                            <button onClick={() => { setSourceSearch(""); setSourceSearchOpen(false); }} className="text-slate-400 hover:text-slate-600">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span>Sub-Source Name</span>
                            <button onClick={() => setSourceSearchOpen(true)} className="text-slate-400 hover:text-slate-700" title="Search sub-source">
                              <Search className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </th>
                      <th className="px-5 pb-3 whitespace-nowrap">Total Leads</th>
                      <th className="px-5 pb-3 whitespace-nowrap">Calls Made</th>
                      <th className="px-5 pb-3 whitespace-nowrap">Connected</th>
                      <th className="px-5 pb-3 whitespace-nowrap">Qualified Leads</th>
                      <th className="px-5 pb-3 whitespace-nowrap">RNR</th>
                      <th className="px-5 pb-3 whitespace-nowrap">Qualification Rate</th>
                      {analyticsVisibleColumns.unqualifiedLeads && <th className="px-5 pb-3 whitespace-nowrap">Unqualified Leads</th>}
                      {analyticsVisibleColumns.siteVisit && <th className="px-5 pb-3 whitespace-nowrap">Site Visits</th>}
                      {analyticsVisibleColumns.status && <th className="px-5 pb-3 whitespace-nowrap">Status</th>}
                      {analyticsVisibleColumns.cpl && <th className="px-5 pb-3 whitespace-nowrap">CPL</th>}
                      {analyticsVisibleColumns.qcpl && <th className="px-5 pb-3 whitespace-nowrap">QCPL</th>}
                      {analyticsVisibleColumns.ctr && <th className="px-5 pb-3 whitespace-nowrap">CTR</th>}
                      {analyticsVisibleColumns.clicks && <th className="px-5 pb-3 whitespace-nowrap">Clicks</th>}
                      {analyticsVisibleColumns.impressions && <th className="px-5 pb-3 whitespace-nowrap">Impressions</th>}
                      {analyticsVisibleColumns.adSetName && <th className="px-5 pb-3 whitespace-nowrap">Ad set name</th>}
                      {analyticsVisibleColumns.source && <th className="px-5 pb-3 whitespace-nowrap">Source</th>}
                      {analyticsVisibleColumns.date && <th className="px-5 pb-3 whitespace-nowrap">Date</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[13px] text-slate-700">
                    {isDataLoading && filteredSourceRows.length === 0 ? (
                      <TableRowsSkeleton rows={6} columns={7 + ANALYTICS_COLUMNS.filter(c => c.key !== "qualifiedLeads" && analyticsVisibleColumns[c.key]).length} />
                    ) : filteredSourceRows.length === 0 ? (
                      <tr>
                        <td colSpan={7 + ANALYTICS_COLUMNS.filter(c => c.key !== "qualifiedLeads" && analyticsVisibleColumns[c.key]).length} className="px-5 py-8 text-center text-slate-400 italic">
                          No data-call source activity found.
                        </td>
                      </tr>
                    ) : (
                      sourcePagination.pageRows.map(r => (
                        <tr key={r.name} className="hover:bg-slate-50/50 transition-colors">
                          <td className="pr-5 py-3 font-medium text-slate-900">{r.name}</td>
                          <td className="px-5 py-3">{r.totalLeads.toLocaleString()}</td>
                          <td className="px-5 py-3">{r.callsMade.toLocaleString()}</td>
                          <td className="px-5 py-3">{r.connected.toLocaleString()}</td>
                          <td className="px-5 py-3">{r.qualifiedLeads.toLocaleString()}</td>
                          <td className="px-5 py-3">{r.rnr.toLocaleString()}</td>
                          <td className="px-5 py-3">{r.qualificationRate}</td>
                          {analyticsVisibleColumns.unqualifiedLeads && <td className="px-5 py-3">{r.unqualifiedLeads.toLocaleString()}</td>}
                          {analyticsVisibleColumns.siteVisit && <td className="px-5 py-3">{r.siteVisits.toLocaleString()}</td>}
                          {analyticsVisibleColumns.status && <td className="px-5 py-3 text-slate-300" title="Not applicable — this is an aggregate row, not a single lead">—</td>}
                          {analyticsVisibleColumns.cpl && <td className="px-5 py-3 text-slate-300" title="No spend tracking exists for data-call sources">—</td>}
                          {analyticsVisibleColumns.qcpl && <td className="px-5 py-3 text-slate-300" title="No spend tracking exists for data-call sources">—</td>}
                          {analyticsVisibleColumns.ctr && <td className="px-5 py-3 text-slate-300" title="No click/impression tracking exists for data-call sources">—</td>}
                          {analyticsVisibleColumns.clicks && <td className="px-5 py-3 text-slate-300" title="No click tracking exists for data-call sources">—</td>}
                          {analyticsVisibleColumns.impressions && <td className="px-5 py-3 text-slate-300" title="No impression tracking exists for data-call sources">—</td>}
                          {analyticsVisibleColumns.adSetName && <td className="px-5 py-3 text-slate-300" title="No ad-set tracking exists for data-call sources">—</td>}
                          {analyticsVisibleColumns.source && <td className="px-5 py-3">{r.name}</td>}
                          {analyticsVisibleColumns.date && <td className="px-5 py-3 text-slate-300" title="Not applicable — this is an aggregate row, not a single lead">—</td>}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <TablePagination {...sourcePagination.paginationProps} rowLabel="Source" className="-mx-5 -mb-5 mt-2" />
            </div>
          </div>
          ) : (
          <>
          {/* Main Data Calling Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-auto max-h-[55vh]">
              <table className="w-full text-left border-collapse table-auto min-w-[900px]">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b border-slate-200/80 text-[12px] font-bold text-slate-900">
                    {isAdmin && (
                      <th className="px-4 py-3.5 w-10">
                        <input
                          type="checkbox"
                          checked={allOnPageSelected}
                          onChange={toggleSelectAllOnPage}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-[#0B1E6E] focus:ring-0 focus:ring-offset-0"
                        />
                      </th>
                    )}
                    <th className="px-5 py-3.5 w-56">
                      {searchOpen ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            placeholder="Filter lead..."
                            className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs font-normal focus:outline-none w-36"
                          />
                          <button onClick={() => { setSearchQuery(""); setSearchOpen(false); }} className="text-slate-400 hover:text-slate-600">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span>Lead Name</span>
                          <button onClick={() => setSearchOpen(true)} className="text-slate-400 hover:text-slate-700" title="Search lead">
                            <Search className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </th>
                    <th className="px-5 py-3.5 whitespace-nowrap">Email</th>
                    <th className="px-5 py-3.5 whitespace-nowrap">
                      <SearchableMultiSelect
                        variant="inline"
                        label="Status"
                        selected={statusFilters}
                        onChange={(next) => { setStatusFilters(next); setCurrentPage(1); }}
                        options={statusOptions}
                        searchPlaceholder="Search status..."
                        panelWidth={180}
                      />
                    </th>
                    <th className="px-5 py-3.5 whitespace-nowrap">
                      <SearchableMultiSelect
                        variant="inline"
                        label="Sub-status"
                        selected={subStatusFilters}
                        onChange={(next) => { setSubStatusFilters(next); setCurrentPage(1); }}
                        options={subStatusOptions}
                        searchPlaceholder="Search sub-status..."
                        panelWidth={180}
                      />
                    </th>
                    {visibleColumns.assignedTo && (
                      <th className="px-5 py-3.5 whitespace-nowrap">
                        <SearchableMultiSelect
                          variant="inline"
                          label="Assigned To"
                          selected={assignedFilters}
                          onChange={(next) => { setAssignedFilters(next); setCurrentPage(1); }}
                          options={assignedOptions}
                          searchPlaceholder="Search agents..."
                          panelWidth={180}
                        />
                      </th>
                    )}
                    {visibleColumns.date && <th className="px-5 py-3.5 whitespace-nowrap">Date</th>}
                    {visibleColumns.notes && <th className="px-5 py-3.5 whitespace-nowrap">Notes</th>}
                    <th className="px-5 py-3.5 whitespace-nowrap">Next Call Date</th>
                    {visibleColumns.property && <th className="px-5 py-3.5 whitespace-nowrap">Property</th>}
                    {visibleColumns.dataCallSource && (
                      <th className="px-5 py-3.5 whitespace-nowrap">
                        <SearchableMultiSelect
                          variant="inline"
                          label="Data Call Source"
                          selected={dataCallSourceFilters}
                          onChange={(next) => { setDataCallSourceFilters(next); setCurrentPage(1); }}
                          options={dataCallSourceOptions}
                          searchPlaceholder="Search sources..."
                          panelWidth={200}
                        />
                      </th>
                    )}
                    {visibleColumns.usageCount && <th className="px-5 py-3.5 whitespace-nowrap">Usage Count</th>}
                    {visibleColumns.qualifiedLeads && <th className="px-5 py-3.5 whitespace-nowrap">Qualified Leads</th>}
                    {visibleColumns.unqualifiedLeads && <th className="px-5 py-3.5 whitespace-nowrap">Unqualified Leads</th>}
                    {visibleColumns.cpl && <th className="px-5 py-3.5 whitespace-nowrap">CPL</th>}
                    {visibleColumns.qualifiedPercent && <th className="px-5 py-3.5 whitespace-nowrap">Qualified %age</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[12px] font-medium text-slate-700">
                  {isDataLoading && paginatedLeads.length === 0 ? (
                    <TableRowsSkeleton rows={8} columns={visibleColCount} />
                  ) : paginatedLeads.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColCount} className="px-5 py-8 text-center text-slate-400 italic">No leads found matching filter.</td>
                    </tr>
                  ) : (
                    paginatedLeads.map(l => (
                      <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                        {isAdmin && (
                          <td className="px-4 py-3.5">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(l.id)}
                              onChange={() => toggleSelectRow(l.id)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-[#0B1E6E] focus:ring-0 focus:ring-offset-0"
                            />
                          </td>
                        )}
                        <td className="px-5 py-3.5 max-w-[224px]">
                          <button
                            onClick={() => setSelectedLead(l)}
                            className="font-semibold text-[#0B1E6E] hover:underline text-left truncate block max-w-full"
                            title={l.name}
                          >
                            {l.name}
                          </button>
                          {l.phone && (
                            <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-400 font-medium">
                              <span className="truncate">{l.phone}</span>
                              <button onClick={() => copyToClipboard(l.phone)} className="text-slate-300 hover:text-slate-500 shrink-0" title="Copy phone number">
                                <Copy className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5 max-w-[160px]">
                          {l.email ? (
                            <div className="flex items-center gap-1">
                              <span className="truncate" title={l.email}>{l.email}</span>
                              <button onClick={() => copyToClipboard(l.email)} className="text-slate-300 hover:text-slate-500 shrink-0" title="Copy email">
                                <Copy className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <SearchableSelect
                            variant="inline"
                            value={l.status}
                            onChange={(v) => openStatusChange(l, v as Lead["status"])}
                            options={ROW_STATUS_OPTIONS}
                            searchPlaceholder="Search status..."
                            panelWidth={176}
                            className="text-slate-900"
                          />
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          {l.status === "Connected" ? (
                            // Sub-status can also be changed on an already-Connected
                            // lead without re-picking the status itself (e.g. flipping
                            // Not Qualified -> Qualified once a second call confirms interest).
                            <SearchableSelect
                              variant="inline"
                              value={l.subStatus || ""}
                              onChange={(v) => updateLeadStatus(l.id, "Connected", undefined, undefined, v as "Qualified" | "Not Qualified")}
                              options={["Qualified", "Not Qualified"]}
                              placeholder="Set sub-status"
                              searchPlaceholder="Search sub-status..."
                              panelWidth={160}
                              className={
                                l.subStatus === "Qualified"
                                  ? "text-emerald-600"
                                  : l.subStatus === "Not Qualified"
                                    ? "text-red-500"
                                    : "text-slate-400"
                              }
                            />
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        {visibleColumns.assignedTo && (
                          <td className="px-5 py-3.5">
                            <SearchableSelect
                              variant="inline"
                              value={l.assignedAgent || ""}
                              onChange={(v) => reassignLead(l.id, v)}
                              options={assignedOptions}
                              placeholder="—"
                              searchPlaceholder="Search agents..."
                              panelWidth={176}
                              className="max-w-[140px] text-slate-700"
                            />
                          </td>
                        )}
                        {visibleColumns.date && <td className="px-5 py-3.5 whitespace-nowrap">{formatDateTime(l.createdAtStr)}</td>}
                        {visibleColumns.notes && <td className="px-5 py-3.5 truncate max-w-[200px]" title={latestLogMessage(l)}>{latestLogMessage(l)}</td>}
                        <td className="px-5 py-3.5 whitespace-nowrap">{nextCallDateFor(l.id)}</td>
                        {visibleColumns.property && <td className="px-5 py-3.5">{l.property || "—"}</td>}
                        {visibleColumns.dataCallSource && <td className="px-5 py-3.5">{l.subSource || l.source || "—"}</td>}
                        {visibleColumns.usageCount && <td className="px-5 py-3.5">{l.logs ? l.logs.length : 0}</td>}
                        {visibleColumns.qualifiedLeads && <td className="px-5 py-3.5 text-slate-300" title="Not applicable — this is a per-lead row, not an aggregate">—</td>}
                        {visibleColumns.unqualifiedLeads && <td className="px-5 py-3.5 text-slate-300" title="Not applicable — this is a per-lead row, not an aggregate">—</td>}
                        {visibleColumns.cpl && <td className="px-5 py-3.5 text-slate-300" title="Not applicable — this is a per-lead row, not an aggregate">—</td>}
                        {visibleColumns.qualifiedPercent && <td className="px-5 py-3.5 text-slate-300" title="Not applicable — this is a per-lead row, not an aggregate">—</td>}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <TablePagination
              totalRows={filteredLeads.length}
              page={currentPageClamped}
              rowsPerPage={rowsPerPage}
              onPageChange={setCurrentPage}
              onRowsPerPageChange={setRowsPerPage}
              rowLabel="Lead"
            />
          </div>
        </>
      )}

      {/* Filter button's column-visibility drawer — full-height right-docked
          drawer, same pattern as the Campaigns page's Filter drawer. */}
      {isFilterOpen && createPortal(
        <div className="fixed inset-0 z-[100]">
          <div className="fixed inset-0" onClick={() => setIsFilterOpen(false)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-slide-in">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
              <h3 className="text-base font-extrabold text-slate-900">Filter</h3>
              <button onClick={() => setIsFilterOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="px-5 py-5 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold text-slate-800">Columns</span>
                <button
                  type="button"
                  onClick={toggleSelectAllColumns}
                  className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-[#0B1E6E]"
                >
                  <Minus className="h-3 w-3" />
                  Select All
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {DATA_CALLING_COLUMNS.map(c => {
                  const isOn = visibleColumns[c.key];
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => toggleColumn(c.key)}
                      className={`text-left pl-3 pr-2.5 py-2.5 text-xs rounded-lg border transition-colors truncate ${
                        isOn
                          ? "border-slate-200 border-l-[3px] border-l-[#0B1E6E] font-extrabold text-slate-900"
                          : "border-slate-200 font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Analytics tab's own Filter drawer — extra optional columns for the
          Source Performance table, same exact label set/pattern as the
          Campaigns page's Campaign Name table Filter drawer. */}
      {isAnalyticsFilterOpen && createPortal(
        <div className="fixed inset-0 z-[100]">
          <div className="fixed inset-0" onClick={() => setIsAnalyticsFilterOpen(false)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-slide-in">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
              <h3 className="text-base font-extrabold text-slate-900">Filter</h3>
              <button onClick={() => setIsAnalyticsFilterOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="px-5 py-5 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold text-slate-800">Columns</span>
                <button
                  type="button"
                  onClick={toggleSelectAllAnalyticsColumns}
                  className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-[#0B1E6E]"
                >
                  <Minus className="h-3 w-3" />
                  Select All
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {ANALYTICS_COLUMNS.map(c => {
                  const isOn = analyticsVisibleColumns[c.key];
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => toggleAnalyticsColumn(c.key)}
                      className={`text-left pl-3 pr-2.5 py-2.5 text-xs rounded-lg border transition-colors truncate ${
                        isOn
                          ? "border-slate-200 border-l-[3px] border-l-[#0B1E6E] font-extrabold text-slate-900"
                          : "border-slate-200 font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Assign/Reshuffle Leads modal — Property must be picked before
          Assignee unlocks (it scopes the eligible agent list), and the
          modal's own confirm button stays disabled until both fields hold
          a value. Same modal for both flows; assignFlowMode picks the copy
          and the target lead set. */}
      {isAdmin && assignFlowMode && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40" onClick={closeAssignFlow} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-slate-100">
              <h3 className="text-xl font-extrabold text-slate-900">
                {assignFlowMode === "reshuffle" ? "Reshuffle Leads" : "Assign Leads"}
              </h3>
            </div>
            <div className="px-6 py-5 space-y-5">
              <p className="text-xs text-slate-500">
                {assignFlowMode === "reshuffle"
                  ? `Reshuffling ${flowTargetIds.length} assigned lead${flowTargetIds.length > 1 ? "s" : ""}.`
                  : `Assigning ${flowTargetIds.length} unassigned lead${flowTargetIds.length > 1 ? "s" : ""}.`}
              </p>

              {/* Select Property */}
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-800">Select Property</label>
                <SearchableMultiSelect
                  variant="field"
                  selected={Array.from(assignSelectedPropertyIds)}
                  onChange={changePropertySelection}
                  options={properties.map(p => ({ value: p.id, label: p.name }))}
                  placeholder="Select property"
                  searchPlaceholder="Search property..."
                />
              </div>

              {/* Select Assignee — locked until at least one property is picked */}
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-800">
                  {assignFlowMode === "reshuffle" ? "Select Reshuffle Assignee" : "Select Assignee"}
                </label>
                <SearchableSelect
                  value={assignSelectedAssigneeId}
                  onChange={setAssignSelectedAssigneeId}
                  options={eligibleAssignees.map(u => ({ value: u.id, label: u.name }))}
                  disabled={assignSelectedPropertyIds.size === 0}
                  placeholder="Select Member"
                  searchPlaceholder="Search assignee..."
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button
                type="button"
                onClick={closeAssignFlow}
                className="px-5 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 text-sm hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canConfirmAssign}
                onClick={confirmBulkAssign}
                className={`px-5 py-2 rounded-xl font-bold text-sm text-white transition-colors ${
                  canConfirmAssign ? "bg-[#0B1E6E] hover:bg-[#081650]" : "bg-slate-300 cursor-not-allowed"
                }`}
              >
                {assignFlowMode === "reshuffle" ? "Reshuffle" : "Assign"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Individual lead view — same drawer the main admin dashboard uses,
          restricted to Data Calling's own status model. Picking RNR/Connected
          from the drawer's own status dropdown hands off to the exact same
          pending-action modal below (onRestrictedStatus), rather than
          duplicating the date/sub-status UI inside the drawer. */}
      <LeadDetailDrawer
        lead={selectedLead}
        isOpen={selectedLead !== null}
        onClose={() => setSelectedLead(null)}
        onUpdateStatus={updateLeadStatus}
        statusOptions={ROW_STATUS_OPTIONS}
        restrictedStatuses={["RNR", "Connected"]}
        onRestrictedStatus={(leadId, leadName, status) => {
          setPendingActionError(null);
          setRnrDate("");
          setRnrTime("10:00");
          setPendingStatusAction({ leadId, leadName, status: status as "RNR" | "Connected" });
        }}
      />

      {/* RNR needs a next-call date (scheduled via the same follow-up
          mechanism Call Back/Follow-up use elsewhere) and Connected needs a
          Qualified/Not Qualified sub-status — neither commits until this is
          filled in, so the row Status dropdown opens this instead of
          setting the status directly for those two. */}
      {pendingStatusAction && createPortal(
        <>
          <div className="fixed inset-0 bg-slate-900/40 z-[80]" onClick={() => setPendingStatusAction(null)} />
          <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 p-6">
              <h3 className="text-sm font-extrabold text-slate-900">
                {pendingStatusAction.status === "RNR" ? "Schedule Next Call" : "Mark as Connected"}
              </h3>
              <p className="text-xs text-slate-500 mt-1">{pendingStatusAction.leadName}</p>

              {pendingStatusAction.status === "RNR" ? (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-slate-700">Next Call Date</label>
                      <DatePicker
                        value={rnrDate}
                        minDate={todayIso()}
                        onChange={(v) => { setRnrDate(v); setPendingActionError(null); }}
                        className="w-full flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:bg-white focus:border-[#0B1E6E]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-slate-700">Time</label>
                      <input
                        type="time"
                        value={rnrTime}
                        onChange={(e) => setRnrTime(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:bg-white focus:border-[#0B1E6E]"
                      />
                    </div>
                  </div>
                  {pendingActionError && <p className="text-[11px] text-red-600 font-semibold">{pendingActionError}</p>}
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPendingStatusAction(null)}
                      className="bg-slate-100 border border-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={confirmRnr}
                      className="bg-[#0B1E6E] hover:bg-[#081650] text-white font-bold px-5 py-2 rounded-xl text-xs transition-colors"
                    >
                      Schedule
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <p className="text-[11px] text-slate-500">
                    A qualified lead moves into the main CRM pipeline; not qualified stays here on Data Calling.
                  </p>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => confirmConnected("Qualified")}
                      className="border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-extrabold text-xs py-3 rounded-xl transition-colors"
                    >
                      Qualified
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmConnected("Not Qualified")}
                      className="border-2 border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-extrabold text-xs py-3 rounded-xl transition-colors"
                    >
                      Not Qualified
                    </button>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setPendingStatusAction(null)}
                      className="bg-slate-100 border border-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl text-xs hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>,
        document.body
      )}

      <UploadLeadsModal
        isOpen={isUploadLeadsOpen}
        onClose={() => setIsUploadLeadsOpen(false)}
        propertiesList={bulkUploadPropertiesList}
        agentsList={bulkUploadAgentsList}
        onSubmit={async (input) => {
          const result = await bulkImportLeads(input);
          setUploadSuccessMsg(
            `${result.created} lead${result.created === 1 ? "" : "s"} imported` +
              (result.duplicates > 0 ? `, ${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"} skipped` : "") +
              (result.skipped.length > 0 ? `, ${result.skipped.length} row${result.skipped.length === 1 ? "" : "s"} skipped` : "") +
              "."
          );
          setTimeout(() => setUploadSuccessMsg(""), 5000);
          return result;
        }}
      />
    </div>
  );
}
