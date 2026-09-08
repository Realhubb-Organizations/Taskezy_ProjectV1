"use client";

import React, { useState, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useApp, Lead } from "@/context/AppContext";
import { computeCPL } from "@/lib/reportMetrics";
import { WhatsAppIcon, CallIcon } from "@/components/icons/ContactIcons";
import {
  ChevronDown,
  Calendar,
  Search,
  ChevronRight,
  Filter,
  CheckCircle,
  X,
  Phone,
  Mail,
  Copy,
  Check,
  Building,
  Sliders,
  Minus
} from "lucide-react";

interface CampaignItem {
  id: string;
  name: string;
  status: "Active" | "Pause" | "Stopped";
  totalLeads: number;
  qualifiedLeads: number;
  unqualifiedLeads: number;
  siteVisit: number;
  cpl: number;
  platform: "Meta" | "Google" | "Other";
}

const CAMPAIGN_STATUSES: CampaignItem["status"][] = ["Active", "Pause", "Stopped"];
const QUALIFIED_LEAD_STATUSES = ["Interested", "Connected", "Visit Schedule", "Site Visit", "Booking Done", "Booked"];
const UNQUALIFIED_LEAD_STATUSES = ["Dead", "Invalid", "RNR"];
const SITE_VISIT_LEAD_STATUSES = ["Visit Schedule", "Site Visit"];
const FOLLOW_UP_LEAD_STATUSES = ["Follow-ups", "Call Back"];

// The campaigns table's togglable columns (beyond the always-shown Campaign
// Name + Total Leads) — driven by the Filter button's panel, mirroring the
// same drawer pattern on the admin leads page. "Date", "CTR", "Clicks",
// "Impressions", "Ad set name", "Source" and "QCPL" have no real backing
// field yet (no ad-set/click/impression-level ingestion in AdSpendRecord),
// so their cells honestly render "—" for every row rather than inventing
// numbers — same convention the leads page uses for its own untracked
// columns.
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

export default function AdminCampaignsPage() {
  const { leads, adSpendRecords } = useApp();

  // Navigation tab inside Campaigns page ("Campaigns" | "Campaigns Analytics")
  const [activeTab, setActiveTab] = useState<"Campaigns" | "Analytics">("Campaigns");

  // Summary Card Filters — "Custom" is set behind the scenes by the
  // toolbar's calendar picker (below), not offered as its own menu option
  // here, same split as the admin leads page.
  const [dateRange, setDateRange] = useState<"Today" | "Yesterday" | "This Week" | "This Month" | "All Time" | "Custom">("Today");
  const [summaryDateMenuOpen, setSummaryDateMenuOpen] = useState(false);
  const [summaryDateMenuPos, setSummaryDateMenuPos] = useState<{ top: number; left: number } | null>(null);
  const summaryDateBtnRef = useRef<HTMLButtonElement>(null);

  // Stat card drill-down — clicking a summary card shows the underlying
  // leads it counted, same "open the respective card" pattern as the CRM
  // Dashboard page.
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [drillSearchQuery, setDrillSearchQuery] = useState("");
  const toggleCategory = (label: string) => {
    setSelectedCategory(prev => (prev === label ? null : label));
    setDrillSearchQuery("");
  };

  // Table Filters & Search
  const today = new Date();
  const todayStr = today.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const [calendarPickerOpen, setCalendarPickerOpen] = useState(false);
  const [calendarMenuPos, setCalendarMenuPos] = useState<{ top: number; left: number } | null>(null);
  const calendarBtnRef = useRef<HTMLButtonElement>(null);
  const [customRangeStartDraft, setCustomRangeStartDraft] = useState("");
  const [customRangeEndDraft, setCustomRangeEndDraft] = useState("");
  const [appliedCustomRange, setAppliedCustomRange] = useState<{ start: string; end: string } | null>(null);

  // Campaign Status column-header filter — a checkbox dropdown opened from
  // the table's "Campaign Status" header, rather than a single-select pill.
  const [selectedStatuses, setSelectedStatuses] = useState<Record<CampaignItem["status"], boolean>>({
    Active: true, Pause: true, Stopped: true
  });
  const [statusColumnMenuOpen, setStatusColumnMenuOpen] = useState(false);
  const [statusColumnMenuPos, setStatusColumnMenuPos] = useState<{ top: number; left: number } | null>(null);
  const statusColumnBtnRef = useRef<HTMLButtonElement>(null);

  const toggleStatusFilter = (s: CampaignItem["status"]) => {
    setSelectedStatuses(prev => ({ ...prev, [s]: !prev[s] }));
    setCurrentPage(1);
  };

  const toggleSelectAllStatuses = () => {
    const allOn = CAMPAIGN_STATUSES.every(s => selectedStatuses[s]);
    const next: Record<CampaignItem["status"], boolean> = { ...selectedStatuses };
    CAMPAIGN_STATUSES.forEach(s => { next[s] = !allOn; });
    setSelectedStatuses(next);
    setCurrentPage(1);
  };

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

  // Helper for portaled menus
  const openPositionedMenu = (
    ref: React.RefObject<HTMLButtonElement>,
    setPos: (p: { top: number; left: number } | null) => void,
    setOpen: (fn: (o: boolean) => boolean) => void,
    align: "left" | "right" = "left",
    panelWidth = 180
  ) => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: align === "left" ? rect.left : rect.right - panelWidth });
    setOpen(o => !o);
  };

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
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    if (range === "all") return true;
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

  // Derive campaigns data from context adSpend + leads
  const campaignsList: CampaignItem[] = useMemo(() => {
    // Collect all campaign names from ad spend records and lead sources
    const spendCampaignMap: Record<string, { spend: number; platformLeads: number; status: "Active" | "Pause" | "Stopped"; platform: "Meta" | "Google" | "Other" }> = {};
    
    adSpendRecords.forEach(rec => {
      const name = rec.accountName;
      if (!spendCampaignMap[name]) {
        let st: "Active" | "Pause" | "Stopped" = "Active";
        if (rec.campaignStatus === "INACTIVE") st = "Stopped";
        if ((rec.campaignStatus as string) === "PAUSED") st = "Pause";
        
        let plat: "Meta" | "Google" | "Other" = "Meta";
        if (rec.platform.toLowerCase().includes("google")) plat = "Google";
        else if (!rec.platform.toLowerCase().includes("meta") && !rec.platform.toLowerCase().includes("facebook")) plat = "Other";

        spendCampaignMap[name] = {
          spend: 0,
          platformLeads: 0,
          status: st,
          platform: plat
        };
      }
      spendCampaignMap[name].spend += rec.spend;
      spendCampaignMap[name].platformLeads += rec.leadsGenerated;
    });

    const result: CampaignItem[] = [];

    Object.keys(spendCampaignMap).forEach((cName, idx) => {
      if (!result.some(r => r.name.toLowerCase() === cName.toLowerCase())) {
        const item = spendCampaignMap[cName];
        // "Total Leads" is about intake volume, so it respects the selected
        // Date Range. Qualified/Unqualified/Site Visit are current pipeline
        // status snapshots (like the CRM Dashboard's own cards) — a lead
        // qualified today should still count even if it came in last week,
        // so those read off every matched lead regardless of creation date.
        const campaignLeads = leads.filter(l => (l.campaign || l.source)?.toLowerCase() === cName.toLowerCase());
        const campaignLeadsInRange = campaignLeads.filter(leadInSelectedRange);
        const total = Math.max(item.platformLeads, campaignLeadsInRange.length);
        const qualified = campaignLeads.filter(l => QUALIFIED_LEAD_STATUSES.includes(l.status)).length;
        const unqualified = campaignLeads.filter(l => UNQUALIFIED_LEAD_STATUSES.includes(l.status)).length;
        const siteVisits = campaignLeads.filter(l => SITE_VISIT_LEAD_STATUSES.includes(l.status)).length;
        const cplVal = total > 0 ? Number((item.spend / total).toFixed(2)) : 0;

        result.push({
          id: `dyn-${idx}`,
          name: cName,
          status: item.status,
          totalLeads: total,
          qualifiedLeads: qualified,
          unqualifiedLeads: unqualified,
          siteVisit: siteVisits,
          cpl: cplVal,
          platform: item.platform
        });
      }
    });

    return result;
  }, [adSpendRecords, leads, appliedCustomRange, dateRange, today]);

  // Aggregate Metrics for Top Summary Card
  const summaryMetrics = useMemo(() => {
    const activeCount = campaignsList.filter(c => c.status === "Active").length;
    const totalLeadsSum = campaignsList.reduce((acc, c) => acc + c.totalLeads, 0);
    const qualifiedLeadsSum = campaignsList.reduce((acc, c) => acc + c.qualifiedLeads, 0);
    const siteVisitsSum = campaignsList.reduce((acc, c) => acc + c.siteVisit, 0);
    const followUpsCount = leads.filter(l => FOLLOW_UP_LEAD_STATUSES.includes(l.status)).length;

    return {
      activeCampaigns: activeCount,
      totalLeads: totalLeadsSum,
      qualifiedLeads: qualifiedLeadsSum,
      siteVisits: siteVisitsSum,
      followUps: followUpsCount
    };
  }, [campaignsList, leads]);

  // Each lead-based stat card's real underlying lead list — same
  // predicates as the counts above — so clicking a card can drill into
  // exactly what it counted, mirroring the CRM Dashboard's drill-down.
  // Only "Total Leads" is intake-volume (respects Date Range); Qualified
  // Leads/Site Visits/Follow Ups are current pipeline-status snapshots,
  // same convention as summaryMetrics above, so they aren't date-filtered.
  const categoryLeads: Record<string, Lead[]> = useMemo(() => {
    return {
      "Total Leads": leads.filter(leadInSelectedRange),
      "Qualified Leads": leads.filter(l => QUALIFIED_LEAD_STATUSES.includes(l.status)),
      "Site Visits": leads.filter(l => SITE_VISIT_LEAD_STATUSES.includes(l.status)),
      "Follow Ups": leads.filter(l => FOLLOW_UP_LEAD_STATUSES.includes(l.status))
    };
  }, [leads, dateRange, appliedCustomRange, today]);

  // "Active Campaigns" drills into campaigns, not leads — it's a count of
  // campaigns (matching the summary card's own unit), not a leads list.
  const activeCampaignsDrill = useMemo(() => campaignsList.filter(c => c.status === "Active"), [campaignsList]);

  // Campaigns Analytics tab — real ad-spend totals, no hardcoded figures.
  const analyticsSummary = useMemo(() => {
    const metaSpend = adSpendRecords.filter(r => r.platform === "Meta").reduce((acc, r) => acc + r.spend, 0);
    const googleSpend = adSpendRecords.filter(r => r.platform === "Google").reduce((acc, r) => acc + r.spend, 0);
    const totalSpend = metaSpend + googleSpend;
    const totalLeadsGenerated = adSpendRecords.reduce((acc, r) => acc + r.leadsGenerated, 0);
    return { metaSpend, googleSpend, avgCPL: computeCPL(totalSpend, totalLeadsGenerated) };
  }, [adSpendRecords]);

  const formatCurrency = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Filtered table rows
  const filteredCampaigns = useMemo(() => {
    return campaignsList.filter(c => {
      const matchesSearch = !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = selectedStatuses[c.status];
      return matchesSearch && matchesStatus;
    });
  }, [campaignsList, searchQuery, selectedStatuses]);

  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / rowsPerPage));
  const currentPageClamped = Math.min(currentPage, totalPages);
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
        <div className="bg-slate-200/70 p-1 rounded-xl flex items-center gap-1">
          <button
            onClick={() => setActiveTab("Campaigns")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "Campaigns" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Campaigns
          </button>
          <button
            onClick={() => setActiveTab("Analytics")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "Analytics" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Campaigns Analytics
          </button>
        </div>
      </div>

      {activeTab === "Analytics" ? (
        /* Redirect or show integrated marketing analytics directly */
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-slate-800">Campaign Performance & ROI Analytics</h3>
            <Link href="/dashboard/reports?tab=marketing" className="text-xs text-blue-600 font-semibold hover:underline">
              Open Full Reports Portal &rarr;
            </Link>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            View detailed performance breakdowns, CPL tracking, lead quality, and property-wise ad spend analytics.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-400 font-medium">Meta Ad Spend</span>
              <p className="text-xl font-bold text-slate-800 mt-1">{formatCurrency(analyticsSummary.metaSpend)}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-400 font-medium">Google Ads Spend</span>
              <p className="text-xl font-bold text-slate-800 mt-1">{formatCurrency(analyticsSummary.googleSpend)}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-400 font-medium">Average CPL</span>
              <p className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(analyticsSummary.avgCPL)}</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Date Filter & Metrics — one unified card matching the CRM dashboard's
              layout: a header bar (date range) sitting directly on top of the
              stat columns, separated by a divider instead of floating as a
              separate padded/shadowed card. */}
          <div className="bg-slate-100/70 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
            {/* Header bar */}
            <div className="flex items-center px-4 py-2.5 text-[11px] border-b border-slate-200/60">
              <div className="flex items-center gap-1.5 font-bold text-slate-700">
                <span className="font-normal text-slate-500">Date Range</span>
                <div className="relative">
                  <button
                    ref={summaryDateBtnRef}
                    onClick={() => openPositionedMenu(summaryDateBtnRef, setSummaryDateMenuPos, setSummaryDateMenuOpen, "left", 140)}
                    className="flex items-center gap-1.5 bg-white border border-slate-300/80 rounded-md px-2 py-0.5 font-black text-slate-800 text-[11px] hover:bg-slate-50 transition-colors"
                  >
                    {dateRange}
                    <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${summaryDateMenuOpen ? "rotate-180" : ""}`} />
                  </button>
                  {summaryDateMenuOpen && summaryDateMenuPos && createPortal(
                    <>
                      <div className="fixed inset-0 z-[60]" onClick={() => setSummaryDateMenuOpen(false)} />
                      <div
                        className="fixed z-[70] w-36 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 overflow-hidden"
                        style={{ top: summaryDateMenuPos.top, left: summaryDateMenuPos.left }}
                      >
                        {(["Today", "Yesterday", "This Week", "This Month", "All Time"] as const).map(opt => (
                          <button
                            key={opt}
                            onClick={() => { setDateRange(opt); setAppliedCustomRange(null); setSummaryDateMenuOpen(false); setCurrentPage(1); }}
                            className={`w-full text-left px-3 py-1.5 text-xs font-bold transition-colors ${
                              dateRange === opt ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </>,
                    document.body
                  )}
                </div>
              </div>
            </div>

            {/* Stat columns — click one to drill into the leads it counted,
                same "open the respective card" pattern as the CRM Dashboard. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
              {([
                { label: "Active Campaigns", value: summaryMetrics.activeCampaigns, color: "text-slate-900" },
                { label: "Total Leads", value: summaryMetrics.totalLeads, color: "text-slate-900" },
                { label: "Qualified Leads", value: summaryMetrics.qualifiedLeads, color: "text-rose-600" },
                { label: "Site Visits", value: summaryMetrics.siteVisits, color: "text-amber-500" },
                { label: "Follow Ups", value: summaryMetrics.followUps, color: "text-blue-500" }
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
                      <span className={`text-lg font-extrabold mt-1.5 block ${s.color}`}>{s.value}</span>
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
            const isCampaignsDrill = selectedCategory === "Active Campaigns";
            const q = drillSearchQuery.trim().toLowerCase();
            const shownCampaigns = isCampaignsDrill
              ? activeCampaignsDrill.filter(c => !q || c.name.toLowerCase().includes(q))
              : [];
            const shownLeads = !isCampaignsDrill
              ? (categoryLeads[selectedCategory] || []).filter(l =>
                  !q || l.name.toLowerCase().includes(q) || l.phone.includes(q) || (l.campaign || l.source || "").toLowerCase().includes(q)
                )
              : [];
            const shownCount = isCampaignsDrill ? shownCampaigns.length : shownLeads.length;

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
                        onChange={(e) => setDrillSearchQuery(e.target.value)}
                        placeholder={isCampaignsDrill ? "Search campaign..." : "Search name, phone, campaign..."}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:border-[#0B1E6E]"
                      />
                    </div>
                    <button type="button" onClick={() => setSelectedCategory(null)} className="text-slate-400 hover:text-slate-700 shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {isCampaignsDrill ? (
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-500">
                          <th className="px-5 py-2.5">Campaign Name</th>
                          <th className="px-5 py-2.5">Total Leads</th>
                          <th className="px-5 py-2.5">Qualified Leads</th>
                          <th className="px-5 py-2.5">Site Visit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[12px] text-slate-700">
                        {shownCampaigns.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-5 py-6 text-center text-slate-400 italic">
                              No active campaigns found.
                            </td>
                          </tr>
                        ) : (
                          shownCampaigns.map(c => (
                            <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-5 py-2.5 font-semibold text-slate-900">{c.name}</td>
                              <td className="px-5 py-2.5">{c.totalLeads}</td>
                              <td className="px-5 py-2.5">{c.qualifiedLeads}</td>
                              <td className="px-5 py-2.5">{c.siteVisit}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead className="sticky top-0 bg-white">
                        <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-500">
                          <th className="px-5 py-2.5">Name</th>
                          <th className="px-5 py-2.5">Phone</th>
                          <th className="px-5 py-2.5">Status</th>
                          <th className="px-5 py-2.5">Campaign</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[12px] text-slate-700">
                        {shownLeads.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-5 py-6 text-center text-slate-400 italic">
                              No leads found for this category.
                            </td>
                          </tr>
                        ) : (
                          shownLeads.map(l => (
                            <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-5 py-2.5 font-semibold text-slate-900">{l.name}</td>
                              <td className="px-5 py-2.5 font-mono">{l.phone}</td>
                              <td className="px-5 py-2.5">{l.status}</td>
                              <td className="px-5 py-2.5">{l.campaign || l.source || "—"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Action Toolbar (Date Picker Pill, Campaigns Dropdown, Filter Button) */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
            {/* Date Range Picker Pill */}
            <div className="relative">
              <button
                ref={calendarBtnRef}
                type="button"
                onClick={() => {
                  const rect = calendarBtnRef.current?.getBoundingClientRect();
                  if (rect) {
                    const panelWidth = 260;
                    const left = Math.max(8, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 8));
                    setCalendarMenuPos({ top: rect.bottom + 6, left });
                  }
                  setCustomRangeStartDraft(appliedCustomRange?.start || "");
                  setCustomRangeEndDraft(appliedCustomRange?.end || "");
                  setCalendarPickerOpen(o => !o);
                }}
                className="flex items-center gap-2 bg-white border border-slate-300/80 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-medium shadow-2xs hover:bg-slate-50 transition-colors"
              >
                <Calendar className="h-3.5 w-3.5 text-blue-600" />
                <span>{appliedCustomRange ? `${appliedCustomRange.start} to ${appliedCustomRange.end}` : todayStr}</span>
              </button>
              {calendarPickerOpen && calendarMenuPos && createPortal(
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setCalendarPickerOpen(false)} />
                  <div
                    className="fixed z-[70] w-64 max-w-[calc(100vw-1rem)] bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3"
                    style={{ top: calendarMenuPos.top, left: calendarMenuPos.left }}
                  >
                    <p className="text-[11px] font-bold text-slate-700">Filter campaigns by date range</p>
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-bold text-slate-400 uppercase">Start Date</label>
                      <input
                        type="date"
                        value={customRangeStartDraft}
                        onChange={(e) => {
                          const newStart = e.target.value;
                          setCustomRangeStartDraft(newStart);
                          // A previously-picked End Date can now be earlier
                          // than the new Start Date — clear it rather than
                          // silently keep an invalid range around.
                          if (customRangeEndDraft && newStart && customRangeEndDraft < newStart) {
                            setCustomRangeEndDraft("");
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0B1E6E]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-bold text-slate-400 uppercase">End Date</label>
                      <input
                        type="date"
                        value={customRangeEndDraft}
                        min={customRangeStartDraft || undefined}
                        onChange={(e) => {
                          const newEnd = e.target.value;
                          // The `min` attribute only blocks the native
                          // picker's own calendar UI — typing digits
                          // directly into the field still fires onChange
                          // with an out-of-range value, so this is the
                          // real guard: silently refuse an End Date
                          // earlier than the chosen Start Date.
                          if (customRangeStartDraft && newEnd && newEnd < customRangeStartDraft) return;
                          setCustomRangeEndDraft(newEnd);
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0B1E6E]"
                      />
                      {customRangeStartDraft && customRangeEndDraft && customRangeEndDraft < customRangeStartDraft && (
                        <p className="text-[10px] font-semibold text-red-500">End date can&apos;t be before the start date.</p>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAppliedCustomRange(null);
                          setDateRange("Today");
                          setCustomRangeStartDraft("");
                          setCustomRangeEndDraft("");
                          setCalendarPickerOpen(false);
                          setCurrentPage(1);
                        }}
                        className="flex-1 bg-slate-100 text-slate-600 font-bold text-[11px] py-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!customRangeStartDraft || !customRangeEndDraft) return;
                          if (customRangeEndDraft < customRangeStartDraft) return;
                          setAppliedCustomRange({ start: customRangeStartDraft, end: customRangeEndDraft });
                          setDateRange("Custom");
                          setCalendarPickerOpen(false);
                          setCurrentPage(1);
                        }}
                        disabled={!customRangeStartDraft || !customRangeEndDraft || customRangeEndDraft < customRangeStartDraft}
                        className="flex-1 bg-[#0B1E6E] hover:bg-[#081650] text-white font-bold text-[11px] py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </>,
                document.body
              )}
            </div>

            {/* Filter Button → column-visibility Settings drawer */}
            <button
              type="button"
              onClick={() => setIsColumnsSettingsOpen(true)}
              className="flex items-center gap-2 border border-slate-300/80 bg-white rounded-xl px-3.5 py-1.5 text-xs text-slate-700 font-semibold hover:bg-slate-50 shadow-2xs transition-colors"
            >
              <Sliders className="h-3.5 w-3.5 text-blue-600" />
              Filter
            </button>
          </div>

          {/* Main Campaigns Data Table (Clones image layout) */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse table-auto min-w-[850px]">
                <thead>
                  <tr className="border-b border-slate-200/80 text-[12px] font-bold text-slate-900 bg-white">
                    <th className="px-5 py-3.5">
                      {searchOpen ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            placeholder="Filter campaign..."
                            className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs font-normal focus:outline-none w-36"
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
                    <th className="px-5 py-3.5 whitespace-nowrap">Total Leads</th>
                    {campaignVisibleColumns.status && (
                      <th className="px-5 py-3.5 whitespace-nowrap">
                        <div className="relative inline-block">
                          <button
                            type="button"
                            ref={statusColumnBtnRef}
                            onClick={() => openPositionedMenu(statusColumnBtnRef, setStatusColumnMenuPos, setStatusColumnMenuOpen, "left", 180)}
                            className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                          >
                            <span>Campaign Status</span>
                            <ChevronDown className={`h-3 w-3 text-slate-800 transition-transform ${statusColumnMenuOpen ? "rotate-180" : ""}`} />
                          </button>
                          {statusColumnMenuOpen && statusColumnMenuPos && createPortal(
                            <>
                              <div className="fixed inset-0 z-[60]" onClick={() => setStatusColumnMenuOpen(false)} />
                              <div
                                className="fixed z-[70] w-44 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 text-xs font-medium overflow-hidden"
                                style={{ top: statusColumnMenuPos.top, left: statusColumnMenuPos.left }}
                              >
                                <button
                                  type="button"
                                  onClick={toggleSelectAllStatuses}
                                  className="w-full flex items-center gap-1.5 text-left px-3 py-1.5 text-slate-500 font-bold hover:bg-slate-50 border-b border-slate-100 transition-colors"
                                >
                                  <Minus className="h-3 w-3" />
                                  Select All
                                </button>
                                {CAMPAIGN_STATUSES.map(st => (
                                  <label
                                    key={st}
                                    className="flex items-center gap-2 px-3 py-1.5 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer transition-colors"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedStatuses[st]}
                                      onChange={() => toggleStatusFilter(st)}
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-[#0B1E6E] focus:ring-0 focus:ring-offset-0"
                                    />
                                    {st}
                                  </label>
                                ))}
                              </div>
                            </>,
                            document.body
                          )}
                        </div>
                      </th>
                    )}
                    {campaignVisibleColumns.qualifiedLeads && <th className="px-5 py-3.5 whitespace-nowrap">Qualified Leads</th>}
                    {campaignVisibleColumns.unqualifiedLeads && <th className="px-5 py-3.5 whitespace-nowrap">Unqualified Leads</th>}
                    {campaignVisibleColumns.siteVisit && <th className="px-5 py-3.5 whitespace-nowrap">Site Visit</th>}
                    {campaignVisibleColumns.cpl && <th className="px-5 py-3.5 whitespace-nowrap">CPL</th>}
                    {campaignVisibleColumns.date && <th className="px-5 py-3.5 whitespace-nowrap">Date</th>}
                    {campaignVisibleColumns.ctr && <th className="px-5 py-3.5 whitespace-nowrap">CTR</th>}
                    {campaignVisibleColumns.clicks && <th className="px-5 py-3.5 whitespace-nowrap">Clicks</th>}
                    {campaignVisibleColumns.adSetName && <th className="px-5 py-3.5 whitespace-nowrap">Ad Set Name</th>}
                    {campaignVisibleColumns.impressions && <th className="px-5 py-3.5 whitespace-nowrap">Impressions</th>}
                    {campaignVisibleColumns.source && <th className="px-5 py-3.5 whitespace-nowrap">Source</th>}
                    {campaignVisibleColumns.qcpl && <th className="px-5 py-3.5 whitespace-nowrap">QCPL</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[12px] font-medium text-slate-700">
                  {paginatedCampaigns.length === 0 ? (
                    <tr>
                      <td colSpan={2 + CAMPAIGN_COLUMNS.filter(c => campaignVisibleColumns[c.key]).length} className="px-5 py-8 text-center text-slate-400 italic">
                        No campaigns found matching filter.
                      </td>
                    </tr>
                  ) : (
                    paginatedCampaigns.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3.5 text-slate-900 font-semibold">{row.name}</td>
                        <td className="px-5 py-3.5">{row.totalLeads}</td>
                        {campaignVisibleColumns.status && <td className="px-5 py-3.5 whitespace-nowrap">{getStatusBadge(row.status)}</td>}
                        {campaignVisibleColumns.qualifiedLeads && <td className="px-5 py-3.5">{row.qualifiedLeads}</td>}
                        {campaignVisibleColumns.unqualifiedLeads && <td className="px-5 py-3.5">{row.unqualifiedLeads}</td>}
                        {campaignVisibleColumns.siteVisit && <td className="px-5 py-3.5">{row.siteVisit}</td>}
                        {campaignVisibleColumns.cpl && <td className="px-5 py-3.5 font-semibold text-slate-800">{row.cpl.toFixed(2)}</td>}
                        {campaignVisibleColumns.date && <td className="px-5 py-3.5 text-slate-300" title="Not tracked yet — no per-campaign date field ingested">—</td>}
                        {campaignVisibleColumns.ctr && <td className="px-5 py-3.5 text-slate-300" title="Not tracked yet — no click/impression-level data ingested">—</td>}
                        {campaignVisibleColumns.clicks && <td className="px-5 py-3.5 text-slate-300" title="Not tracked yet — no click-level data ingested">—</td>}
                        {campaignVisibleColumns.adSetName && <td className="px-5 py-3.5 text-slate-300" title="Not tracked yet — no ad-set-level data ingested">—</td>}
                        {campaignVisibleColumns.impressions && <td className="px-5 py-3.5 text-slate-300" title="Not tracked yet — no impression-level data ingested">—</td>}
                        {campaignVisibleColumns.source && <td className="px-5 py-3.5 text-slate-300" title="Not tracked yet — no ad-source field ingested">—</td>}
                        {campaignVisibleColumns.qcpl && <td className="px-5 py-3.5 text-slate-300" title="Not tracked yet — no qualified-lead cost field ingested">—</td>}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer / Pagination Controls */}
            <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 font-medium">
              <span className="font-bold text-slate-700">{filteredCampaigns.length} Rows</span>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span>Rows per page:</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                    className="bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-700 focus:outline-none"
                  >
                    {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>

                <span>
                  {filteredCampaigns.length === 0
                    ? "0-0 of 0"
                    : `${(currentPageClamped - 1) * rowsPerPage + 1}-${Math.min(currentPageClamped * rowsPerPage, filteredCampaigns.length)} of ${filteredCampaigns.length}`}
                </span>

                <div className="flex items-center gap-1 text-slate-400">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPageClamped <= 1}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPageClamped >= totalPages}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-600"
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>
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
              <h3 className="text-base font-extrabold text-slate-900">Filter</h3>
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

      {/* Quick View Drawer if needed */}
      {quickViewLead && createPortal(
        <div className="fixed inset-0 z-50">
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-xs" onClick={() => setQuickViewLead(null)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-slide-in z-10">
            <div className="px-5 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between">
              <div>
                <p className="text-base font-bold text-slate-900">{quickViewLead.name}</p>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{quickViewLead.phone}</p>
              </div>
              <button onClick={() => setQuickViewLead(null)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
