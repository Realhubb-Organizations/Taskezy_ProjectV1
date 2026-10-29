"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp, Lead, AdSpendRecord, FollowupCall, mapApiLeadToFrontendLead, mapApiFollowupToFrontend } from "@/context/AppContext";
import LeadDetailDrawer from "@/components/crm/LeadDetailDrawer";
import { computeCPL } from "@/lib/reportMetrics";
import { WhatsAppIcon, CallIcon, PlatformLabel, platformFromText } from "@/components/icons/ContactIcons";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/SearchableDropdown";
import {
  ChevronDown,
  Search,
  ChevronRight,
  CheckCircle,
  X,
  Phone,
  Mail,
  Copy,
  Check,
  Building,
  Sliders,
  Minus,
  Download,
  RefreshCw
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { LineSkeleton, TableRowsSkeleton, CardListSkeleton } from "@/components/ui/Skeletons";
import ExpandChevron, { CollapsibleCell } from "@/components/ui/ExpandChevron";
import TablePagination, { usePagination } from "@/components/ui/TablePagination";
import DateRangePicker, { toIsoDate } from "@/components/ui/DateRangePicker";
import DateRangeSelect from "@/components/ui/DateRangeSelect";

import {
  CampaignItem,
  CAMPAIGN_STATUSES,
  QUALIFIED_LEAD_STATUSES,
  SITE_VISIT_LEAD_STATUSES,
  BOOKING_LEAD_STATUSES,
  buildCampaignsList
} from "@/lib/campaignBuilder";
import { formatNextFollowup, nextFollowupFor } from "@/lib/followups";
import NextCallCell from "@/components/crm/NextCallCell";
import { maskPhone, maskEmail } from "@/lib/maskPII";
import {
  apiGetCampaignLeadStats, type CampaignLeadStats,
  apiGetCampaignDailyStats, type CampaignDailyStat,
  apiGetLeadStats, type LeadListFilters,
  apiGetCampaignStatusBreakdown, type CampaignStatusBreakdownRow, type CampaignStatusBreakdownResult,
  apiGetAdLevelLeadStats, type AdLevelLeadStat,
  apiListLeadsPage, apiListFollowupsPage
} from "@/lib/apiClient";
import { useServerLeadList } from "@/lib/useServerLeadList";
import type { LeadSummaryStats } from "@/lib/leadSummaryStats";

// Same icon URLs the admin leads page uses for these platforms (LeadDashboard.tsx).
const PLATFORM_ICON_URL: Partial<Record<CampaignItem["platform"], string>> = {
  Meta: "https://img.icons8.com/?size=100&id=wA5rN96FVDtq&format=png&color=000000",
  Google: "https://img.icons8.com/?size=100&id=4hR4Ih04Je2t&format=png&color=000000"
};

const normalizePlatform = (raw: string): CampaignItem["platform"] => {
  const p = raw.toLowerCase();
  if (p.includes("google")) return "Google";
  if (p.includes("meta") || p.includes("facebook")) return "Meta";
  return "Other";
};

function PlatformIcon({ platform }: { platform: CampaignItem["platform"] }) {
  const src = PLATFORM_ICON_URL[platform];
  if (!src) return <span className="text-[11px] text-slate-500">{platform}</span>;
  return <img src={src} alt={platform} className="h-4 w-4 inline-block" />;
}

function PlatformIcons({ platforms }: { platforms: CampaignItem["platform"][] }) {
  if (platforms.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <span className="flex items-center gap-1.5">
      {platforms.map(p => <PlatformIcon key={p} platform={p} />)}
    </span>
  );
}

// The campaigns table's togglable columns (beyond the always-shown Campaign
// Name + Total Leads) — driven by the Filter button's panel, mirroring the
// same drawer pattern on the admin leads page. CTR / Clicks / Impressions
// come from Meta's daily campaign insights (migration 029; "—" when not
// reported, e.g. Google), Ad set name from the synced per-ad records,
// Source is the platform and QCPL is spend ÷ qualified leads. "Date" still
// has no per-campaign field and renders "—".
type CampaignColumnKey =
  | "cpl" | "date" | "status" | "ctr" | "siteVisit" | "clicks"
  | "adSetName" | "impressions" | "source" | "qcpl" | "unqualifiedLeads" | "qualifiedLeads";

const CAMPAIGN_COLUMNS: { key: CampaignColumnKey; label: string }[] = [
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

const CAMPAIGN_DEFAULT_VISIBLE_COLUMNS: Record<CampaignColumnKey, boolean> = {
  cpl: true, date: false, status: true, ctr: false, siteVisit: true, clicks: false,
  adSetName: false, impressions: false, source: false, qcpl: false,
  unqualifiedLeads: true, qualifiedLeads: true
};

// The Property/Status breakdown table's togglable columns — driven by its
// own Filter button/drawer, same pattern as the Campaigns tab's Filter
// drawer. "Date" and "Q Spend" have no real backing field/definition yet
// (no per-campaign date, and no defined "qualified spend" formula), so
// they honestly render "—" rather than inventing a number.
type BreakdownColumnKey =
  | "property" | "date" | "campaigns" | "qualifiedLeads" | "source" | "unqualifiedLeads"
  | "totalLeads" | "spend" | "cpl" | "qSpend" | "qcpl" | "qualifiedPercent";

const BREAKDOWN_COLUMNS: { key: BreakdownColumnKey; label: string }[] = [
  { key: "property", label: "Property" },
  { key: "date", label: "Date" },
  { key: "campaigns", label: "Campaigns" },
  { key: "qualifiedLeads", label: "Qualified Leads" },
  { key: "source", label: "Source" },
  { key: "unqualifiedLeads", label: "Unqualified Leads" },
  { key: "totalLeads", label: "Total Leads" },
  { key: "spend", label: "Spend" },
  { key: "cpl", label: "CPL" },
  { key: "qSpend", label: "Q Spend" },
  { key: "qcpl", label: "QCPL" },
  { key: "qualifiedPercent", label: "Qualified %age" }
];

const BREAKDOWN_DEFAULT_VISIBLE_COLUMNS: Record<BreakdownColumnKey, boolean> = {
  property: true, date: false, campaigns: true, qualifiedLeads: true, source: true, unqualifiedLeads: false,
  totalLeads: true, spend: true, cpl: true, qSpend: false, qcpl: true, qualifiedPercent: false
};

// The "Status" tab is a per-date, per-campaign breakdown by real lead
// pipeline status (not campaign Active/Pause/Stopped) — one row per real
// AdSpendRecord (its own date + accountName), with each status column
// counting real Lead records for that campaign created on that date.
// "Other Req." and "Cancelled" have no matching value in the real
// LeadStatus enum (no fabricated bucket for them), so they render "—"
// rather than a made-up count, same convention as every other untracked
// column on this page.
type StatusColumnKey =
  | "date" | "campaign" | "totalLeads" | "source" | "newLead" | "callBack" | "followUps"
  | "siteVisits" | "eoi" | "booked" | "dead" | "rnr" | "lowBudget" | "otherReq" | "cancelled";

const STATUS_COLUMNS: { key: StatusColumnKey; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "campaign", label: "Campaign" },
  { key: "totalLeads", label: "Total Leads" },
  { key: "source", label: "Source" },
  { key: "newLead", label: "New Lead" },
  { key: "callBack", label: "Call Back" },
  { key: "followUps", label: "Follow ups" },
  { key: "siteVisits", label: "Site Visits" },
  { key: "eoi", label: "EOI" },
  { key: "booked", label: "Booked" },
  { key: "dead", label: "Dead" },
  { key: "rnr", label: "RNR" },
  { key: "lowBudget", label: "Low Budget" },
  { key: "otherReq", label: "Other Req." },
  { key: "cancelled", label: "Cancelled" }
];

const STATUS_DEFAULT_VISIBLE_COLUMNS: Record<StatusColumnKey, boolean> = {
  date: true, campaign: true, totalLeads: true, source: false, newLead: false, callBack: true, followUps: true,
  siteVisits: true, eoi: false, booked: false, dead: true, rnr: true, lowBudget: true, otherReq: false, cancelled: false
};

export default function AdminCampaignsPage() {
  const { adSpendRecords, adLevelSpendRecords, refetchAdLevelSpend, triggerAdSpendSync, isDataLoading, activeRole, updateLeadStatus } = useApp();
  const isAdmin = activeRole === "ADMIN";
  const router = useRouter();
  const searchParams = useSearchParams();

  // Navigation tab inside Campaigns page ("Campaigns" | "Campaigns Analytics")
  // — mirrored into ?tab=analytics so the shared page header (getActiveTabName
  // in the app layout) can show "Campaigns Analytics" instead of always
  // "Campaigns", same pattern as the admin Leads page's Leads/Leads Analytics
  // toggle.
  const [activeTab, setActiveTab] = useState<"Campaigns" | "Analytics">(
    () => (searchParams.get("tab") === "analytics" ? "Analytics" : "Campaigns")
  );

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (activeTab === "Analytics") params.set("tab", "analytics");
    else params.delete("tab");
    const query = params.toString();
    router.replace(`/dashboard/crm/campaigns${query ? `?${query}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Summary Card Filters — "Custom" is set either by the Date Range
  // dropdown's own "Custom" option (opens the calendar under it) or by the
  // toolbar's calendar picker (below); both share appliedCustomRange.
  const [dateRange, setDateRange] = useState<"Today" | "Yesterday" | "This Week" | "This Month" | "All Time" | "Custom">("Today");

  // Stat card drill-down — clicking a summary card shows the underlying
  // leads it counted, same "open the respective card" pattern as the CRM
  // Dashboard page. Real pagination (useServerLeadList, for the 4 lead
  // categories) and the small client-side "Active Campaigns" table's own
  // page state are both defined further below, once their inputs exist.
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  // toggleCategory (opens/closes the drill-down) is defined further below —
  // it's independent of the chart's own category dropdown.

  // Table Filters & Search
  const today = new Date();
  const todayStr = today.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const [appliedCustomRange, setAppliedCustomRange] = useState<{ start: string; end: string } | null>(null);

  // Shared handler for every <DateRangePicker/> instance on this page
  // (Campaigns tab toolbar + Analytics tab toolbar) — both control the same
  // appliedCustomRange/dateRange state so they can never disagree. Applying a
  // range switches the preset to "Custom"; clearing it (the trigger's ×) drops
  // back to "Today", same as the old popover's Reset.
  const handleDateRangeChange = (v: { start: string; end: string } | null) => {
    setAppliedCustomRange(v);
    setDateRange(v ? "Custom" : "Today");
    setCurrentPage(1);
  };

  // Campaign Status column-header filter — a multi-select dropdown opened
  // from the table's "Campaign Status" header. Empty = all statuses.
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [quickViewLead, setQuickViewLead] = useState<Lead | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Filter button → Settings panel for which table columns are shown — a
  // full-height right-docked drawer, same pattern as the admin leads page.
  const [isColumnsSettingsOpen, setIsColumnsSettingsOpen] = useState(false);
  const [campaignVisibleColumns, setCampaignVisibleColumns] = useState<Record<CampaignColumnKey, boolean>>(CAMPAIGN_DEFAULT_VISIBLE_COLUMNS);

  const toggleCampaignColumn = (key: CampaignColumnKey) => {
    setCampaignVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSelectAllCampaignColumns = () => {
    const allOn = CAMPAIGN_COLUMNS.every(c => campaignVisibleColumns[c.key]);
    const next: Record<CampaignColumnKey, boolean> = { ...campaignVisibleColumns };
    CAMPAIGN_COLUMNS.forEach(c => { next[c.key] = !allOn; });
    setCampaignVisibleColumns(next);
  };

  // Pagination state
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);

  // Maps the "Date Range" pill's labels onto the bucket keys dateInRange
  // understands. "Custom" is handled separately via appliedCustomRange.
  const mapDateRangeToKey = (dr: typeof dateRange): "today" | "yesterday" | "week" | "month" | "all" => {
    switch (dr) {
      case "Today": return "today";
      case "Yesterday": return "yesterday";
      case "This Week": return "week";
      case "This Month": return "month";
      default: return "all";
    }
  };

  const dateInRange = (dateStr: string | undefined, range: "today" | "yesterday" | "week" | "month" | "all", refNow: Date): boolean => {
    // "All Time" means no date restriction at all — it must include leads
    // with a missing or unparseable date too, not just leads that happen to
    // have a valid one. Every other bucket (Today/Week/Month/...) genuinely
    // needs a real date to place a lead inside it, so only "all" short-circuits.
    if (range === "all") return true;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
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

  // A lead is "in range" if it falls within the applied custom start/end
  // (when Custom is active) or within the selected preset bucket otherwise.
  const leadInSelectedRange = (l: Lead): boolean => {
    if (dateRange === "Custom" && appliedCustomRange) {
      if (!l.createdAtStr) return false;
      const d = new Date(l.createdAtStr);
      if (isNaN(d.getTime())) return false;
      const start = new Date(appliedCustomRange.start);
      const end = new Date(appliedCustomRange.end);
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    }
    return dateInRange(l.createdAtStr, mapDateRangeToKey(dateRange), today);
  };

  // Same "in range" check as leadInSelectedRange, for a real record's own
  // date — used to decide which campaigns actually had activity within the
  // selected Date Range (for the top summary bar only; campaignsList itself
  // stays all-time so the Campaigns tab table / chart / breakdown keep their
  // full history). Typed generically (just needs a .date) so the same check
  // works for AdSpendRecord and AdLevelSpendRecord alike.
  const recordInSelectedRange = (r: { date: string }): boolean => {
    if (dateRange === "Custom" && appliedCustomRange) {
      const d = new Date(r.date);
      if (isNaN(d.getTime())) return false;
      const start = new Date(appliedCustomRange.start);
      const end = new Date(appliedCustomRange.end);
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    }
    return dateInRange(r.date, mapDateRangeToKey(dateRange), today);
  };

  // buildCampaignsList itself now lives in @/lib/campaignBuilder (imported
  // above) so the Campaign Deep Dive page can build the exact same real
  // per-campaign numbers without duplicating this logic.

  // Plain YYYY-MM-DD bounds for the current Date Range pill/custom range —
  // same boundary semantics as leadInSelectedRange/recordInSelectedRange
  // above, just emitting dates for the server-backed campaign-lead-stats
  // call below instead of a client-side predicate. Undefined/undefined
  // means "All Time", matching campaignsListAllTime's own unscoped call.
  const campaignServerDateBounds = (): { dateFrom?: string; dateTo?: string } => {
    if (dateRange === "Custom") {
      if (!appliedCustomRange) return {};
      return { dateFrom: appliedCustomRange.start, dateTo: appliedCustomRange.end };
    }
    if (dateRange === "All Time") return {};
    const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (dateRange === "Today") return { dateFrom: toYMD(startOfToday), dateTo: toYMD(startOfToday) };
    if (dateRange === "Yesterday") {
      const y = new Date(startOfToday);
      y.setDate(y.getDate() - 1);
      return { dateFrom: toYMD(y), dateTo: toYMD(y) };
    }
    if (dateRange === "This Week") {
      const weekAgo = new Date(startOfToday);
      weekAgo.setDate(weekAgo.getDate() - 6);
      return { dateFrom: toYMD(weekAgo), dateTo: toYMD(startOfToday) };
    }
    // This Month
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { dateFrom: toYMD(monthStart), dateTo: toYMD(monthEnd) };
  };

  // Per-campaign lead-derived numbers (totalLeads/qualified/unqualified/
  // siteVisit) now come from the server instead of the bulk leads array —
  // see Taskezy-Server's ad-spend.routes.ts campaign-lead-stats endpoint.
  // Two independent fetches, matching the two buildCampaignsList call sites
  // below: one scoped to the current Date Range, one always all-time.
  const [scopedLeadStats, setScopedLeadStats] = useState<CampaignLeadStats[]>([]);
  useEffect(() => {
    let cancelled = false;
    const { dateFrom, dateTo } = campaignServerDateBounds();
    apiGetCampaignLeadStats(dateFrom, dateTo)
      .then(result => { if (!cancelled) setScopedLeadStats(result); })
      .catch(() => { /* leave the previous numbers showing on a transient failure */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, appliedCustomRange]);
  const scopedLeadStatsMap = useMemo(
    () => new Map(scopedLeadStats.map(s => [s.campaign.toLowerCase(), s])),
    [scopedLeadStats]
  );

  const [allTimeLeadStats, setAllTimeLeadStats] = useState<CampaignLeadStats[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiGetCampaignLeadStats()
      .then(result => { if (!cancelled) setAllTimeLeadStats(result); })
      .catch(() => { /* leave the previous numbers showing on a transient failure */ });
    return () => { cancelled = true; };
  }, []);
  const allTimeLeadStatsMap = useMemo(
    () => new Map(allTimeLeadStats.map(s => [s.campaign.toLowerCase(), s])),
    [allTimeLeadStats]
  );

  // Per (campaign, day) spend + lead-category counts + each campaign's
  // current Active/Inactive status — replaces categoryLeadsInRange's old
  // per-lead iteration for the Analytics chart, the Type/Status breakdown
  // card, and the Active Campaigns category, none of which have any other
  // server source for "this lead's campaign is currently Active."
  const [campaignDailyStats, setCampaignDailyStats] = useState<CampaignDailyStat[]>([]);
  useEffect(() => {
    let cancelled = false;
    const { dateFrom, dateTo } = campaignServerDateBounds();
    apiGetCampaignDailyStats(dateFrom, dateTo)
      .then(result => { if (!cancelled) setCampaignDailyStats(result); })
      .catch(() => { /* leave the previous numbers showing on a transient failure */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, appliedCustomRange]);

  // The real, Date-Range-scoped campaigns list — each campaign's own
  // totalLeads is the sum of its real per-day leads (see
  // buildCampaignsList) within the selected range. Drives the Campaigns
  // tab table (each campaign's own row), Active Campaigns, the Campaign
  // Type/Status breakdown's Spend column, Deep Dive, and CSV export. The
  // top summary bar's own Total Leads card does NOT use this — it comes
  // from GET /leads/stats (leadsStats below), same endpoint the CRM
  // Dashboard and admin Leads page use for their own Total Leads card, so
  // all three agree.
  const campaignsListResult = useMemo(
    () => buildCampaignsList(adSpendRecords.filter(recordInSelectedRange), scopedLeadStatsMap),
    [adSpendRecords, scopedLeadStatsMap, appliedCustomRange, dateRange, today]
  );
  const campaignsList: CampaignItem[] = campaignsListResult.items;
  // Pure Meta+Google+Other self-reported total for the same Date Range —
  // shown alongside the real synced-lead Total Leads count so both real
  // numbers are visible together, not just one.
  // Campaigns-tab multi-select. Narrows the main table and the summary cards
  // above it; it only applies while the Campaigns tab is open.
  const [campaignFilters, setCampaignFilters] = useState<string[]>([]);
  const campaignFilterActive = activeTab === "Campaigns" && campaignFilters.length > 0;
  const selectedCampaignNames = useMemo(() => new Set(campaignFilters.map(n => n.toLowerCase())), [campaignFilters]);
  const inSelectedCampaigns = (name: string | undefined) =>
    !campaignFilterActive || (!!name && selectedCampaignNames.has(name.toLowerCase()));
  const platformReportedLeadsTotal = campaignFilterActive
    ? campaignsList.filter(c => inSelectedCampaigns(c.name)).reduce((sum, c) => sum + c.platformReportedLeads, 0)
    : campaignsListResult.platformReportedTotal;

  // The 7-bucket stat shape every other admin page's "Total Leads"/"Follow
  // Ups"/"Call Backs" cards already use (GET /leads/stats) — covers Total
  // Leads/Follow Ups/Call Backs directly, and Site Visits as the sum of
  // its own siteVisitScheduled+siteVisitDone. "Qualified Leads" isn't one
  // of these 7 buckets (it's a 6-status combined bucket including EOI/
  // Booked, which this endpoint doesn't track) — that one sums
  // campaignDailyStats' qualifiedLeads instead (see summaryMetrics below).
  const ZERO_LEAD_SUMMARY: LeadSummaryStats = { totalLeads: 0, newLeads: 0, rnr: 0, callBacks: 0, followUps: 0, siteVisitScheduled: 0, siteVisitDone: 0 };
  const [leadsStats, setLeadsStats] = useState<LeadSummaryStats>(ZERO_LEAD_SUMMARY);
  useEffect(() => {
    let cancelled = false;
    const filters: LeadListFilters = { ...campaignServerDateBounds(), campaign: campaignFilterActive ? campaignFilters : undefined };
    apiGetLeadStats(filters)
      .then(result => { if (!cancelled) setLeadsStats(result); })
      .catch(() => { /* leave the previous numbers showing on a transient failure */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, appliedCustomRange, campaignFilterActive, campaignFilters]);

  // Same real campaigns, but always all-time — a campaign's status
  // (Active/Pause/Stopped) and platform are snapshot properties of the
  // campaign itself, not something that should flip depending on which
  // date window happens to be selected, so classification (campaignByName
  // below) always reads the campaign's real overall status rather than
  // "was it Active within just this range." Also seeds the Campaign Type/
  // Status breakdown's checkboxes so a type never disappears from the list
  // just because it had no activity in the current range.
  const campaignsListAllTime: CampaignItem[] = useMemo(
    () => buildCampaignsList(adSpendRecords, allTimeLeadStatsMap).items,
    [adSpendRecords, allTimeLeadStatsMap]
  );

  // Shared campaign-name lookup — sourced from the all-time list so a
  // lead/record's campaign classification (status/platform) stays the
  // real, stable value regardless of which Date Range is selected.
  const campaignByName = useMemo(() => {
    const map: Record<string, CampaignItem> = {};
    campaignsListAllTime.forEach(c => { map[c.name.toLowerCase()] = c; });
    return map;
  }, [campaignsListAllTime]);

  // campaignDailyStats, narrowed to the page's own Campaigns-tab filter —
  // same "which campaigns are even considered" role inSelectedCampaigns
  // always played, just applied to server rows instead of per-lead.
  const campaignDailyStatsFiltered = useMemo(
    () => campaignFilterActive ? campaignDailyStats.filter(r => selectedCampaignNames.has(r.campaign.toLowerCase())) : campaignDailyStats,
    [campaignDailyStats, campaignFilterActive, selectedCampaignNames]
  );

  // Status-code DB bucket for each category's drill-down (matches the
  // backend's own QUALIFIED_CODES/SITE_VISIT_CODES exactly, see
  // ad-spend.routes.ts) — undefined means "every lead," for Total Leads.
  const CATEGORY_STATUS_CODES: Record<string, string[] | undefined> = {
    "Total Leads": undefined,
    "Qualified Leads": ["CALL_BACK", "FOLLOWUP", "EOI", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "BOOKED"],
    "Site Visits": ["SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE"],
    "Follow Ups": ["FOLLOWUP"],
    "Call Backs": ["CALL_BACK"]
  };
  // Each lead-based stat card's own filters for its drill-down panel
  // (LeadDrillDownPanel-style baseFilters, see useServerLeadList below) —
  // "Active Campaigns" drills into campaigns instead (activeCampaignsDrill).
  const categoryBaseFilters: Record<string, LeadListFilters> = useMemo(() => {
    const shared: LeadListFilters = { ...campaignServerDateBounds(), campaign: campaignFilterActive ? campaignFilters : undefined };
    const out: Record<string, LeadListFilters> = {};
    Object.entries(CATEGORY_STATUS_CODES).forEach(([key, status]) => { out[key] = { ...shared, status }; });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, appliedCustomRange, campaignFilterActive, campaignFilters]);

  // Aggregate Metrics for Top Summary Card.
  //
  // Total Leads/Follow Ups/Call Backs/Site Visits come from GET /leads/stats
  // (leadsStats above) — the same server endpoint/shape the CRM Dashboard
  // and admin Leads page already use for their own same-named cards, so
  // this page's numbers can't drift from theirs. Qualified Leads isn't one
  // of that endpoint's 7 buckets (it's a 6-status combined bucket
  // including EOI/Booked) — summed from campaignDailyStatsFiltered instead.
  // Active Campaigns is unchanged — a real count of campaigns with that
  // status within the range, from the Date-Range-scoped campaignsList.
  const summaryMetrics = useMemo(() => {
    return {
      activeCampaigns: campaignsList.filter(c => c.status === "Active" && inSelectedCampaigns(c.name)).length,
      totalLeads: leadsStats.totalLeads,
      qualifiedLeads: campaignDailyStatsFiltered.reduce((sum, r) => sum + r.qualifiedLeads, 0),
      siteVisits: leadsStats.siteVisitScheduled + leadsStats.siteVisitDone,
      followUps: leadsStats.followUps,
      callBacks: leadsStats.callBacks
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignsList, leadsStats, campaignDailyStatsFiltered, campaignFilterActive, selectedCampaignNames]);

  // "Active Campaigns" drills into campaigns, not leads — it's a count of
  // campaigns (matching the summary card's own unit), not a leads list.
  // Same campaignsList the card's own count comes from, so they can never
  // disagree.
  const activeCampaignsDrill = useMemo(
    () => campaignsList.filter(c => c.status === "Active" && inSelectedCampaigns(c.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaignsList, campaignFilterActive, selectedCampaignNames]
  );

  // "Active Campaigns" drill-down table — small (campaign count, not lead
  // count), stays simple client-side search/pagination, no server fetch.
  const [campaignsDrillSearch, setCampaignsDrillSearch] = useState("");
  const [campaignsDrillPage, setCampaignsDrillPage] = useState(1);
  const [campaignsDrillRowsPerPage, setCampaignsDrillRowsPerPage] = useState(8);
  const shownCampaigns = useMemo(() => {
    const q = campaignsDrillSearch.trim().toLowerCase();
    return q ? activeCampaignsDrill.filter(c => c.name.toLowerCase().includes(q)) : activeCampaignsDrill;
  }, [activeCampaignsDrill, campaignsDrillSearch]);
  const campaignsDrillTotalPages = Math.max(1, Math.ceil(shownCampaigns.length / campaignsDrillRowsPerPage));
  const campaignsDrillCurrentPage = Math.min(campaignsDrillPage, campaignsDrillTotalPages);
  const shownCampaignsPage = shownCampaigns.slice((campaignsDrillCurrentPage - 1) * campaignsDrillRowsPerPage, campaignsDrillCurrentPage * campaignsDrillRowsPerPage);

  // The other four categories (Total/Qualified/Site Visit/Follow Ups/Call
  // Backs) drill into real leads — real server pagination via
  // useServerLeadList, only fetching while one of those is actually open
  // (never "Active Campaigns" or nothing selected).
  const isLeadCategoryOpen = !!selectedCategory && selectedCategory !== "Active Campaigns";
  const categoryDrillList = useServerLeadList(
    isLeadCategoryOpen ? categoryBaseFilters[selectedCategory] : {},
    8,
    isLeadCategoryOpen
  );

  const formatCurrency = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Same logic as the admin leads table (LeadDashboard.tsx) — reused here so
  // the Qualified Leads drill-down page's Notes/Next Call Date columns show
  // real data, not placeholders.
  const latestLogMessage = (l: Lead): string => {
    if (!l.logs || l.logs.length === 0) return "No feedback yet";
    const sorted = [...l.logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return sorted[0].message;
  };
  // Generic now — the two real call sites (Qualified Leads drill-down's
  // table and CSV export) each fetch just the follow-ups they need
  // instead of closing over the bulk followupCalls array.
  const nextCallDateFor = (leadId: string, followups: FollowupCall[]) => nextFollowupFor(leadId, followups);

  // ---- Campaigns Analytics tab ----------------------------------------

  // Chart: real spend AND real lead counts shown together, both scoped to
  // the selected Date Range (same as every other card on this tab) — "All
  // Time" plots the full history, a narrower range shows only that
  // window's real days. Which category the "leads" side is scoped to
  // follows whichever top stat card was last clicked (see toggleCategory).
  // Defaults to Total Leads.
  const CHART_CATEGORIES = ["Active Campaigns", "Total Leads", "Qualified Leads", "Site Visits", "Follow Ups", "Call Backs"] as const;
  type ChartCategory = typeof CHART_CATEGORIES[number];
  const [chartCategory, setChartCategory] = useState<ChartCategory>("Total Leads");

  // Independent of the category — controls which of the two real series
  // actually render: Spend only, Leads only, or both together.
  const CHART_VIEW_MODES = ["Spend", "Leads", "Both"] as const;
  type ChartViewMode = typeof CHART_VIEW_MODES[number];
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>("Both");

  // Clicking a top stat card both opens its drill-down (as before) and
  // switches the chart's Leads series to that same category — so the
  // chart always reflects whichever number the admin just looked at.
  const toggleCategory = (label: string) => {
    setSelectedCategory(prev => (prev === label ? null : label));
    setCampaignsDrillSearch("");
    setCampaignsDrillPage(1);
    categoryDrillList.setSearch("");
    if ((CHART_CATEGORIES as readonly string[]).includes(label)) {
      setChartCategory(label as ChartCategory);
    }
  };

  // "Campaign Type" breakdown can group real ad-spend by Platform (Meta/
  // Google/whatever the backend actually sends) or by campaign Status
  // (Active/Pause/Stopped, using each campaign's own real spend) — both
  // are genuine dimensions already present in the fetched data.
  const [typeGroupBy, setTypeGroupBy] = useState<"Platform" | "Status">("Platform");
  const [selectedChartTypes, setSelectedChartTypes] = useState<Record<string, boolean>>({});
  const isTypeChecked = (type: string) => selectedChartTypes[type] !== false;
  const toggleChartType = (type: string) => setSelectedChartTypes(prev => ({ ...prev, [type]: !isTypeChecked(type) }));

  // Spend sums campaignsList[].spend (real per-campaign ad spend, same
  // Date-Range-scoped list the Campaigns tab table uses). Leads sums
  // campaignDailyStatsFiltered's per-campaign totalLeads, classified by
  // each row's own campaign platform/status via campaignByName, plus a
  // single "Other"/"Unmatched" remainder for leads matching no known
  // ad-spend campaign at all — so this card's grand total always equals
  // the top summary bar's Total Leads card, whichever grouping dimension
  // is active. Every real platform/status ever seen (campaignsListAllTime)
  // is seeded into the map first so a type doesn't disappear from the
  // checkboxes just because it had no activity in the currently selected
  // Date Range — it shows ₹0/0 leads instead, which also keeps the
  // Analytics chart's own platform/status filters from silently narrowing
  // when a short range is picked.
  const typeBreakdown = useMemo(() => {
    const map: Record<string, { spend: number; leads: number; platformLeads: number }> = {};
    campaignsListAllTime.forEach(c => {
      const key = typeGroupBy === "Platform" ? c.platform : c.status;
      if (!map[key]) map[key] = { spend: 0, leads: 0, platformLeads: 0 };
    });
    campaignsList.forEach(c => {
      const key = typeGroupBy === "Platform" ? c.platform : c.status;
      if (!map[key]) map[key] = { spend: 0, leads: 0, platformLeads: 0 };
      map[key].spend += c.spend;
      // Same real per-platform/status self-reported number the Total Leads
      // card's subtitle shows — spend was actually incurred to generate
      // this (usually larger) count, not the smaller synced count below.
      map[key].platformLeads += c.platformReportedLeads;
    });
    // Leads matched to a known (has ad-spend) campaign — classified via
    // campaignByName, same as before, just reading campaignDailyStats'
    // per-campaign totals instead of iterating individual leads.
    let matchedTotal = 0;
    campaignDailyStatsFiltered.forEach(r => {
      const campaign = campaignByName[r.campaign.toLowerCase()];
      const key = typeGroupBy === "Platform" ? (campaign ? campaign.platform : "Other") : (campaign ? campaign.status : "Unmatched");
      if (!map[key]) map[key] = { spend: 0, leads: 0, platformLeads: 0 };
      map[key].leads += r.totalLeads;
      matchedTotal += r.totalLeads;
    });
    // Leads with no campaign/source matching any known ad-spend campaign at
    // all (organic/direct/manual-entry) — folded into "Other"/"Unmatched"
    // as a single remainder so this card's grand total still equals the
    // Total Leads card above (summaryMetrics.totalLeads), same invariant
    // the old per-lead version kept, just without a per-lead platform guess
    // for this one edge-case bucket.
    const unmatched = Math.max(0, summaryMetrics.totalLeads - matchedTotal);
    if (unmatched > 0) {
      const key = typeGroupBy === "Platform" ? "Other" : "Unmatched";
      if (!map[key]) map[key] = { spend: 0, leads: 0, platformLeads: 0 };
      map[key].leads += unmatched;
    }
    return Object.entries(map)
      .map(([type, v]) => ({ type, spend: v.spend, leads: v.leads, platformLeads: v.platformLeads }))
      .sort((a, b) => b.spend - a.spend);
  }, [campaignsList, campaignsListAllTime, campaignDailyStatsFiltered, campaignByName, typeGroupBy, summaryMetrics.totalLeads]);

  const typeBreakdownTotal = typeBreakdown.filter(t => isTypeChecked(t.type)).reduce((acc, t) => acc + t.spend, 0);
  const typeBreakdownLeadsTotal = typeBreakdown.filter(t => isTypeChecked(t.type)).reduce((acc, t) => acc + t.leads, 0);
  const typeBreakdownPlatformLeadsTotal = typeBreakdown.filter(t => isTypeChecked(t.type)).reduce((acc, t) => acc + t.platformLeads, 0);

  const chartData = useMemo(() => {
    const includedPlatforms = new Set(
      typeGroupBy === "Platform" ? typeBreakdown.filter(t => isTypeChecked(t.type)).map(t => t.type) : null
    );
    const includedStatuses = new Set(
      typeGroupBy === "Status" ? typeBreakdown.filter(t => isTypeChecked(t.type)).map(t => t.type) : null
    );

    const byDate: Record<string, { spend: number; leads: number }> = {};

    adSpendRecords.forEach(r => {
      if (!recordInSelectedRange(r)) return;
      if (typeGroupBy === "Platform") {
        if (!includedPlatforms.has(r.platform)) return;
      } else {
        const c = campaignByName[r.accountName.toLowerCase()];
        if (!c || !includedStatuses.has(c.status)) return;
      }
      if (!byDate[r.date]) byDate[r.date] = { spend: 0, leads: 0 };
      byDate[r.date].spend += r.spend;
    });

    // Real per-day lead counts for whichever category was last clicked,
    // from campaignDailyStatsFiltered (per-campaign, per-day server rows)
    // classified the same way as before via campaignByName.
    // ponytail: a lead matching no known ad-spend campaign at all
    // (organic/direct/manual-entry) has no per-day home in this endpoint,
    // so it's left out of this chart's "Other"/"Unmatched" line — the
    // stat cards above (summaryMetrics/typeBreakdown) still include it in
    // their totals via the GET /leads/stats-backed remainder, this is
    // chart-only. Add a per-day unmatched-leads endpoint if that line's
    // precision ever actually matters.
    const categoryField: Partial<Record<ChartCategory, "totalLeads" | "qualifiedLeads" | "siteVisitLeads" | "followUpLeads" | "callBackLeads">> = {
      "Total Leads": "totalLeads", "Qualified Leads": "qualifiedLeads", "Site Visits": "siteVisitLeads",
      "Follow Ups": "followUpLeads", "Call Backs": "callBackLeads"
    };
    campaignDailyStatsFiltered.forEach(r => {
      if (chartCategory === "Active Campaigns" && r.campaignStatus !== "Active") return;
      const campaign = campaignByName[r.campaign.toLowerCase()];
      if (typeGroupBy === "Platform") {
        const platform = campaign ? campaign.platform : "Other";
        if (!includedPlatforms.has(platform)) return;
      } else {
        const status = campaign ? campaign.status : "Unmatched";
        if (!includedStatuses.has(status)) return;
      }
      const count = chartCategory === "Active Campaigns" ? r.totalLeads : r[categoryField[chartCategory]!];
      if (!byDate[r.day]) byDate[r.day] = { spend: 0, leads: 0 };
      byDate[r.day].leads += count;
    });

    return Object.keys(byDate).sort().map(date => {
      const d = new Date(date);
      const label = isNaN(d.getTime())
        ? date
        : `${d.toLocaleDateString("en-GB", { day: "2-digit" })} ${d.toLocaleDateString("en-GB", { month: "short" })}, ${d.getFullYear()}`;
      return { date, label, spend: byDate[date].spend, leads: byDate[date].leads };
    });
  }, [adSpendRecords, campaignByName, campaignDailyStatsFiltered, chartCategory, typeGroupBy, selectedChartTypes, typeBreakdown, dateRange, appliedCustomRange, today]);

  const chartSpendAverage = chartData.length === 0 ? 0 : chartData.reduce((acc, c) => acc + c.spend, 0) / chartData.length;
  const chartLeadsAverage = chartData.length === 0 ? 0 : chartData.reduce((acc, c) => acc + c.leads, 0) / chartData.length;


  // Property / Status breakdown table below the chart.
  const [breakdownTab, setBreakdownTab] = useState<"Property" | "Status">("Property");
  // Multi-select: an empty array means "All Campaigns" (no filter applied).
  const [breakdownCampaignFilters, setBreakdownCampaignFilters] = useState<string[]>([]);

  // Filter button → full-height right-docked column drawer, same pattern as
  // the Campaigns tab's own Filter drawer.
  const [isBreakdownFilterOpen, setIsBreakdownFilterOpen] = useState(false);
  const [breakdownVisibleColumns, setBreakdownVisibleColumns] = useState<Record<BreakdownColumnKey, boolean>>(BREAKDOWN_DEFAULT_VISIBLE_COLUMNS);
  const toggleBreakdownColumn = (key: BreakdownColumnKey) => {
    setBreakdownVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };
  const toggleSelectAllBreakdownColumns = () => {
    const allOn = BREAKDOWN_COLUMNS.every(c => breakdownVisibleColumns[c.key]);
    const next: Record<BreakdownColumnKey, boolean> = { ...breakdownVisibleColumns };
    BREAKDOWN_COLUMNS.forEach(c => { next[c.key] = !allOn; });
    setBreakdownVisibleColumns(next);
  };

  const [statusVisibleColumns, setStatusVisibleColumns] = useState<Record<StatusColumnKey, boolean>>(STATUS_DEFAULT_VISIBLE_COLUMNS);
  const toggleStatusColumn = (key: StatusColumnKey) => {
    setStatusVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };
  const toggleSelectAllStatusColumns = () => {
    const allOn = STATUS_COLUMNS.every(c => statusVisibleColumns[c.key]);
    const next: Record<StatusColumnKey, boolean> = { ...statusVisibleColumns };
    STATUS_COLUMNS.forEach(c => { next[c.key] = !allOn; });
    setStatusVisibleColumns(next);
  };

  // Campaign Deep Dive — every individual campaign, searchable by name and
  // filterable by Source (whatever platforms actually exist in the data).
  const [deepDiveSearchQuery, setDeepDiveSearchQuery] = useState("");
  const [deepDiveSearchOpen, setDeepDiveSearchOpen] = useState(false);
  const [deepDiveSourceFilters, setDeepDiveSourceFilters] = useState<string[]>([]);

  // Manual "Sync" button — wakes the real Meta/Google ad-level sync jobs
  // early instead of waiting for their 6h interval. Does not bypass either
  // platform's real rate limits (Meta's ad-account Insights limit in
  // particular), so it can take a while to fully land — poll for new rows
  // landing for a few minutes afterward rather than expecting an instant
  // result, and let the admin re-trigger any time.
  const [adSyncStatus, setAdSyncStatus] = useState<"idle" | "syncing">("idle");
  const [adSyncNote, setAdSyncNote] = useState<string | null>(null);
  const handleAdSpendSync = async () => {
    setAdSyncStatus("syncing");
    setAdSyncNote(null);
    try {
      const result = await triggerAdSpendSync();
      const startedAny = result.meta.started || result.google.started;
      const anyCooldown = result.meta.reason === "cooldown" || result.google.reason === "cooldown";
      setAdSyncNote(
        startedAny
          ? "Sync started. Meta/Google rate limits mean this can take a while to fully land — new rows will appear automatically."
          : anyCooldown
          ? "Already synced recently — try again in a few minutes."
          : "A sync from an earlier trigger is still running — refreshing with whatever has landed so far."
      );
      let pollsLeft = 9; // ~3 minutes of polling at 20s apart, then stop and let the admin re-trigger
      const poll = async () => {
        await refetchAdLevelSpend();
        pollsLeft -= 1;
        if (pollsLeft > 0) {
          setTimeout(poll, 20_000);
        } else {
          setAdSyncStatus("idle");
        }
      };
      setTimeout(poll, 20_000);
    } catch {
      setAdSyncNote("Could not start sync — please try again.");
      setAdSyncStatus("idle");
    }
  };

  // Page-level drill-down from the Deep Dive table (breadcrumb-navigated,
  // replacing the Analytics tab's content) — a Qualified Leads count opens
  // the real list of qualified leads behind that number.
  const [analyticsDrillView, setAnalyticsDrillView] = useState<{ type: "qualifiedLeads"; campaign: CampaignItem } | null>(null);
  // Ad Set Name expands the campaign's row in place (all its real ad sets /
  // ads underneath it) instead of opening a separate page.
  const [expandedDeepDiveCampaigns, setExpandedDeepDiveCampaigns] = useState<Set<string>>(new Set());
  const toggleDeepDiveCampaign = (name: string) =>
    setExpandedDeepDiveCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });

  const deepDiveSourceOptions = useMemo(() => Array.from(new Set(campaignsList.map(c => c.platform))), [campaignsList]);

  // Campaign filter options (both "All Campaigns" dropdowns) — every
  // campaign ever seen, any status and regardless of the Date Range, one per
  // distinct name, grouped under its platform (Meta, Google, then Other).
  const breakdownCampaignOptions = useMemo(() => {
    const order: CampaignItem["platform"][] = ["Meta", "Google", "Other"];
    const seen = new Set<string>();
    return [...campaignsListAllTime]
      .sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform))
      .filter(c => !seen.has(c.name) && !!seen.add(c.name))
      .map(c => ({ value: c.name, label: c.name, group: c.platform }));
  }, [campaignsListAllTime]);

  const deepDiveCampaigns = useMemo(() => {
    const q = deepDiveSearchQuery.trim().toLowerCase();
    return campaignsList.filter(c => {
      const matchesSearch = !q || c.name.toLowerCase().includes(q);
      const matchesSource = deepDiveSourceFilters.length === 0 || deepDiveSourceFilters.includes(c.platform);
      return matchesSearch && matchesSource;
    });
  }, [campaignsList, deepDiveSearchQuery, deepDiveSourceFilters]);

  // Real per-ad rows (real ad set name, real ad/creative name, real spend,
  // real platform-reported leads — see AdLevelSpendRecord), aggregated per
  // ad and grouped by campaign name. Deliberately ALL-TIME, not scoped to
  // the selected Date Range — an ad set/creative's real name is a stable
  // fact about the campaign's structure, not something that should
  // disappear just because that specific ad didn't happen to spend on
  // whichever single day is currently selected (ad-level reporting can lag
  // same-day campaign-level totals by design on both platforms). Same
  // "stable structural data stays all-time" precedent as campaignsListAllTime.
  // Covers both Meta and Google — adId/platform are generic across both.
  // Feeds both the compact Deep Dive card's Ad Set/Creative columns (the
  // dominant real ad by spend) and the row's in-place expansion — the full
  // real per-ad table (whose Spend/CPL/Qualified Leads are therefore also
  // real all-time figures for that ad, not Date-Range-scoped).
  interface DeepDiveAdRow {
    adId: string;
    platform: "Meta" | "Google";
    adSetName: string;
    adName: string | null;
    creativeName?: string;
    adType?: string;
    spend: number;
    platformReportedLeads: number;
  }
  const adRowsByCampaign = useMemo(() => {
    const byAd: Record<string, DeepDiveAdRow & { campaignName: string }> = {};
    adLevelSpendRecords.forEach(r => {
      if (!byAd[r.adId]) {
        byAd[r.adId] = { adId: r.adId, platform: r.platform, adSetName: r.adSetName, adName: r.adName, creativeName: r.creativeName, adType: r.adType, campaignName: r.campaignName, spend: 0, platformReportedLeads: 0 };
      }
      byAd[r.adId].spend += r.spend;
      byAd[r.adId].platformReportedLeads += r.leadsGenerated;
    });
    const out: Record<string, DeepDiveAdRow[]> = {};
    Object.values(byAd).forEach(({ campaignName, ...ad }) => {
      const key = campaignName.toLowerCase();
      if (!out[key]) out[key] = [];
      out[key].push(ad);
    });
    Object.values(out).forEach(rows => rows.sort((a, b) => b.spend - a.spend));
    return out;
  }, [adLevelSpendRecords]);

  // Real Qualified Leads / real synced leads (for CPL) per ad, from the
  // server (GET /ad-spend/ad-level-lead-stats) instead of scanning the
  // bulk leads array — deliberately all-time, matching this number's
  // existing behavior. Google leads carry no per-lead ad attribution at
  // all (Sheets-import pipeline, not a webhook), so a Google ad's id
  // correctly — not a bug — is never a key here, same honest gap already
  // documented on Lead.metaAdId.
  const [adLevelLeadStats, setAdLevelLeadStats] = useState<AdLevelLeadStat[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiGetAdLevelLeadStats()
      .then(result => { if (!cancelled) setAdLevelLeadStats(result); })
      .catch(() => { /* leave the previous numbers showing on a transient failure */ });
    return () => { cancelled = true; };
  }, []);
  const adLevelLeadStatsMap = useMemo(() => new Map(adLevelLeadStats.map(s => [s.adId, s])), [adLevelLeadStats]);
  const qualifiedLeadsForAd = (adId: string): number => adLevelLeadStatsMap.get(adId)?.qualifiedLeads ?? 0;
  const cplForAd = (ad: DeepDiveAdRow): number => {
    const syncedLeads = adLevelLeadStatsMap.get(ad.adId)?.syncedLeads ?? 0;
    const totalLeads = Math.max(ad.platformReportedLeads, syncedLeads);
    return totalLeads > 0 ? ad.spend / totalLeads : 0;
  };

  // Qualified Leads drill-down page — the real leads behind a Deep Dive
  // row's Qualified Leads count. Real server pagination/search
  // (useServerLeadList) instead of a client-filtered bulk array — a
  // single capped fetch would risk undercounting a campaign with >500
  // qualified leads ever (this has no date bound, same as the Deep Dive
  // number it drills into).
  const QUALIFIED_DB_CODES = ["CALL_BACK", "FOLLOWUP", "EOI", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "BOOKED"];
  const isQualifiedLeadsDrillOpen = analyticsDrillView?.type === "qualifiedLeads";
  const qualifiedLeadsBaseFilters: LeadListFilters = isQualifiedLeadsDrillOpen
    ? { campaign: [analyticsDrillView!.campaign.name], status: QUALIFIED_DB_CODES }
    : {};
  const qualifiedLeadsList = useServerLeadList(qualifiedLeadsBaseFilters, 25, isQualifiedLeadsDrillOpen);

  // Next-call-date for just the current page's leads (not the whole
  // company's follow-up table) — same pattern LeadDrillDownPanel uses.
  const [qualifiedLeadsPageFollowups, setQualifiedLeadsPageFollowups] = useState<FollowupCall[]>([]);
  const qualifiedLeadsPageIds = qualifiedLeadsList.rows.map(l => l.id).join(",");
  // Re-fetch Next Call Dates when a call is scheduled anywhere (addFollowupCall
  // updates this list), not only when the rows change.
  const { followupCalls: liveFollowups } = useApp();
  useEffect(() => {
    if (!qualifiedLeadsPageIds) { setQualifiedLeadsPageFollowups([]); return; }
    let cancelled = false;
    apiListFollowupsPage(1, 500, { leadId: qualifiedLeadsPageIds.split(",") })
      .then(({ rows }) => { if (!cancelled) setQualifiedLeadsPageFollowups(rows.map(mapApiFollowupToFrontend)); })
      .catch(() => { if (!cancelled) setQualifiedLeadsPageFollowups([]); });
    return () => { cancelled = true; };
  }, [qualifiedLeadsPageIds, liveFollowups]);

  // CSV export needs every matching row, not just the current page — loop-
  // fetch every page (bounded by this one campaign's qualified leads,
  // never "all leads"/"all campaigns", same bridge pattern apiListAllLeads
  // already uses) rather than a second, unpaginated endpoint.
  const [exportingQualifiedLeadsCsv, setExportingQualifiedLeadsCsv] = useState(false);
  const exportQualifiedLeadsCsv = async () => {
    if (!analyticsDrillView || exportingQualifiedLeadsCsv) return;
    setExportingQualifiedLeadsCsv(true);
    try {
      const all: Lead[] = [];
      let page = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const result = await apiListLeadsPage(page, 500, { ...qualifiedLeadsBaseFilters, search: qualifiedLeadsList.search || undefined });
        all.push(...result.rows.map(mapApiLeadToFrontendLead));
        if (page >= result.totalPages) break;
        page += 1;
      }
      const { rows: followupRows } = await apiListFollowupsPage(1, 500, { leadId: all.map(l => l.id) });
      const exportFollowups = followupRows.map(mapApiFollowupToFrontend);
      const rows = [
        ["Lead Name", "Phone", "Email", "Status", "Assigned To", "Date", "Notes", "Next Call Date", "Campaign"],
        ...all.map(l => [
          l.name, isAdmin ? l.phone : maskPhone(l.phone), isAdmin ? l.email : maskEmail(l.email || ""), l.status, l.assignedAgent,
          l.createdAtStr || "—", latestLogMessage(l), formatNextFollowup(nextCallDateFor(l.id, exportFollowups)), l.campaign || l.source || "—"
        ])
      ];
      const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "qualified-leads.csv";
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingQualifiedLeadsCsv(false);
    }
  };

  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());
  const togglePropertyExpanded = (property: string) => {
    setExpandedProperties(prev => {
      const next = new Set(prev);
      if (next.has(property)) next.delete(property); else next.add(property);
      return next;
    });
  };

  // Built directly from campaignsList (not re-derived from raw leads) so the
  // numbers here always agree with the main Campaigns table and Campaign
  // Deep Dive below — and so each property row carries its own campaign
  // rows for the expand/collapse "⊕" view.
  const propertyBreakdown = useMemo(() => {
    const filtered = campaignsList.filter(c => breakdownCampaignFilters.length === 0 || breakdownCampaignFilters.includes(c.name));
    const map: Record<string, CampaignItem[]> = {};
    filtered.forEach(c => {
      const prop = c.property || "Unspecified";
      if (!map[prop]) map[prop] = [];
      map[prop].push(c);
    });
    return Object.entries(map).map(([property, campaigns]) => {
      const totalLeads = campaigns.reduce((acc, c) => acc + c.totalLeads, 0);
      const qualifiedLeads = campaigns.reduce((acc, c) => acc + c.qualifiedLeads, 0);
      const unqualifiedLeads = campaigns.reduce((acc, c) => acc + c.unqualifiedLeads, 0);
      const spend = campaigns.reduce((acc, c) => acc + c.spend, 0);
      return {
        property,
        campaigns,
        platforms: Array.from(new Set(campaigns.map(c => c.platform))),
        totalLeads,
        qualifiedLeads,
        unqualifiedLeads,
        qualifiedPercent: totalLeads > 0 ? (qualifiedLeads / totalLeads) * 100 : 0,
        cpl: computeCPL(spend, totalLeads),
        qcpl: computeCPL(spend, qualifiedLeads),
        spend
      };
    }).sort((a, b) => b.spend - a.spend);
  }, [campaignsList, breakdownCampaignFilters]);

  // "Status" tab: one row per real (campaign, date) pair — now from
  // GET /ad-spend/campaign-status-breakdown, real server pagination,
  // instead of mapping every ad_spend_records row against the bulk leads
  // array on every render. That table has no retention job and grows
  // forever, so this endpoint requires a real date range — "All Time"
  // falls back to the last 12 months here specifically (capped, flagged
  // below) rather than being sent as an unbounded request.
  const statusBreakdownDateBounds = (): { dateFrom: string; dateTo: string; capped: boolean } => {
    const bounds = campaignServerDateBounds();
    if (bounds.dateFrom && bounds.dateTo) return { dateFrom: bounds.dateFrom, dateTo: bounds.dateTo, capped: false };
    const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const twelveMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 12, today.getDate());
    return { dateFrom: toYMD(twelveMonthsAgo), dateTo: toYMD(today), capped: true };
  };
  const { dateFrom: statusDateFrom, dateTo: statusDateTo, capped: statusBreakdownCapped } = statusBreakdownDateBounds();

  const [statusBreakdownPage, setStatusBreakdownPage] = useState(1);
  const [statusBreakdownRowsPerPage, setStatusBreakdownRowsPerPage] = useState(10);
  const [statusBreakdownResult, setStatusBreakdownResult] = useState<CampaignStatusBreakdownResult>({ rows: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 1 });
  const [statusBreakdownLoading, setStatusBreakdownLoading] = useState(false);
  useEffect(() => { setStatusBreakdownPage(1); }, [breakdownCampaignFilters, statusDateFrom, statusDateTo, breakdownTab]);
  useEffect(() => {
    if (breakdownTab !== "Status") return;
    let cancelled = false;
    setStatusBreakdownLoading(true);
    apiGetCampaignStatusBreakdown(statusBreakdownPage, statusBreakdownRowsPerPage, statusDateFrom, statusDateTo, breakdownCampaignFilters.length > 0 ? breakdownCampaignFilters : undefined)
      .then(result => { if (!cancelled) setStatusBreakdownResult(result); })
      .catch(() => { /* leave the previous numbers showing on a transient failure */ })
      .finally(() => { if (!cancelled) setStatusBreakdownLoading(false); });
    return () => { cancelled = true; };
  }, [breakdownTab, statusBreakdownPage, statusBreakdownRowsPerPage, statusDateFrom, statusDateTo, breakdownCampaignFilters]);
  const statusDateBreakdown = useMemo(() => statusBreakdownResult.rows.map(row => {
    const d = new Date(row.date);
    const dateLabel = isNaN(d.getTime()) ? row.date : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    return { ...row, dateLabel };
  }), [statusBreakdownResult.rows]);

  const [exportingBreakdownCsv, setExportingBreakdownCsv] = useState(false);
  const exportBreakdownCsv = async () => {
    if (exportingBreakdownCsv) return;
    if (breakdownTab === "Property") {
      const rows = [["Property", "Campaigns", "Source", "Total Leads", "Qualified Leads", "CPL", "QCPL", "Spend"],
        ...propertyBreakdown.map(r => [r.property, r.campaigns.length, r.platforms.join("/"), r.totalLeads, r.qualifiedLeads, r.cpl.toFixed(2), r.qcpl.toFixed(2), r.spend.toFixed(2)])];
      downloadCsv(rows, "campaigns-property-breakdown.csv");
      return;
    }
    // Status tab's export needs every matching (campaign, day) row for the
    // active date range, not just the current page — loop-fetch every page
    // (now genuinely bounded, since dateFrom/dateTo are mandatory here)
    // instead of a second, unpaginated endpoint.
    setExportingBreakdownCsv(true);
    try {
      const all: CampaignStatusBreakdownRow[] = [];
      let page = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const result = await apiGetCampaignStatusBreakdown(page, 500, statusDateFrom, statusDateTo, breakdownCampaignFilters.length > 0 ? breakdownCampaignFilters : undefined);
        all.push(...result.rows);
        if (page >= result.totalPages) break;
        page += 1;
      }
      const rows = [["Date", "Campaign", "Total Leads", "Call Back", "Follow ups", "Site Visits", "Dead", "RNR", "Low Budget"],
        ...all.map(r => [r.date, r.campaign, r.totalLeads, r.callBack, r.followUps, r.siteVisits, r.dead, r.rnr, r.lowBudget])];
      downloadCsv(rows, "campaigns-status-breakdown.csv");
    } finally {
      setExportingBreakdownCsv(false);
    }
  };
  function downloadCsv(rows: (string | number)[][], filename: string) {
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Client-side pagination for the Analytics tab's Property table (the
  // Status tab now has real server pagination, see statusBreakdownResult
  // above). Jumps back to page 1 when its own filters/search or the
  // page's Date Range change.
  const dateRangeResetKey = JSON.stringify([dateRange, appliedCustomRange]);
  const breakdownResetKey = JSON.stringify([breakdownCampaignFilters, dateRange, appliedCustomRange]);
  const propertyPagination = usePagination(propertyBreakdown, 10, breakdownResetKey);
  const deepDivePagination = usePagination(
    deepDiveCampaigns,
    10,
    JSON.stringify([deepDiveSearchQuery, deepDiveSourceFilters, dateRangeResetKey])
  );

  // Filtered table rows. By default only Active campaigns (by their overall
  // status, not just this range's); campaigns picked in the dropdown show
  // whatever their status, and the Campaign Status column filter wins.
  const filteredCampaigns = useMemo(() => {
    return campaignsList.filter(c => {
      const status = campaignByName[c.name.toLowerCase()]?.status ?? c.status;
      const matchesSearch = !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = selectedStatuses.length > 0
        ? selectedStatuses.includes(status)
        : campaignFilterActive || status === "Active";
      return matchesSearch && matchesStatus && inSelectedCampaigns(c.name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignsList, campaignByName, searchQuery, selectedStatuses, campaignFilterActive, selectedCampaignNames]);

  const currentPageClamped = Math.min(currentPage, Math.max(1, Math.ceil(filteredCampaigns.length / rowsPerPage)));
  const paginatedCampaigns = filteredCampaigns.slice((currentPageClamped - 1) * rowsPerPage, currentPageClamped * rowsPerPage);

  const copyToClipboard = (field: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  };

  const getStatusBadge = (status: CampaignItem["status"]) => {
    switch (status) {
      case "Active":
        return <span className="inline-block px-3 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100/70 text-emerald-700 border border-emerald-300/80">Active</span>;
      case "Pause":
        return <span className="inline-block px-3 py-0.5 rounded-full text-[11px] font-medium bg-amber-100/70 text-amber-700 border border-amber-300/80">Pause</span>;
      case "Stopped":
        return <span className="inline-block px-3 py-0.5 rounded-full text-[11px] font-medium bg-rose-100/70 text-rose-700 border border-rose-300/80">Stopped</span>;
    }
  };

  return (
    <div className="space-y-4 pb-8 animate-fade-in text-slate-800">
      {/* Top Toggle Switcher: Campaigns vs Campaigns Analytics */}
      <div className="flex items-center gap-1.5">
        <div className="ui-toggle">
          <button
            onClick={() => setActiveTab("Campaigns")}
            className={`ui-toggle-item ${activeTab === "Campaigns" ? "ui-toggle-item-active" : ""}`}
          >
            Campaigns
          </button>
          <button
            onClick={() => setActiveTab("Analytics")}
            className={`ui-toggle-item ${activeTab === "Analytics" ? "ui-toggle-item-active" : ""}`}
          >
            Campaigns Analytics
          </button>
        </div>
      </div>

      {/* Date Filter & Metrics — one unified card matching the CRM dashboard's
          layout: a header bar (date range) sitting directly on top of the
          stat columns, separated by a divider instead of floating as a
          separate padded/shadowed card. Shown on both tabs. */}
          <div className="bg-slate-100/70 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
            {/* Header bar */}
            <div className="flex items-center px-4 py-2.5 text-[11px] border-b border-slate-200/60">
              <div className="flex items-center gap-1.5 font-bold text-slate-700">
                <span className="font-normal text-slate-500">Date Range</span>
                <DateRangeSelect
                  options={(["Today", "Yesterday", "This Week", "This Month", "All Time"] as const).map(v => ({ value: v, label: v }))}
                  value={dateRange}
                  customValue="Custom"
                  customRange={appliedCustomRange}
                  onPresetChange={(v) => { setDateRange(v); setAppliedCustomRange(null); setCurrentPage(1); }}
                  onCustomApply={handleDateRangeChange}
                />
              </div>
            </div>

            {/* Stat columns — click one to drill into the leads it counted,
                same "open the respective card" pattern as the CRM Dashboard. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
              {([
                { label: "Active Campaigns", value: summaryMetrics.activeCampaigns, color: "text-slate-900", subtitle: null as string | null },
                // Real synced-lead count is the main number; the ad
                // platforms' own self-reported total (Meta + Google +
                // Other's leadsGenerated, same Date Range) is shown
                // alongside it so both real numbers are visible together —
                // they're genuinely different metrics and can legitimately
                // differ, this isn't a mismatch to resolve. Platform-
                // reported (Meta + Google + Other's own leadsGenerated) is
                // the headline number here; the real synced-lead count
                // sits underneath.
                { label: "Total Leads", value: platformReportedLeadsTotal, color: "text-slate-900", subtitle: `${summaryMetrics.totalLeads.toLocaleString("en-IN")} synced` },
                { label: "Qualified Leads", value: summaryMetrics.qualifiedLeads, color: "text-rose-600", subtitle: null },
                { label: "Site Visits", value: summaryMetrics.siteVisits, color: "text-amber-500", subtitle: null },
                { label: "Follow Ups", value: summaryMetrics.followUps, color: "text-blue-500", subtitle: null },
                { label: "Call Backs", value: summaryMetrics.callBacks, color: "text-orange-500", subtitle: null }
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
                        {isDataLoading ? <LineSkeleton width={36} height={18} /> : s.value}
                      </span>
                      {s.subtitle && (
                        <span className="text-[10px] text-slate-400 block mt-0.5" title="Meta + Google + Other's own self-reported total for this Date Range">
                          {isDataLoading ? <LineSkeleton width={48} height={10} /> : s.subtitle}
                        </span>
                      )}
                    </div>
                    <ChevronRight className={`h-3.5 w-3.5 text-slate-300 transition-transform ${isActive ? "rotate-90 text-blue-500" : "group-hover:translate-x-0.5"}`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stat-card drill-down — "Active Campaigns" opens the matching
              campaigns (it's a campaigns count, not a leads count); the
              other four open the actual leads behind that number. Either
              way a search box lets the user narrow down a long list. */}
          {selectedCategory && (() => {
            // "Active Campaigns" is the one card that's a count of campaigns
            // rather than leads, so it's the only one that drills into the
            // campaign table (small, client-side). Total Leads/Qualified
            // Leads/Site Visits/Follow Ups/Call Backs all drill into the
            // real, individual leads behind that number via
            // categoryDrillList (real server pagination/search — a single
            // capped fetch here would silently undercount a big category).
            const isCampaignsTable = selectedCategory === "Active Campaigns";
            const shownCount = isCampaignsTable ? shownCampaigns.length : categoryDrillList.totalCount;

            return (
              <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden animate-fade-in">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200/80 gap-3">
                  <h3 className="ui-section-title whitespace-nowrap">
                    {selectedCategory}
                    <span className="text-slate-400 font-medium ml-1.5">({shownCount})</span>
                  </h3>
                  <div className="flex items-center gap-3 flex-1 justify-end">
                    <div className="relative w-full max-w-[220px]">
                      <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        value={isCampaignsTable ? campaignsDrillSearch : categoryDrillList.search}
                        onChange={(e) => isCampaignsTable
                          ? (setCampaignsDrillSearch(e.target.value), setCampaignsDrillPage(1))
                          : categoryDrillList.setSearch(e.target.value)}
                        placeholder={isCampaignsTable ? "Search campaign..." : "Search name, phone, campaign..."}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:border-[#0B1E6E]"
                      />
                    </div>
                    <button type="button" onClick={() => setSelectedCategory(null)} className="text-slate-400 hover:text-slate-700 shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  {isCampaignsTable ? (
                    <table className="table-fixed w-full text-left border-collapse min-w-[600px]">
                      <colgroup>
                        <col />
                        <col />
                        <col />
                        <col />
                      </colgroup>
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-slate-100 text-left text-xs font-bold text-slate-800 whitespace-nowrap">
                          <th className="px-4 py-3 whitespace-nowrap">Campaign Name</th>
                          <th className="px-4 py-3 whitespace-nowrap">Total Leads</th>
                          <th className="px-4 py-3 whitespace-nowrap">Qualified Leads</th>
                          <th className="px-4 py-3 whitespace-nowrap">Site Visit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[12px] text-slate-700">
                        {isDataLoading && shownCampaignsPage.length === 0 ? (
                          <TableRowsSkeleton rows={6} columns={4} />
                        ) : shownCampaignsPage.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-slate-400 italic">
                              No campaigns found.
                            </td>
                          </tr>
                        ) : (
                          shownCampaignsPage.map((c) => (
                            <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-2.5 font-semibold text-slate-900 [overflow-wrap:anywhere]">{c.name}</td>
                              <td className="px-4 py-2.5">{c.totalLeads}</td>
                              <td className="px-4 py-2.5">{c.qualifiedLeads}</td>
                              <td className="px-4 py-2.5">{c.siteVisit}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <table className="table-fixed w-full text-left border-collapse min-w-[600px]">
                      <colgroup>
                        <col />
                        <col />
                        <col />
                        <col />
                      </colgroup>
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-slate-100 text-left text-xs font-bold text-slate-800 whitespace-nowrap">
                          <th className="px-4 py-3 whitespace-nowrap">Name</th>
                          <th className="px-4 py-3 whitespace-nowrap">Phone</th>
                          <th className="px-4 py-3 whitespace-nowrap">Status</th>
                          <th className="px-4 py-3 whitespace-nowrap">Campaign</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[12px] text-slate-700">
                        {categoryDrillList.loading && categoryDrillList.rows.length === 0 ? (
                          <TableRowsSkeleton rows={6} columns={4} />
                        ) : categoryDrillList.totalCount === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-slate-400 italic">
                              No leads found for this category.
                            </td>
                          </tr>
                        ) : (
                          categoryDrillList.rows.map((l) => (
                            <tr
                              key={l.id}
                              onClick={(e) => {
                                const target = e.target as HTMLElement;
                                if (!e.currentTarget.contains(target)) return;
                                if (target.closest("button, a, input, select, textarea, label, [role='button'], [role='combobox'], [role='listbox']")) return;
                                if (window.getSelection()?.toString()) return;
                                setQuickViewLead(l);
                              }}
                              className="cursor-pointer hover:bg-slate-50/50 transition-colors"
                            >
                              <td className="px-4 py-2.5 font-semibold text-slate-900 [overflow-wrap:anywhere]">{l.name}</td>
                              <td className="px-4 py-2.5 font-mono [overflow-wrap:anywhere]">{isAdmin ? l.phone : maskPhone(l.phone)}</td>
                              <td className="px-4 py-2.5">{l.status}</td>
                              <td className="px-4 py-2.5 [overflow-wrap:anywhere]">{l.campaign || l.source || "—"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
                <TablePagination
                  {...(isCampaignsTable
                    ? {
                        totalRows: shownCampaigns.length,
                        page: campaignsDrillCurrentPage,
                        rowsPerPage: campaignsDrillRowsPerPage,
                        onPageChange: setCampaignsDrillPage,
                        onRowsPerPageChange: (n: number) => { setCampaignsDrillRowsPerPage(n); setCampaignsDrillPage(1); }
                      }
                    : categoryDrillList.paginationProps)}
                  rowsPerPageOptions={[8, 25, 50, 100]}
                  rowLabel={isCampaignsTable ? "Campaign" : "Lead"}
                />
              </div>
            );
          })()}

      {activeTab === "Analytics" ? (
        analyticsDrillView ? (
          <div className="space-y-4">
            {/* Breadcrumb — clicking "Campaigns Analytics" returns to the main view. */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <button type="button" onClick={() => setAnalyticsDrillView(null)} className="hover:text-slate-700 hover:underline">
                Campaigns Analytics
              </button>
              <span>&gt;</span>
              <span className="text-slate-700 font-semibold">
                Qualified Leads
              </span>
            </div>

            {(
              <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200/80">
                  <h3 className="ui-section-title">
                    Qualified Leads
                    <span className="text-slate-400 font-medium ml-1.5">({qualifiedLeadsList.totalCount}) — {analyticsDrillView.campaign.name}</span>
                  </h3>
                  <div className="flex items-center gap-2.5">
                    <div className="relative w-full max-w-[200px]">
                      <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        value={qualifiedLeadsList.search}
                        onChange={(e) => qualifiedLeadsList.setSearch(e.target.value)}
                        placeholder="Search lead name..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:border-[#0B1E6E]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={exportQualifiedLeadsCsv}
                      disabled={exportingQualifiedLeadsCsv}
                      title="Download CSV"
                      className="inline-flex items-center justify-center h-9 w-9 border border-slate-300/80 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      <Download className="h-4 w-4 text-blue-600" />
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto md:overflow-y-auto md:max-h-[55vh]">
                  <table className="table-fixed w-full text-left border-collapse min-w-[1200px]">
                    <colgroup>
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr className="border-b border-slate-200/80 text-left text-xs font-bold text-slate-800 whitespace-nowrap">
                        <th className="px-4 py-3 whitespace-nowrap">Lead Name</th>
                        <th className="px-4 py-3 whitespace-nowrap">Email</th>
                        <th className="px-4 py-3 whitespace-nowrap">Status</th>
                        <th className="px-4 py-3 whitespace-nowrap">Assigned To</th>
                        <th className="px-4 py-3 whitespace-nowrap">Date</th>
                        <th className="px-4 py-3 whitespace-nowrap">Notes</th>
                        <th className="px-4 py-3 whitespace-nowrap">Next Call Date</th>
                        <th className="px-4 py-3 whitespace-nowrap">Campaign</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[12px] font-medium text-slate-700">
                      {qualifiedLeadsList.loading && qualifiedLeadsList.rows.length === 0 ? (
                        <TableRowsSkeleton rows={6} columns={8} />
                      ) : qualifiedLeadsList.totalCount === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-slate-400 italic">No qualified leads found for this campaign.</td>
                        </tr>
                      ) : (
                        qualifiedLeadsList.rows.map(l => (
                          <tr
                            key={l.id}
                            onClick={(e) => {
                              const target = e.target as HTMLElement;
                              if (!e.currentTarget.contains(target)) return;
                              if (target.closest("button, a, input, select, textarea, label, [role='button'], [role='combobox'], [role='listbox']")) return;
                              if (window.getSelection()?.toString()) return;
                              setQuickViewLead(l);
                            }}
                            className="cursor-pointer hover:bg-slate-50/50 transition-colors"
                          >
                            <td className="px-4 py-3 text-slate-900 font-semibold [overflow-wrap:anywhere]">{l.name}</td>
                            <td className="px-4 py-3 [overflow-wrap:anywhere]" title={isAdmin ? l.email : undefined}>{l.email ? (isAdmin ? l.email : maskEmail(l.email)) : "—"}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{l.status}</td>
                            <td className="px-4 py-3 [overflow-wrap:anywhere]">{l.assignedAgent || "—"}</td>
                            <td className="px-4 py-3">{l.createdAtStr || "—"}</td>
                            <td className="px-4 py-3"><div className="line-clamp-3 [overflow-wrap:anywhere]" title={latestLogMessage(l)}>{latestLogMessage(l)}</div></td>
                            <td className="px-4 py-3"><NextCallCell next={nextCallDateFor(l.id, qualifiedLeadsPageFollowups)} /></td>
                            <td className="px-4 py-3 [overflow-wrap:anywhere]">{l.campaign || l.source || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <TablePagination {...qualifiedLeadsList.paginationProps} rowLabel="Lead" />
              </div>
            )}
          </div>
        ) : (
        <div className="space-y-4">
          {/* Spend/Leads-over-time chart + Campaign Type/Status breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className="text-xs font-semibold text-slate-500">Spend &amp; Leads over time</span>
                <div className="flex items-center gap-2">
                  <SearchableSelect
                    variant="pill"
                    options={[...CHART_VIEW_MODES]}
                    value={chartViewMode}
                    onChange={(v) => setChartViewMode(v as ChartViewMode)}
                    panelWidth={120}
                    align="right"
                  />
                  <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 rounded-full px-2.5 py-1">{chartCategory}</span>
                </div>
              </div>
              {chartData.length === 0 ? (
                <div className="h-[260px] flex items-center justify-center text-xs text-slate-400 italic">
                  No data yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    {chartViewMode !== "Leads" && (
                      <YAxis
                        yAxisId="spend"
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => `₹${(v / 1000).toFixed(1)}K`}
                      />
                    )}
                    {chartViewMode !== "Spend" && (
                      <YAxis
                        yAxisId="leads"
                        orientation={chartViewMode === "Both" ? "right" : "left"}
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                    )}
                    <Tooltip
                      formatter={(v, name) => name === "Spend" ? [formatCurrency(Number(v)), "Spend"] : [Number(v), chartCategory]}
                      labelStyle={{ fontSize: 11, fontWeight: 600 }}
                      contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: "#e2e8f0" }}
                    />
                    {chartViewMode !== "Leads" && (
                      <ReferenceLine yAxisId="spend" y={chartSpendAverage} stroke="#6366f1" strokeDasharray="4 4" />
                    )}
                    {chartViewMode !== "Spend" && (
                      <ReferenceLine yAxisId="leads" y={chartLeadsAverage} stroke="#f59e0b" strokeDasharray="4 4" />
                    )}
                    {chartViewMode !== "Leads" && (
                      <Line yAxisId="spend" type="monotone" dataKey="spend" name="Spend" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    )}
                    {chartViewMode !== "Spend" && (
                      <Line yAxisId="leads" type="monotone" dataKey="leads" name={chartCategory} stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
              <div className="flex items-center gap-4 text-[11px] text-slate-500 mt-2">
                {chartViewMode !== "Leads" && (
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#6366f1]" />Spend</span>
                )}
                {chartViewMode !== "Spend" && (
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#f59e0b]" />{chartCategory}</span>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm p-4 flex flex-col">
              <div className="flex justify-end mb-3">
                <SearchableSelect
                  variant="pill"
                  options={[{ value: "Platform", label: "Campaign Type" }, { value: "Status", label: "Campaign Status" }]}
                  value={typeGroupBy}
                  onChange={(v) => { setTypeGroupBy(v as typeof typeGroupBy); setSelectedChartTypes({}); }}
                  panelWidth={160}
                  align="right"
                />
              </div>
              <div className="grid grid-cols-[1fr_64px_112px] gap-x-4 items-center text-[10px] font-bold text-slate-400 uppercase pb-2 border-b border-slate-100">
                <span>{typeGroupBy === "Platform" ? "Type" : "Status"}</span>
                <span className="text-right">Leads</span>
                <span className="text-right">Spend</span>
              </div>
              <div className="overflow-y-auto max-h-[160px] divide-y divide-slate-50">
                {isDataLoading && typeBreakdown.length === 0 ? (
                  <CardListSkeleton count={4} />
                ) : typeBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No data yet.</p>
                ) : (
                  typeBreakdown.map(t => (
                    <label key={t.type} className="grid grid-cols-[1fr_64px_112px] gap-x-4 items-start py-2 text-xs cursor-pointer">
                      <span className="flex items-center gap-2 min-w-0 pt-0.5">
                        <input
                          type="checkbox"
                          checked={isTypeChecked(t.type)}
                          onChange={() => toggleChartType(t.type)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-[#0B1E6E] focus:ring-0 focus:ring-offset-0 shrink-0"
                        />
                        {typeGroupBy === "Platform" && (t.type === "Meta" || t.type === "Google") && (
                          <PlatformIcon platform={t.type} />
                        )}
                        <span className="font-semibold text-slate-700 [overflow-wrap:anywhere]">{t.type}</span>
                      </span>
                      {/* Platform-reported is the headline (matches the Total
                          row below and the top summary bar), real synced
                          count as a subtitle — so this type's own number and
                          the grand Total always visibly reconcile, instead of
                          a row showing a small synced-only figure that looks
                          like it doesn't add up to a much bigger Total. */}
                      <span className="text-slate-600 text-right">
                        {t.platformLeads.toLocaleString("en-IN")}
                        <span className="block text-right text-[9px] font-normal text-slate-400">{t.leads.toLocaleString("en-IN")} synced</span>
                      </span>
                      <span className="text-slate-600 text-right pt-0.5">{formatCurrency(t.spend)}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="grid grid-cols-[1fr_64px_112px] gap-x-4 items-start pt-2 mt-2 border-t border-slate-200 text-xs font-bold text-slate-900">
                <span className="pt-0.5">Total</span>
                <span className="text-right">
                  {isDataLoading ? <LineSkeleton width={32} height={14} /> : typeBreakdownPlatformLeadsTotal.toLocaleString("en-IN")}
                  {/* Spend was actually incurred to generate this larger
                      platform-reported count, not the smaller real-synced
                      number underneath it — shown here so the two never
                      read as an unexplained ~10x cost-per-lead jump. */}
                  <span className="block text-right text-[9px] font-normal text-slate-400" title="Real individual leads actually synced into the CRM for this Date Range">
                    {isDataLoading ? <LineSkeleton width={40} height={10} /> : `${typeBreakdownLeadsTotal.toLocaleString("en-IN")} synced`}
                  </span>
                </span>
                <span className="text-right pt-0.5">{isDataLoading ? <LineSkeleton width={48} height={14} /> : formatCurrency(typeBreakdownTotal)}</span>
              </div>
            </div>
          </div>

          {/* Property / Status breakdown table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200/80">
              <div className="flex items-center gap-4 text-sm">
                <button
                  type="button"
                  onClick={() => setBreakdownTab("Property")}
                  className={`font-bold pb-1 border-b-2 transition-colors ${breakdownTab === "Property" ? "text-[#0B1E6E] border-[#0B1E6E]" : "text-slate-400 border-transparent hover:text-slate-600"}`}
                >
                  Property
                </button>
                <button
                  type="button"
                  onClick={() => setBreakdownTab("Status")}
                  className={`font-bold pb-1 border-b-2 transition-colors ${breakdownTab === "Status" ? "text-[#0B1E6E] border-[#0B1E6E]" : "text-slate-400 border-transparent hover:text-slate-600"}`}
                >
                  Status
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={exportBreakdownCsv}
                  disabled={exportingBreakdownCsv}
                  title="Download CSV"
                  className="inline-flex items-center justify-center h-9 w-9 border border-slate-300/80 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  <Download className="h-4 w-4 text-blue-600" />
                </button>
                {breakdownTab === "Status" && statusBreakdownCapped && (
                  <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 whitespace-nowrap">
                    Showing the last 12 months — pick a range to see more
                  </span>
                )}
                <DateRangePicker
                  value={appliedCustomRange}
                  onChange={handleDateRangeChange}
                  emptyLabel={todayStr}
                />
                <SearchableMultiSelect variant="toolbar"
                  options={breakdownCampaignOptions}
                  selected={breakdownCampaignFilters}
                  onChange={setBreakdownCampaignFilters}
                  placeholder="All Campaigns"
                  searchPlaceholder="Search campaigns..."
                  panelWidth={240}
                  align="right"
                />
                <button
                  type="button"
                  onClick={() => setIsBreakdownFilterOpen(true)}
                  className="ui-btn ui-btn-secondary border"
                >
                  <Sliders className="h-4 w-4 text-blue-600" />
                  Filter
                </button>
              </div>
            </div>

            <div className="overflow-x-auto md:overflow-y-auto md:max-h-[40vh]">
              <table className="table-fixed w-full text-left border-collapse" style={{ minWidth: (breakdownTab === "Property" ? BREAKDOWN_COLUMNS.filter(c => breakdownVisibleColumns[c.key]).length : STATUS_COLUMNS.filter(c => statusVisibleColumns[c.key]).length) * 150 }}>
                <colgroup>
                  {breakdownTab === "Property" ? (
                    <>
                      {breakdownVisibleColumns.property && <col />}
                      {breakdownVisibleColumns.date && <col />}
                      {breakdownVisibleColumns.campaigns && <col />}
                      {breakdownVisibleColumns.source && <col />}
                      {breakdownVisibleColumns.totalLeads && <col />}
                      {breakdownVisibleColumns.qualifiedLeads && <col />}
                      {breakdownVisibleColumns.unqualifiedLeads && <col />}
                      {breakdownVisibleColumns.qualifiedPercent && <col />}
                      {breakdownVisibleColumns.cpl && <col />}
                      {breakdownVisibleColumns.qcpl && <col />}
                      {breakdownVisibleColumns.spend && <col />}
                      {breakdownVisibleColumns.qSpend && <col />}
                    </>
                  ) : (
                    <>
                      {statusVisibleColumns.date && <col />}
                      {statusVisibleColumns.campaign && <col />}
                      {statusVisibleColumns.totalLeads && <col />}
                      {statusVisibleColumns.source && <col />}
                      {statusVisibleColumns.newLead && <col />}
                      {statusVisibleColumns.callBack && <col />}
                      {statusVisibleColumns.followUps && <col />}
                      {statusVisibleColumns.siteVisits && <col />}
                      {statusVisibleColumns.eoi && <col />}
                      {statusVisibleColumns.booked && <col />}
                      {statusVisibleColumns.dead && <col />}
                      {statusVisibleColumns.rnr && <col />}
                      {statusVisibleColumns.lowBudget && <col />}
                      {statusVisibleColumns.otherReq && <col />}
                      {statusVisibleColumns.cancelled && <col />}
                    </>
                  )}
                </colgroup>
                {breakdownTab === "Property" ? (
                  <>
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr className="border-b border-slate-200/80 text-left text-xs font-bold text-slate-800 whitespace-nowrap">
                        {breakdownVisibleColumns.property && <th className="px-4 py-3 whitespace-nowrap">Property</th>}
                        {breakdownVisibleColumns.date && <th className="px-4 py-3 whitespace-nowrap">Date</th>}
                        {breakdownVisibleColumns.campaigns && <th className="px-4 py-3 whitespace-nowrap">Campaigns</th>}
                        {breakdownVisibleColumns.source && <th className="px-4 py-3 whitespace-nowrap">Source</th>}
                        {breakdownVisibleColumns.totalLeads && <th className="px-4 py-3 whitespace-nowrap">Total Leads</th>}
                        {breakdownVisibleColumns.qualifiedLeads && <th className="px-4 py-3 whitespace-nowrap">Qualified Leads</th>}
                        {breakdownVisibleColumns.unqualifiedLeads && <th className="px-4 py-3 whitespace-nowrap">Unqualified Leads</th>}
                        {breakdownVisibleColumns.qualifiedPercent && <th className="px-4 py-3 whitespace-nowrap">Qualified %age</th>}
                        {breakdownVisibleColumns.cpl && <th className="px-4 py-3 whitespace-nowrap">CPL</th>}
                        {breakdownVisibleColumns.qcpl && <th className="px-4 py-3 whitespace-nowrap">QCPL</th>}
                        {breakdownVisibleColumns.spend && <th className="px-4 py-3 whitespace-nowrap">Spend</th>}
                        {breakdownVisibleColumns.qSpend && <th className="px-4 py-3 whitespace-nowrap">Q Spend</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[12px] font-medium text-slate-700">
                      {isDataLoading && propertyBreakdown.length === 0 ? (
                        <TableRowsSkeleton rows={6} columns={BREAKDOWN_COLUMNS.filter(c => breakdownVisibleColumns[c.key]).length || 1} />
                      ) : propertyBreakdown.length === 0 ? (
                        <tr>
                          <td colSpan={BREAKDOWN_COLUMNS.filter(c => breakdownVisibleColumns[c.key]).length || 1} className="px-4 py-8 text-center text-slate-400 italic">No campaign/ad-spend data yet.</td>
                        </tr>
                      ) : (
                        propertyPagination.pageRows.map(row => {
                          const isExpanded = expandedProperties.has(row.property);
                          return (
                            <React.Fragment key={row.property}>
                              <tr className={`transition-colors ${isExpanded ? "bg-slate-50/70" : "hover:bg-slate-50/50"}`}>
                                {breakdownVisibleColumns.property && (
                                  <td className="px-4 py-3 text-slate-900 font-semibold">
                                    <button
                                      type="button"
                                      onClick={() => togglePropertyExpanded(row.property)}
                                      aria-expanded={isExpanded}
                                      className="group/expand flex items-center gap-2 w-full min-w-0 text-left hover:text-[#0B1E6E] transition-colors"
                                      title={row.property}
                                    >
                                      <span className="truncate">{row.property}</span>
                                      {row.campaigns.length > 0 && <span className="glass-chip shrink-0">+{row.campaigns.length}</span>}
                                      <span className="ml-auto"><ExpandChevron open={isExpanded} /></span>
                                    </button>
                                  </td>
                                )}
                                {breakdownVisibleColumns.date && <td className="px-4 py-3 text-slate-300" title="Not tracked yet — no per-campaign date field ingested">—</td>}
                                {breakdownVisibleColumns.campaigns && <td className="px-4 py-3">{row.campaigns.length}</td>}
                                {breakdownVisibleColumns.source && <td className="px-4 py-3"><PlatformIcons platforms={row.platforms} /></td>}
                                {breakdownVisibleColumns.totalLeads && <td className="px-4 py-3">{row.totalLeads}</td>}
                                {breakdownVisibleColumns.qualifiedLeads && <td className="px-4 py-3">{row.qualifiedLeads}</td>}
                                {breakdownVisibleColumns.unqualifiedLeads && <td className="px-4 py-3">{row.unqualifiedLeads}</td>}
                                {breakdownVisibleColumns.qualifiedPercent && <td className="px-4 py-3">{row.qualifiedPercent.toFixed(1)}%</td>}
                                {breakdownVisibleColumns.cpl && <td className="px-4 py-3">{row.cpl.toFixed(2)}</td>}
                                {breakdownVisibleColumns.qcpl && <td className="px-4 py-3">{row.qcpl.toFixed(2)}</td>}
                                {breakdownVisibleColumns.spend && <td className="px-4 py-3 font-semibold text-slate-800">{formatCurrency(row.spend)}</td>}
                                {breakdownVisibleColumns.qSpend && <td className="px-4 py-3 text-slate-300" title="Not tracked yet — no qualified-spend field defined">—</td>}
                              </tr>
                              {/* In-place expansion: a sub-header and one row per
                                  campaign, always rendered so each cell can slide
                                  open and closed (CollapsibleCell). */}
                              {(() => {
                                const head = (show: boolean, label = "") => show && (
                                  <td className="p-0"><CollapsibleCell open={isExpanded} className="px-4 py-2">{label}</CollapsibleCell></td>
                                );
                                return (
                                  <tr className={`bg-slate-50/70 text-left text-xs font-bold text-slate-800 whitespace-nowrap ${isExpanded ? "" : "!border-t-0"}`} aria-hidden={!isExpanded}>
                                    {head(breakdownVisibleColumns.property, "Campaign")}
                                    {head(breakdownVisibleColumns.date)}
                                    {head(breakdownVisibleColumns.campaigns)}
                                    {head(breakdownVisibleColumns.source, "Source")}
                                    {head(breakdownVisibleColumns.totalLeads, "Total Leads")}
                                    {head(breakdownVisibleColumns.qualifiedLeads, "Qualified Leads")}
                                    {head(breakdownVisibleColumns.unqualifiedLeads, "Unqualified Leads")}
                                    {head(breakdownVisibleColumns.qualifiedPercent, "Qualified %age")}
                                    {head(breakdownVisibleColumns.cpl, "CPL")}
                                    {head(breakdownVisibleColumns.qcpl, "QCPL")}
                                    {head(breakdownVisibleColumns.spend, "Spend")}
                                    {head(breakdownVisibleColumns.qSpend)}
                                  </tr>
                                );
                              })()}
                              {row.campaigns.map(c => {
                                const cQualifiedPercent = c.totalLeads > 0 ? (c.qualifiedLeads / c.totalLeads) * 100 : 0;
                                const cell = (show: boolean, content: React.ReactNode, extra = "") => show && (
                                  <td className="p-0"><CollapsibleCell open={isExpanded} className={`px-4 py-2.5 ${extra}`}>{content}</CollapsibleCell></td>
                                );
                                return (
                                  <tr key={c.id} className={`bg-slate-50/70 transition-colors ${isExpanded ? "hover:bg-slate-50" : "!border-t-0"}`} aria-hidden={!isExpanded}>
                                    {cell(breakdownVisibleColumns.property, (
                                      <span className="flex items-center gap-2 min-w-0">
                                        <span className="h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
                                        <span className="[overflow-wrap:anywhere]">{c.name}</span>
                                      </span>
                                    ), "text-slate-700")}
                                    {cell(breakdownVisibleColumns.date, "—", "text-slate-300")}
                                    {cell(breakdownVisibleColumns.campaigns, null)}
                                    {cell(breakdownVisibleColumns.source, <PlatformIcon platform={c.platform} />)}
                                    {cell(breakdownVisibleColumns.totalLeads, c.totalLeads)}
                                    {cell(breakdownVisibleColumns.qualifiedLeads, c.qualifiedLeads)}
                                    {cell(breakdownVisibleColumns.unqualifiedLeads, c.unqualifiedLeads)}
                                    {cell(breakdownVisibleColumns.qualifiedPercent, `${cQualifiedPercent.toFixed(1)}%`)}
                                    {cell(breakdownVisibleColumns.cpl, c.cpl.toFixed(2))}
                                    {cell(breakdownVisibleColumns.qcpl, computeCPL(c.spend, c.qualifiedLeads).toFixed(2))}
                                    {cell(breakdownVisibleColumns.spend, formatCurrency(c.spend), "font-semibold text-slate-800")}
                                    {cell(breakdownVisibleColumns.qSpend, "—", "text-slate-300")}
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </>
                ) : (
                  <>
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr className="border-b border-slate-200/80 text-left text-xs font-bold text-slate-800 whitespace-nowrap">
                        {statusVisibleColumns.date && <th className="px-4 py-3 whitespace-nowrap">Date</th>}
                        {statusVisibleColumns.campaign && <th className="px-4 py-3 whitespace-nowrap">Campaign</th>}
                        {statusVisibleColumns.totalLeads && <th className="px-4 py-3 whitespace-nowrap">Total Leads</th>}
                        {statusVisibleColumns.source && <th className="px-4 py-3 whitespace-nowrap">Source</th>}
                        {statusVisibleColumns.newLead && <th className="px-4 py-3 whitespace-nowrap">New Lead</th>}
                        {statusVisibleColumns.callBack && <th className="px-4 py-3 whitespace-nowrap">Call Back</th>}
                        {statusVisibleColumns.followUps && <th className="px-4 py-3 whitespace-nowrap">Follow ups</th>}
                        {statusVisibleColumns.siteVisits && <th className="px-4 py-3 whitespace-nowrap">Site Visits</th>}
                        {statusVisibleColumns.eoi && <th className="px-4 py-3 whitespace-nowrap">EOI</th>}
                        {statusVisibleColumns.booked && <th className="px-4 py-3 whitespace-nowrap">Booked</th>}
                        {statusVisibleColumns.dead && <th className="px-4 py-3 whitespace-nowrap">Dead</th>}
                        {statusVisibleColumns.rnr && <th className="px-4 py-3 whitespace-nowrap">RNR</th>}
                        {statusVisibleColumns.lowBudget && <th className="px-4 py-3 whitespace-nowrap">Low Budget</th>}
                        {statusVisibleColumns.otherReq && <th className="px-4 py-3 whitespace-nowrap">Other Req.</th>}
                        {statusVisibleColumns.cancelled && <th className="px-4 py-3 whitespace-nowrap">Cancelled</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[12px] font-medium text-slate-700">
                      {statusBreakdownLoading && statusDateBreakdown.length === 0 ? (
                        <TableRowsSkeleton rows={6} columns={STATUS_COLUMNS.filter(c => statusVisibleColumns[c.key]).length || 1} />
                      ) : statusBreakdownResult.totalCount === 0 ? (
                        <tr>
                          <td colSpan={STATUS_COLUMNS.filter(c => statusVisibleColumns[c.key]).length || 1} className="px-4 py-8 text-center text-slate-400 italic">No ad-spend data yet.</td>
                        </tr>
                      ) : (
                        statusDateBreakdown.map(row => (
                          <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                            {statusVisibleColumns.date && <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{row.dateLabel}</td>}
                            {statusVisibleColumns.campaign && <td className="px-4 py-3 text-slate-900 font-semibold [overflow-wrap:anywhere]">{row.campaign}</td>}
                            {statusVisibleColumns.totalLeads && <td className="px-4 py-3">{row.totalLeads}</td>}
                            {statusVisibleColumns.source && <td className="px-4 py-3"><PlatformIcon platform={normalizePlatform(row.platform)} /></td>}
                            {statusVisibleColumns.newLead && <td className="px-4 py-3">{row.newLead}</td>}
                            {statusVisibleColumns.callBack && <td className="px-4 py-3">{row.callBack}</td>}
                            {statusVisibleColumns.followUps && <td className="px-4 py-3">{row.followUps}</td>}
                            {statusVisibleColumns.siteVisits && <td className="px-4 py-3">{row.siteVisits}</td>}
                            {statusVisibleColumns.eoi && <td className="px-4 py-3">{row.eoi}</td>}
                            {statusVisibleColumns.booked && <td className="px-4 py-3">{row.booked}</td>}
                            {statusVisibleColumns.dead && <td className="px-4 py-3">{row.dead}</td>}
                            {statusVisibleColumns.rnr && <td className="px-4 py-3">{row.rnr}</td>}
                            {statusVisibleColumns.lowBudget && <td className="px-4 py-3">{row.lowBudget}</td>}
                            {statusVisibleColumns.otherReq && <td className="px-4 py-3 text-slate-300" title="Not tracked yet — no matching lead status defined">—</td>}
                            {statusVisibleColumns.cancelled && <td className="px-4 py-3 text-slate-300" title="Not tracked yet — no matching lead status defined">—</td>}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </>
                )}
              </table>
            </div>
            {breakdownTab === "Property" ? (
              <TablePagination {...propertyPagination.paginationProps} rowLabel="Property" />
            ) : (
              <TablePagination
                totalRows={statusBreakdownResult.totalCount}
                page={statusBreakdownPage}
                rowsPerPage={statusBreakdownRowsPerPage}
                onPageChange={setStatusBreakdownPage}
                onRowsPerPageChange={(n) => { setStatusBreakdownRowsPerPage(n); setStatusBreakdownPage(1); }}
                rowLabel="Row"
              />
            )}
          </div>

          {/* Filter button's column-visibility drawer for the Property/Status
              breakdown table — a full-height right-docked drawer, same
              pattern as the Campaigns tab's own Filter drawer. */}
          {isBreakdownFilterOpen && createPortal(
            <div className="fixed inset-0 z-[100]">
              <div className="fixed inset-0" onClick={() => setIsBreakdownFilterOpen(false)} />
              <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-slide-in">
                <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
                  <h3 className="ui-title">Filter</h3>
                  <button onClick={() => setIsBreakdownFilterOpen(false)} className="text-slate-400 hover:text-slate-700">
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>
                <div className="px-5 py-5 flex-1 overflow-y-auto">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-extrabold text-slate-800">Columns</span>
                    <button
                      type="button"
                      onClick={breakdownTab === "Property" ? toggleSelectAllBreakdownColumns : toggleSelectAllStatusColumns}
                      className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-[#0B1E6E]"
                    >
                      <Minus className="h-3 w-3" />
                      Select All
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {breakdownTab === "Property" ? (
                      BREAKDOWN_COLUMNS.map(c => {
                        const isOn = breakdownVisibleColumns[c.key];
                        return (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => toggleBreakdownColumn(c.key)}
                            className={`text-left pl-3 pr-2.5 py-2.5 text-xs rounded-lg border transition-colors truncate ${
                              isOn
                                ? "border-slate-200 border-l-[3px] border-l-[#0B1E6E] font-extrabold text-slate-900"
                                : "border-slate-200 font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {c.label}
                          </button>
                        );
                      })
                    ) : (
                      STATUS_COLUMNS.map(c => {
                        const isOn = statusVisibleColumns[c.key];
                        return (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => toggleStatusColumn(c.key)}
                            className={`text-left pl-3 pr-2.5 py-2.5 text-xs rounded-lg border transition-colors truncate ${
                              isOn
                                ? "border-slate-200 border-l-[3px] border-l-[#0B1E6E] font-extrabold text-slate-900"
                                : "border-slate-200 font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {c.label}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Campaign Deep Dive — every individual campaign, not aggregated
              by property/status like the table above. "Ad Set Name" and
              "Ad creative Name" come from the real Meta/Google ad-level
              sync (adLevelSpendRecords); a campaign shows "—" there only
              until that campaign's own ad-level backfill has landed (real
              platform rate limits bound how fast that happens — see the
              Sync button below), never as an invented value. */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
              <h3 className="ui-section-title">Campaign Deep Dive</h3>
              <div className="flex items-center gap-2">
                {adSyncNote && <span className="text-[11px] text-slate-500 max-w-[320px] text-right">{adSyncNote}</span>}
                <button
                  onClick={handleAdSpendSync}
                  disabled={adSyncStatus === "syncing"}
                  className="ui-btn ui-btn-secondary border disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Fetch the latest Ad Set Name/Ad creative Name/spend from Meta and Google now, instead of waiting for the automatic sync"
                >
                  <RefreshCw size={16} className={adSyncStatus === "syncing" ? "animate-spin" : ""} />
                  {adSyncStatus === "syncing" ? "Syncing…" : "Sync"}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto md:overflow-y-auto md:max-h-[45vh]">
              <table className="table-fixed w-full text-left border-collapse min-w-[1180px]">
                {/* The three name columns are wide; Source and the four number
                    columns share one equal width. The expanded ad rows below
                    reuse the same widths so they line up. */}
                <colgroup>
                  <col className="w-[19%]" />
                  <col className="w-[9%]" />
                  <col className="w-[19%]" />
                  <col className="w-[17%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b border-slate-200/80 text-left text-xs font-bold text-slate-800 whitespace-nowrap">
                    <th className="px-4 py-3 whitespace-nowrap">
                      {deepDiveSearchOpen ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={deepDiveSearchQuery}
                            onChange={(e) => setDeepDiveSearchQuery(e.target.value)}
                            placeholder="Filter campaign..."
                            className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs font-normal focus:outline-none w-full min-w-0"
                          />
                          <button onClick={() => { setDeepDiveSearchQuery(""); setDeepDiveSearchOpen(false); }} className="text-slate-400 hover:text-slate-600">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span>Campaign Name</span>
                          <button onClick={() => setDeepDiveSearchOpen(true)} className="text-slate-400 hover:text-slate-700" title="Search campaign">
                            <Search className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </th>
                    <th className="px-4 py-3 whitespace-nowrap">
                      <SearchableMultiSelect
                        variant="inline"
                        label="Source"
                        options={deepDiveSourceOptions}
                        selected={deepDiveSourceFilters}
                        onChange={setDeepDiveSourceFilters}
                        renderLabel={(l) => <PlatformLabel text={l} />}
                        panelWidth={180}
                      />
                    </th>
                    <th className="px-4 py-3 whitespace-nowrap">Ad Set Name</th>
                    <th className="px-4 py-3 whitespace-nowrap">Ad creative Name</th>
                    <th className="px-4 py-3 whitespace-nowrap">Total Leads</th>
                    <th className="px-4 py-3 whitespace-nowrap">Qualified Leads</th>
                    <th className="px-4 py-3 whitespace-nowrap">CPL</th>
                    <th className="px-4 py-3 whitespace-nowrap">Spend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[12px] font-medium text-slate-700">
                  {isDataLoading && deepDiveCampaigns.length === 0 ? (
                    <TableRowsSkeleton rows={6} columns={8} />
                  ) : deepDiveCampaigns.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400 italic">No campaigns found matching filter.</td>
                    </tr>
                  ) : (
                    deepDivePagination.pageRows.map(c => {
                      const adRows = adRowsByCampaign[c.name.toLowerCase()] || [];
                      const topAd = adRows[0];
                      const isOpen = expandedDeepDiveCampaigns.has(c.name);
                      return (
                      <React.Fragment key={c.id}>
                      <tr className={`transition-colors ${isOpen ? "bg-slate-50/70" : "hover:bg-slate-50/50"}`}>
                        <td className="px-4 py-3 text-slate-900 font-semibold [overflow-wrap:anywhere]">{c.name}</td>
                        <td className="px-4 py-3"><PlatformIcon platform={c.platform} /></td>
                        <td className="px-4 py-3">
                          {topAd ? (
                            <button
                              type="button"
                              onClick={() => toggleDeepDiveCampaign(c.name)}
                              aria-expanded={isOpen}
                              className="group/adset flex items-center gap-2 w-full min-w-0 text-left text-slate-700 hover:text-[#0B1E6E] transition-colors"
                              title={topAd.adSetName}
                            >
                              <span className="truncate">{topAd.adSetName}</span>
                              {adRows.length > 1 && <span className="glass-chip shrink-0">+{adRows.length - 1}</span>}
                              <span
                                className={`ml-auto shrink-0 h-5 w-5 rounded-full flex items-center justify-center transition-all duration-300 ${
                                  isOpen ? "bg-[#0B1E6E] text-white rotate-180" : "bg-slate-100 text-slate-500 group-hover/adset:bg-slate-200"
                                }`}
                              >
                                <ChevronDown className="h-3 w-3" />
                              </span>
                            </button>
                          ) : (
                            <span className="text-slate-300" title="No ad-set data synced for this campaign yet">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3" title={topAd ? (topAd.creativeName || topAd.adType || topAd.adName || undefined) : undefined}>
                          {topAd ? <span className="line-clamp-2 [overflow-wrap:anywhere]">{topAd.creativeName || topAd.adType || topAd.adName || "—"}</span> : <span className="text-slate-300" title="No ad-creative data synced for this campaign yet">—</span>}
                        </td>
                        {/* Leads the spend actually produced — CPL is spend ÷ this. */}
                        <td className="px-4 py-3 font-semibold text-slate-800">{c.totalLeads}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setAnalyticsDrillView({ type: "qualifiedLeads", campaign: c })}
                            className="font-semibold text-[#0B1E6E] hover:underline"
                          >
                            {c.qualifiedLeads}
                          </button>
                        </td>
                        <td className="px-4 py-3" title={c.totalLeads > 0 ? "Spend ÷ total leads" : "No leads yet, so no cost per lead"}>
                          {c.totalLeads > 0 ? c.cpl.toFixed(2) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{formatCurrency(c.spend)}</td>
                      </tr>
                      {/* In-place expansion: every real ad set / ad of this
                          campaign, lined up under the same columns. Always
                          rendered so it can animate both open and closed
                          (grid-rows 0fr <-> 1fr). */}
                      <tr className={isOpen ? "" : "!border-t-0"} aria-hidden={!isOpen}>
                        <td colSpan={8} className="p-0">
                          <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                            <div className="overflow-hidden">
                              <div className={`bg-slate-50/70 transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}>
                                {adRows.length > 0 && (
                                  <div className="max-h-72 overflow-y-auto">
                                    <table className="table-fixed w-full text-left border-collapse">
                                      <colgroup>
                                        <col className="w-[19%]" /><col className="w-[9%]" /><col className="w-[19%]" /><col className="w-[17%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[9%]" />
                                      </colgroup>
                                      <tbody className="divide-y divide-slate-100">
                                        {adRows.map(ad => {
                                          const syncedLeads = adLevelLeadStatsMap.get(ad.adId)?.syncedLeads ?? 0;
                                          return (
                                            <tr key={ad.adId}>
                                              <td className="px-4 py-2.5" />
                                              <td className="px-4 py-2.5" />
                                              <td className="px-4 py-2.5">
                                                <span className="flex items-center gap-2 min-w-0" title={ad.adSetName}>
                                                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
                                                  <span className="truncate">{ad.adSetName}</span>
                                                </span>
                                              </td>
                                              <td className="px-4 py-2.5"><span className="block truncate" title={ad.creativeName || ad.adType || ad.adName || undefined}>{ad.creativeName || ad.adType || ad.adName || "—"}</span></td>
                                              <td className="px-4 py-2.5">{Math.max(ad.platformReportedLeads, syncedLeads)}</td>
                                              <td className="px-4 py-2.5">{qualifiedLeadsForAd(ad.adId)}</td>
                                              <td className="px-4 py-2.5">{cplForAd(ad) > 0 ? cplForAd(ad).toFixed(2) : <span className="text-slate-300">—</span>}</td>
                                              <td className="px-4 py-2.5 font-semibold text-slate-800">{formatCurrency(ad.spend)}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                      </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination {...deepDivePagination.paginationProps} rowLabel="Campaign" />
          </div>
        </div>
        )
      ) : (
        <>
          {/* Action toolbar (Date Picker Pill, Campaigns, Filter Button) */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              {/* Date Range Picker Pill */}
              <DateRangePicker
                value={appliedCustomRange}
                onChange={handleDateRangeChange}
                emptyLabel={todayStr}
              />

              {/* Campaigns multi-select — filters the table and the summary cards */}
              <SearchableMultiSelect variant="toolbar"
                options={breakdownCampaignOptions}
                selected={campaignFilters}
                onChange={(next) => { setCampaignFilters(next); setCurrentPage(1); }}
                placeholder="All Campaigns"
                searchPlaceholder="Search campaigns..."
                panelWidth={240}
                align="right"
              />

              {/* Filter Button → column-visibility Settings drawer */}
              <button
                type="button"
                onClick={() => setIsColumnsSettingsOpen(true)}
                className="ui-btn ui-btn-secondary border"
              >
                <Sliders className="h-4 w-4 text-blue-600" />
                Filter
              </button>
            </div>
          </div>

          {/* Main Campaigns Data Table — row area is height-capped with its
              own scroll (independent of the page scroll), so a long/paged
              list doesn't stretch the whole page; header stays pinned and
              the pagination footer below stays out of the scroll area. */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto md:overflow-y-auto md:max-h-[45vh]">
              <table className="table-fixed w-full text-left border-collapse" style={{ minWidth: (2 + CAMPAIGN_COLUMNS.filter(c => campaignVisibleColumns[c.key]).length) * 150 }}>
                <colgroup>
                  <col />
                  <col />
                  {campaignVisibleColumns.status && <col />}
                  {campaignVisibleColumns.qualifiedLeads && <col />}
                  {campaignVisibleColumns.unqualifiedLeads && <col />}
                  {campaignVisibleColumns.siteVisit && <col />}
                  {campaignVisibleColumns.cpl && <col />}
                  {campaignVisibleColumns.date && <col />}
                  {campaignVisibleColumns.ctr && <col />}
                  {campaignVisibleColumns.clicks && <col />}
                  {campaignVisibleColumns.adSetName && <col />}
                  {campaignVisibleColumns.impressions && <col />}
                  {campaignVisibleColumns.source && <col />}
                  {campaignVisibleColumns.qcpl && <col />}
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-200/80 text-left text-xs font-bold text-slate-800 whitespace-nowrap bg-white">
                    <th className="px-4 py-3 whitespace-nowrap">
                      {searchOpen ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            placeholder="Filter campaign..."
                            className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs font-normal focus:outline-none w-full min-w-0"
                          />
                          <button onClick={() => { setSearchQuery(""); setSearchOpen(false); }} className="text-slate-400 hover:text-slate-600">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span>Campaign Name</span>
                          <button onClick={() => setSearchOpen(true)} className="text-slate-400 hover:text-slate-700" title="Search campaign">
                            <Search className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </th>
                    <th className="px-4 py-3 whitespace-nowrap">Total Leads</th>
                    {campaignVisibleColumns.status && (
                      <th className="px-4 py-3 whitespace-nowrap">
                        <SearchableMultiSelect
                          variant="inline"
                          label="Campaign Status"
                          options={CAMPAIGN_STATUSES}
                          selected={selectedStatuses}
                          onChange={(next) => { setSelectedStatuses(next); setCurrentPage(1); }}
                          panelWidth={180}
                        />
                      </th>
                    )}
                    {campaignVisibleColumns.qualifiedLeads && <th className="px-4 py-3 whitespace-nowrap">Qualified Leads</th>}
                    {campaignVisibleColumns.unqualifiedLeads && <th className="px-4 py-3 whitespace-nowrap">Unqualified Leads</th>}
                    {campaignVisibleColumns.siteVisit && <th className="px-4 py-3 whitespace-nowrap">Site Visit</th>}
                    {campaignVisibleColumns.cpl && <th className="px-4 py-3 whitespace-nowrap">CPL</th>}
                    {campaignVisibleColumns.date && <th className="px-4 py-3 whitespace-nowrap">Date</th>}
                    {campaignVisibleColumns.ctr && <th className="px-4 py-3 whitespace-nowrap">CTR</th>}
                    {campaignVisibleColumns.clicks && <th className="px-4 py-3 whitespace-nowrap">Clicks</th>}
                    {campaignVisibleColumns.adSetName && <th className="px-4 py-3 whitespace-nowrap">Ad Set Name</th>}
                    {campaignVisibleColumns.impressions && <th className="px-4 py-3 whitespace-nowrap">Impressions</th>}
                    {campaignVisibleColumns.source && <th className="px-4 py-3 whitespace-nowrap">Source</th>}
                    {campaignVisibleColumns.qcpl && <th className="px-4 py-3 whitespace-nowrap">QCPL</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[12px] font-medium text-slate-700">
                  {isDataLoading && paginatedCampaigns.length === 0 ? (
                    <TableRowsSkeleton rows={6} columns={2 + CAMPAIGN_COLUMNS.filter(c => campaignVisibleColumns[c.key]).length} />
                  ) : paginatedCampaigns.length === 0 ? (
                    <tr>
                      <td colSpan={2 + CAMPAIGN_COLUMNS.filter(c => campaignVisibleColumns[c.key]).length} className="px-4 py-8 text-center text-slate-400 italic">
                        No campaigns found matching filter.
                      </td>
                    </tr>
                  ) : (
                    paginatedCampaigns.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3.5 text-slate-900 font-semibold [overflow-wrap:anywhere]">{row.name}</td>
                        <td className="px-4 py-3.5">{row.totalLeads}</td>
                        {campaignVisibleColumns.status && <td className="px-4 py-3.5 whitespace-nowrap">{getStatusBadge(row.status)}</td>}
                        {campaignVisibleColumns.qualifiedLeads && <td className="px-4 py-3.5">{row.qualifiedLeads}</td>}
                        {campaignVisibleColumns.unqualifiedLeads && <td className="px-4 py-3.5">{row.unqualifiedLeads}</td>}
                        {campaignVisibleColumns.siteVisit && <td className="px-4 py-3.5">{row.siteVisit}</td>}
                        {campaignVisibleColumns.cpl && <td className="px-4 py-3.5 font-semibold text-slate-800">{row.cpl.toFixed(2)}</td>}
                        {campaignVisibleColumns.date && <td className="px-4 py-3.5 text-slate-300" title="Not tracked yet — no per-campaign date field ingested">—</td>}
                        {campaignVisibleColumns.ctr && (
                          <td className="px-4 py-3.5" title="Clicks ÷ impressions, as reported by the ad platform">
                            {row.clicks !== null && row.impressions ? `${((row.clicks / row.impressions) * 100).toFixed(2)}%` : <span className="text-slate-300">—</span>}
                          </td>
                        )}
                        {campaignVisibleColumns.clicks && (
                          <td className="px-4 py-3.5">{row.clicks !== null ? row.clicks.toLocaleString("en-IN") : <span className="text-slate-300">—</span>}</td>
                        )}
                        {campaignVisibleColumns.adSetName && (() => {
                          // Ad sets under this campaign, biggest spender first.
                          const adSets = Array.from(new Set((adRowsByCampaign[row.name.toLowerCase()] || []).map(a => a.adSetName).filter(Boolean)));
                          return (
                            <td className="px-4 py-3.5 [overflow-wrap:anywhere]" title={adSets.join(", ")}>
                              {adSets.length === 0 ? <span className="text-slate-300">—</span> : (
                                <>
                                  {adSets[0]}
                                  {adSets.length > 1 && <span className="ml-1 text-[10px] font-bold text-slate-400">+{adSets.length - 1} more</span>}
                                </>
                              )}
                            </td>
                          );
                        })()}
                        {campaignVisibleColumns.impressions && (
                          <td className="px-4 py-3.5">{row.impressions !== null ? row.impressions.toLocaleString("en-IN") : <span className="text-slate-300">—</span>}</td>
                        )}
                        {campaignVisibleColumns.source && <td className="px-4 py-3.5">{row.platform}</td>}
                        {campaignVisibleColumns.qcpl && (
                          <td className="px-4 py-3.5" title="Spend ÷ qualified leads">
                            {row.qualifiedLeads > 0 ? computeCPL(row.spend, row.qualifiedLeads).toFixed(2) : <span className="text-slate-300">—</span>}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer / Pagination Controls */}
            <TablePagination
              totalRows={filteredCampaigns.length}
              page={currentPageClamped}
              rowsPerPage={rowsPerPage}
              onPageChange={setCurrentPage}
              onRowsPerPageChange={setRowsPerPage}
              rowLabel="Campaign"
            />
          </div>
        </>
      )}

      {/* Filter button's column-visibility Settings panel — a full-height
          right-docked drawer (same pattern as the admin leads page): no dark
          backdrop, the rest of the page stays visible, closes on an
          invisible click-outside catcher. */}
      {isColumnsSettingsOpen && createPortal(
        <div className="fixed inset-0 z-[100]">
          <div className="fixed inset-0" onClick={() => setIsColumnsSettingsOpen(false)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-slide-in">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
              <h3 className="ui-title">Filter</h3>
              <button
                onClick={() => setIsColumnsSettingsOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="px-5 py-5 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold text-slate-800">Columns</span>
                <button
                  type="button"
                  onClick={toggleSelectAllCampaignColumns}
                  className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-[#0B1E6E]"
                >
                  <Minus className="h-3 w-3" />
                  Select All
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {CAMPAIGN_COLUMNS.map(c => {
                  const isOn = campaignVisibleColumns[c.key];
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => toggleCampaignColumn(c.key)}
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

      {/* Lead panel — opened by clicking a lead row in the lists above. */}
      <LeadDetailDrawer
        lead={quickViewLead}
        isOpen={quickViewLead !== null}
        onClose={() => setQuickViewLead(null)}
        onUpdateStatus={updateLeadStatus}
      />
    </div>
  );
}
