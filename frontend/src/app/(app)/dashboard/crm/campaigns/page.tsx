"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useApp, Lead, AdSpendRecord } from "@/context/AppContext";
import { computeCPL } from "@/lib/reportMetrics";
import { WhatsAppIcon, CallIcon, platformFromText } from "@/components/icons/ContactIcons";
import {
  ChevronDown,
  Calendar,
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
  CirclePlus,
  CircleMinus
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";

interface CampaignItem {
  id: string;
  name: string;
  status: "Active" | "Pause" | "Stopped";
  totalLeads: number;
  qualifiedLeads: number;
  unqualifiedLeads: number;
  siteVisit: number;
  cpl: number;
  spend: number;
  platform: "Meta" | "Google" | "Other";
  property: string;
}

const CAMPAIGN_STATUSES: CampaignItem["status"][] = ["Active", "Pause", "Stopped"];
const QUALIFIED_LEAD_STATUSES = ["Interested", "Connected", "Visit Schedule", "Site Visit", "Booking Done", "Booked"];
const UNQUALIFIED_LEAD_STATUSES = ["Dead", "Invalid", "RNR"];
const SITE_VISIT_LEAD_STATUSES = ["Visit Schedule", "Site Visit"];
const BOOKING_LEAD_STATUSES = ["Booking Done", "Booking Approved", "Booked"];

// Same icon URLs the admin leads page uses for these platforms (LeadDashboard.tsx).
const PLATFORM_ICON_URL: Partial<Record<CampaignItem["platform"], string>> = {
  Meta: "https://img.icons8.com/?size=100&id=wA5rN96FVDtq&format=png&color=000000",
  Google: "https://img.icons8.com/?size=100&id=4hR4Ih04Je2t&format=png&color=000000"
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

// The custom date-range calendar pill — used both by the Campaigns tab's
// toolbar and the Analytics tab's Property/Status toolbar, so both control
// the exact same underlying date filter instead of drifting independently.
// A top-level component (not nested inside AdminCampaignsPage) so each
// rendered instance keeps its own open/position state across re-renders.
function CampaignDateRangePicker({
  label,
  customRangeStartDraft,
  customRangeEndDraft,
  onStartDraftChange,
  onEndDraftChange,
  onOpen,
  onReset,
  onApply,
  canApply
}: {
  label: string;
  customRangeStartDraft: string;
  customRangeEndDraft: string;
  onStartDraftChange: (v: string) => void;
  onEndDraftChange: (v: string) => void;
  onOpen: () => void;
  onReset: () => void;
  onApply: () => void;
  canApply: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // The popover's position is a snapshot taken once on click, not re-measured
  // continuously — so if the page scrolls while it's open, the button moves
  // but the fixed-position popover doesn't, leaving it stranded. Closing on
  // any scroll (capture: true catches scroll on nested containers too, since
  // scroll events don't bubble) is simpler and safer than re-tracking position.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          const rect = btnRef.current?.getBoundingClientRect();
          if (rect) {
            const panelWidth = 260;
            const left = Math.max(8, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 8));
            setPos({ top: rect.bottom + 6, left });
          }
          onOpen();
          setOpen(o => !o);
        }}
        className="flex items-center gap-2 bg-white border border-slate-300/80 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-medium shadow-2xs hover:bg-slate-50 transition-colors"
      >
        <Calendar className="h-3.5 w-3.5 text-blue-600" />
        <span>{label}</span>
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[70] w-64 max-w-[calc(100vw-1rem)] bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3"
            style={{ top: pos.top, left: pos.left }}
          >
            <p className="text-[11px] font-bold text-slate-700">Filter campaigns by date range</p>
            <div className="space-y-1.5">
              <label className="block text-[9px] font-bold text-slate-400 uppercase">Start Date</label>
              <input
                type="date"
                value={customRangeStartDraft}
                onChange={(e) => onStartDraftChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0B1E6E]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[9px] font-bold text-slate-400 uppercase">End Date</label>
              <input
                type="date"
                value={customRangeEndDraft}
                min={customRangeStartDraft || undefined}
                onChange={(e) => onEndDraftChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0B1E6E]"
              />
              {customRangeStartDraft && customRangeEndDraft && customRangeEndDraft < customRangeStartDraft && (
                <p className="text-[10px] font-semibold text-red-500">End date can&apos;t be before the start date.</p>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { onReset(); setOpen(false); }}
                className="flex-1 bg-slate-100 text-slate-600 font-bold text-[11px] py-1.5 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => { if (!canApply) return; onApply(); setOpen(false); }}
                disabled={!canApply}
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
  );
}

export default function AdminCampaignsPage() {
  const { leads, adSpendRecords, followupCalls } = useApp();

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
  const [drillPage, setDrillPage] = useState(1);
  const [drillRowsPerPage, setDrillRowsPerPage] = useState(8);
  // toggleCategory (opens/closes the drill-down) is defined further below —
  // it's independent of the chart's own category dropdown.

  // Same scroll-spy + synced-pagination pattern used on the admin Leads
  // table: rows render continuously in a capped-height scroll container,
  // scrolling past a page boundary advances drillPage, and the pagination
  // arrows scroll that page's first row back to the top.
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

  // Table Filters & Search
  const today = new Date();
  const todayStr = today.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const [customRangeStartDraft, setCustomRangeStartDraft] = useState("");
  const [customRangeEndDraft, setCustomRangeEndDraft] = useState("");
  const [appliedCustomRange, setAppliedCustomRange] = useState<{ start: string; end: string } | null>(null);

  // Shared handlers for every <CampaignDateRangePicker/> instance on this
  // page (Campaigns tab toolbar + Analytics tab toolbar) — both control the
  // same appliedCustomRange/dateRange state so they can never disagree.
  const dateRangePickerLabel = appliedCustomRange ? `${appliedCustomRange.start} to ${appliedCustomRange.end}` : todayStr;
  const handleDateRangeOpen = () => {
    setCustomRangeStartDraft(appliedCustomRange?.start || "");
    setCustomRangeEndDraft(appliedCustomRange?.end || "");
  };
  const handleDateRangeStartChange = (v: string) => {
    setCustomRangeStartDraft(v);
    if (customRangeEndDraft && v && customRangeEndDraft < v) setCustomRangeEndDraft("");
  };
  const handleDateRangeEndChange = (v: string) => {
    if (customRangeStartDraft && v && v < customRangeStartDraft) return;
    setCustomRangeEndDraft(v);
  };
  const handleDateRangeReset = () => {
    setAppliedCustomRange(null);
    setDateRange("Today");
    setCustomRangeStartDraft("");
    setCustomRangeEndDraft("");
    setCurrentPage(1);
  };
  const handleDateRangeApply = () => {
    setAppliedCustomRange({ start: customRangeStartDraft, end: customRangeEndDraft });
    setDateRange("Custom");
    setCurrentPage(1);
  };
  const dateRangeCanApply = !!customRangeStartDraft && !!customRangeEndDraft && customRangeEndDraft >= customRangeStartDraft;

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

  // Same "in range" check as leadInSelectedRange, for an AdSpendRecord's own
  // date — used to decide which campaigns actually had activity within the
  // selected Date Range (for the top summary bar only; campaignsList itself
  // stays all-time so the Campaigns tab table / chart / breakdown keep their
  // full history).
  const recordInSelectedRange = (r: AdSpendRecord): boolean => {
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

  // Builds the campaigns list from a given set of ad-spend records — shared
  // by campaignsList (records pre-filtered to the selected Date Range) and
  // campaignsListAllTime (every record, no date filter — see campaignByName
  // below).
  //
  // A campaign's totalLeads is the sum, over every real day it has data,
  // of max(that day's platform-reported leadsGenerated, that day's real
  // synced Lead count) — never less than what the platform reported, and
  // never less than what's actually been synced into the CRM either. The
  // max used to be taken once across the whole range instead of per day,
  // which could push a campaign's range total above its own leadsGenerated
  // sum in a way no per-day chart series could ever be sliced to add back
  // up to — a real, unfixable mismatch. Taking the max per day instead
  // means the exact same real per-(campaign, day) numbers (returned as
  // leadsByDateByCampaign) can drive both a day-by-day chart AND the
  // range's grand total, and the two are then mathematically guaranteed to
  // always agree, however the data is sliced.
  const buildCampaignsList = (records: AdSpendRecord[], leadDateFilter: (l: Lead) => boolean): { items: CampaignItem[]; leadsByDateByCampaign: Record<string, Record<string, number>> } => {
    const spendCampaignMap: Record<string, { spend: number; platformLeadsByDate: Record<string, number>; status: "Active" | "Pause" | "Stopped"; platform: "Meta" | "Google" | "Other"; property?: string }> = {};

    records.forEach(rec => {
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
          platformLeadsByDate: {},
          status: st,
          platform: plat,
          property: rec.property
        };
      }
      if (!spendCampaignMap[name].property && rec.property) spendCampaignMap[name].property = rec.property;
      spendCampaignMap[name].spend += rec.spend;
      spendCampaignMap[name].platformLeadsByDate[rec.date] = (spendCampaignMap[name].platformLeadsByDate[rec.date] || 0) + rec.leadsGenerated;
    });

    const result: CampaignItem[] = [];
    const leadsByDateByCampaign: Record<string, Record<string, number>> = {};

    Object.keys(spendCampaignMap).forEach((cName, idx) => {
      if (!result.some(r => r.name.toLowerCase() === cName.toLowerCase())) {
        const item = spendCampaignMap[cName];
        // Qualified/Unqualified/Site Visit are current pipeline status
        // snapshots (like the CRM Dashboard's own cards) — a lead qualified
        // today should still count even if it came in last week, so those
        // read off every matched lead regardless of creation date.
        const campaignLeads = leads.filter(l => (l.campaign || l.source)?.toLowerCase() === cName.toLowerCase());

        // records was already pre-filtered to the selected Date Range, so
        // platformLeadsByDate only ever has dates inside that range. The
        // synced side must be scoped the same way — otherwise a campaign's
        // leads from months ago leak into "Today"'s union of dates below
        // and get summed in as if they happened today (this is what
        // inflated Today's Total Leads to 202: every historical day for
        // every campaign, each contributing its own synced count with no
        // platform-reported number to compare against).
        const syncedLeadsByDate: Record<string, number> = {};
        campaignLeads.filter(leadDateFilter).forEach(l => {
          if (!l.createdAtStr) return;
          const d = new Date(l.createdAtStr);
          if (isNaN(d.getTime())) return;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          syncedLeadsByDate[key] = (syncedLeadsByDate[key] || 0) + 1;
        });

        const perDayMax: Record<string, number> = {};
        new Set([...Object.keys(item.platformLeadsByDate), ...Object.keys(syncedLeadsByDate)]).forEach(date => {
          perDayMax[date] = Math.max(item.platformLeadsByDate[date] || 0, syncedLeadsByDate[date] || 0);
        });
        leadsByDateByCampaign[cName] = perDayMax;

        const total = Object.values(perDayMax).reduce((acc, v) => acc + v, 0);
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
          spend: item.spend,
          platform: item.platform,
          property: item.property || "Unspecified"
        });
      }
    });

    return { items: result, leadsByDateByCampaign };
  };

  // The real, Date-Range-scoped campaigns list — each campaign's own
  // totalLeads is the sum of its real per-day leads (see
  // buildCampaignsList) within the selected range. Drives the Campaigns
  // tab table (each campaign's own row), Active Campaigns, the Campaign
  // Type/Status breakdown's Spend column, Deep Dive, and CSV export. The
  // top summary bar's own Total Leads card does NOT use this — it counts
  // real individual Lead records directly (categoryLeadsInRange), same as
  // the CRM Dashboard and admin Leads page, so all three agree.
  const campaignsListResult = useMemo(
    () => buildCampaignsList(adSpendRecords.filter(recordInSelectedRange), leadInSelectedRange),
    [adSpendRecords, leads, appliedCustomRange, dateRange, today]
  );
  const campaignsList: CampaignItem[] = campaignsListResult.items;

  // Same real campaigns, but always all-time — a campaign's status
  // (Active/Pause/Stopped) and platform are snapshot properties of the
  // campaign itself, not something that should flip depending on which
  // date window happens to be selected, so classification (campaignByName
  // below) always reads the campaign's real overall status rather than
  // "was it Active within just this range." Also seeds the Campaign Type/
  // Status breakdown's checkboxes so a type never disappears from the list
  // just because it had no activity in the current range.
  const campaignsListAllTime: CampaignItem[] = useMemo(
    () => buildCampaignsList(adSpendRecords, () => true).items,
    [adSpendRecords, leads]
  );

  // Shared campaign-name lookup — sourced from the all-time list so a
  // lead/record's campaign classification (status/platform) stays the
  // real, stable value regardless of which Date Range is selected.
  const campaignByName = useMemo(() => {
    const map: Record<string, CampaignItem> = {};
    campaignsListAllTime.forEach(c => { map[c.name.toLowerCase()] = c; });
    return map;
  }, [campaignsListAllTime]);

  // Each lead-based stat card's real underlying lead list — same predicates
  // the counts below use, so clicking a card always drills into exactly
  // what it counted, mirroring the CRM Dashboard's drill-down.
  //
  // "Total Leads" is every real lead, full stop — same definition the CRM
  // Dashboard and the admin Leads page use for their own "Total Leads"
  // cards (scopedLeads.filter(dateInRange...).length). It used to be
  // restricted to leads with a campaign/source (an "ad-attributed leads"
  // concept), which is why this page's Total Leads never matched the same
  // field on the other two admin CRM pages for the same Date Range — same
  // label, three different real numbers. All three now count the exact
  // same thing: every real Lead record within the selected range.
  const categoryLeads: Record<string, Lead[]> = useMemo(() => {
    return {
      // Real leads whose own campaign is currently Active — same
      // campaignsList status the "Active Campaigns" card counts campaigns
      // from, just applied per-lead so the chart has a real per-day trend
      // for it too (the drill-down table still lists campaigns, not these).
      "Active Campaigns": leads.filter(l => {
        const c = campaignByName[(l.campaign || l.source || "").toLowerCase()];
        return !!c && c.status === "Active";
      }),
      "Total Leads": leads,
      "Qualified Leads": leads.filter(l => QUALIFIED_LEAD_STATUSES.includes(l.status)),
      "Site Visits": leads.filter(l => SITE_VISIT_LEAD_STATUSES.includes(l.status)),
      // Split into two cards, same as the CRM Dashboard/admin Leads page —
      // those show Follow Ups and Call Backs separately (Follow-ups vs
      // Call Back are different real statuses), so this page did too until
      // it combined them into one number that couldn't match either card.
      "Follow Ups": leads.filter(l => l.status === "Follow-ups"),
      "Call Backs": leads.filter(l => l.status === "Call Back")
    };
  }, [leads, campaignByName]);

  // Every category's real leads, additionally narrowed to the selected Date
  // Range — used only by the top summary bar and its drill-downs, so the
  // bar actually responds to Date Range (Today/This Week/etc.) instead of
  // always showing the same all-time numbers. categoryLeads itself stays
  // unscoped because the Analytics chart needs its full multi-day history
  // to draw a trend regardless of which Date Range bucket is selected.
  const categoryLeadsInRange = useMemo(() => {
    const out: Record<string, Lead[]> = {};
    Object.entries(categoryLeads).forEach(([key, list]) => {
      out[key] = list.filter(leadInSelectedRange);
    });
    return out;
  }, [categoryLeads, dateRange, appliedCustomRange, today]);

  // Aggregate Metrics for Top Summary Card.
  //
  // Total Leads/Qualified Leads/Site Visits/Follow Ups/Call Backs all come from
  // categoryLeadsInRange — real individual Lead records, same Date Range,
  // same predicates the CRM Dashboard and admin Leads page use for their
  // own same-named cards, so this page's numbers can't drift from theirs.
  // Active Campaigns is a real count of campaigns with that status within
  // the range, from the Date-Range-scoped campaignsList.
  const summaryMetrics = useMemo(() => {
    return {
      activeCampaigns: campaignsList.filter(c => c.status === "Active").length,
      totalLeads: categoryLeadsInRange["Total Leads"].length,
      qualifiedLeads: categoryLeadsInRange["Qualified Leads"].length,
      siteVisits: categoryLeadsInRange["Site Visits"].length,
      followUps: categoryLeadsInRange["Follow Ups"].length,
      callBacks: categoryLeadsInRange["Call Backs"].length
    };
  }, [campaignsList, categoryLeadsInRange]);

  // "Active Campaigns" drills into campaigns, not leads — it's a count of
  // campaigns (matching the summary card's own unit), not a leads list.
  // Same campaignsList the card's own count comes from, so they can never
  // disagree.
  const activeCampaignsDrill = useMemo(() => campaignsList.filter(c => c.status === "Active"), [campaignsList]);

  const formatCurrency = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Same logic as the admin leads table (LeadDashboard.tsx) — reused here so
  // the Qualified Leads drill-down page's Notes/Next Call Date columns show
  // real data, not placeholders.
  const latestLogMessage = (l: Lead): string => {
    if (!l.logs || l.logs.length === 0) return "No feedback yet";
    const sorted = [...l.logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return sorted[0].message;
  };
  const nextCallDateFor = (leadId: string): string => {
    const upcoming = followupCalls
      .filter(f => f.leadId === leadId && f.status === "Upcoming")
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    return upcoming.length > 0 ? `${upcoming[0].date} ${upcoming[0].time}` : "—";
  };

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
  const [chartViewModeMenuOpen, setChartViewModeMenuOpen] = useState(false);
  const [chartViewModeMenuPos, setChartViewModeMenuPos] = useState<{ top: number; left: number } | null>(null);
  const chartViewModeBtnRef = useRef<HTMLButtonElement>(null);

  // Clicking a top stat card both opens its drill-down (as before) and
  // switches the chart's Leads series to that same category — so the
  // chart always reflects whichever number the admin just looked at.
  const toggleCategory = (label: string) => {
    setSelectedCategory(prev => (prev === label ? null : label));
    setDrillSearchQuery("");
    setDrillPage(1);
    if ((CHART_CATEGORIES as readonly string[]).includes(label)) {
      setChartCategory(label as ChartCategory);
    }
  };

  // "Campaign Type" breakdown can group real ad-spend by Platform (Meta/
  // Google/whatever the backend actually sends) or by campaign Status
  // (Active/Pause/Stopped, using each campaign's own real spend) — both
  // are genuine dimensions already present in the fetched data.
  const [typeGroupBy, setTypeGroupBy] = useState<"Platform" | "Status">("Platform");
  const [typeGroupByMenuOpen, setTypeGroupByMenuOpen] = useState(false);
  const [typeGroupByMenuPos, setTypeGroupByMenuPos] = useState<{ top: number; left: number } | null>(null);
  const typeGroupByBtnRef = useRef<HTMLButtonElement>(null);
  const [selectedChartTypes, setSelectedChartTypes] = useState<Record<string, boolean>>({});
  const isTypeChecked = (type: string) => selectedChartTypes[type] !== false;
  const toggleChartType = (type: string) => setSelectedChartTypes(prev => ({ ...prev, [type]: !isTypeChecked(type) }));

  // Spend sums campaignsList[].spend (real per-campaign ad spend, same
  // Date-Range-scoped list the Campaigns tab table uses). Leads classifies
  // every real lead in categoryLeadsInRange["Total Leads"] — the exact
  // same list the top summary bar's Total Leads card counts — by its own
  // campaign's platform/status, so this card's grand total always equals
  // that card's number, whichever grouping dimension is active. A lead
  // with no campaign/source, or one that doesn't match a known campaign,
  // still gets counted (as "Other"/"Unmatched") rather than silently
  // dropped — dropping it would make the totals disagree depending on
  // grouping. Every real platform/status ever seen (campaignsListAllTime)
  // is seeded into the map first so a type doesn't disappear from the
  // checkboxes just because it had no activity in the currently selected
  // Date Range — it shows ₹0/0 leads instead, which also keeps the
  // Analytics chart's own platform/status filters from silently narrowing
  // when a short range is picked.
  const typeBreakdown = useMemo(() => {
    const map: Record<string, { spend: number; leads: number }> = {};
    campaignsListAllTime.forEach(c => {
      const key = typeGroupBy === "Platform" ? c.platform : c.status;
      if (!map[key]) map[key] = { spend: 0, leads: 0 };
    });
    campaignsList.forEach(c => {
      const key = typeGroupBy === "Platform" ? c.platform : c.status;
      if (!map[key]) map[key] = { spend: 0, leads: 0 };
      map[key].spend += c.spend;
    });
    (categoryLeadsInRange["Total Leads"] || []).forEach(l => {
      const campaign = campaignByName[(l.campaign || l.source || "").toLowerCase()];
      const key = typeGroupBy === "Platform"
        ? (campaign ? campaign.platform : (platformFromText(l.source || l.campaign) || "Other"))
        : (campaign ? campaign.status : "Unmatched");
      if (!map[key]) map[key] = { spend: 0, leads: 0 };
      map[key].leads += 1;
    });
    return Object.entries(map)
      .map(([type, v]) => ({ type, spend: v.spend, leads: v.leads }))
      .sort((a, b) => b.spend - a.spend);
  }, [campaignsList, campaignsListAllTime, categoryLeadsInRange, campaignByName, typeGroupBy]);

  const typeBreakdownTotal = typeBreakdown.filter(t => isTypeChecked(t.type)).reduce((acc, t) => acc + t.spend, 0);
  const typeBreakdownLeadsTotal = typeBreakdown.filter(t => isTypeChecked(t.type)).reduce((acc, t) => acc + t.leads, 0);

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

    // Real per-day lead counts for whichever category was last clicked —
    // the exact same Date-Range-scoped list (categoryLeadsInRange) the top
    // summary bar and breakdown card count, classified the same way (a
    // lead with no matched campaign still counts, under "Other"/
    // "Unmatched", never silently dropped) — so the chart's line always
    // adds up to the same grand total those show.
    (categoryLeadsInRange[chartCategory] || []).forEach(l => {
      const campaign = campaignByName[(l.campaign || l.source || "").toLowerCase()];
      if (typeGroupBy === "Platform") {
        const platform = campaign ? campaign.platform : (platformFromText(l.source || l.campaign) || "Other");
        if (!includedPlatforms.has(platform)) return;
      } else {
        const status = campaign ? campaign.status : "Unmatched";
        if (!includedStatuses.has(status)) return;
      }
      if (!l.createdAtStr) return;
      const d = new Date(l.createdAtStr);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!byDate[key]) byDate[key] = { spend: 0, leads: 0 };
      byDate[key].leads += 1;
    });

    return Object.keys(byDate).sort().map(date => {
      const d = new Date(date);
      const label = isNaN(d.getTime())
        ? date
        : `${d.toLocaleDateString("en-GB", { day: "2-digit" })} ${d.toLocaleDateString("en-GB", { month: "short" })}, ${d.getFullYear()}`;
      return { date, label, spend: byDate[date].spend, leads: byDate[date].leads };
    });
  }, [adSpendRecords, campaignByName, categoryLeadsInRange, chartCategory, typeGroupBy, selectedChartTypes, typeBreakdown, dateRange, appliedCustomRange, today]);

  const chartSpendAverage = chartData.length === 0 ? 0 : chartData.reduce((acc, c) => acc + c.spend, 0) / chartData.length;
  const chartLeadsAverage = chartData.length === 0 ? 0 : chartData.reduce((acc, c) => acc + c.leads, 0) / chartData.length;


  // Property / Status breakdown table below the chart.
  const [breakdownTab, setBreakdownTab] = useState<"Property" | "Status">("Property");
  // Multi-select: an empty array means "All Campaigns" (no filter applied).
  const [breakdownCampaignFilters, setBreakdownCampaignFilters] = useState<string[]>([]);
  const toggleBreakdownCampaignFilter = (name: string) => {
    setBreakdownCampaignFilters(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };
  const [breakdownCampaignMenuOpen, setBreakdownCampaignMenuOpen] = useState(false);
  const [breakdownCampaignMenuPos, setBreakdownCampaignMenuPos] = useState<{ top: number; left: number } | null>(null);
  const breakdownCampaignBtnRef = useRef<HTMLButtonElement>(null);

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
  const [deepDiveSourceMenuOpen, setDeepDiveSourceMenuOpen] = useState(false);
  const [deepDiveSourceMenuPos, setDeepDiveSourceMenuPos] = useState<{ top: number; left: number } | null>(null);
  const deepDiveSourceBtnRef = useRef<HTMLButtonElement>(null);

  // Page-level drill-downs from the Deep Dive table (breadcrumb-navigated,
  // replacing the Analytics tab's content, matching the reference) — Ad Set
  // Name's chevron opens a per-campaign ad-set breakdown page (no real
  // ad-set/ad-creative data exists, so it honestly says so rather than
  // fabricating names/numbers); a Qualified Leads count opens the real
  // list of qualified leads behind that number.
  const [analyticsDrillView, setAnalyticsDrillView] = useState<
    { type: "adSetBreakdown"; campaign: CampaignItem } | { type: "qualifiedLeads"; campaign: CampaignItem } | null
  >(null);

  // Every openPositionedMenu-driven dropdown snapshots its position once on
  // click rather than tracking the button continuously, so it goes stale (and
  // visually detaches from its button) if the page scrolls while open —
  // closing on scroll is simpler and safer than re-measuring position live.
  useEffect(() => {
    const anyOpen = summaryDateMenuOpen || statusColumnMenuOpen || chartViewModeMenuOpen
      || typeGroupByMenuOpen || breakdownCampaignMenuOpen || deepDiveSourceMenuOpen;
    if (!anyOpen) return;
    const closeAll = () => {
      setSummaryDateMenuOpen(false);
      setStatusColumnMenuOpen(false);
      setChartViewModeMenuOpen(false);
      setTypeGroupByMenuOpen(false);
      setBreakdownCampaignMenuOpen(false);
      setDeepDiveSourceMenuOpen(false);
    };
    window.addEventListener("scroll", closeAll, true);
    return () => window.removeEventListener("scroll", closeAll, true);
  }, [summaryDateMenuOpen, statusColumnMenuOpen, chartViewModeMenuOpen, typeGroupByMenuOpen, breakdownCampaignMenuOpen, deepDiveSourceMenuOpen]);

  const deepDiveSourceOptions = useMemo(() => Array.from(new Set(campaignsList.map(c => c.platform))), [campaignsList]);

  const deepDiveCampaigns = useMemo(() => {
    const q = deepDiveSearchQuery.trim().toLowerCase();
    return campaignsList.filter(c => {
      const matchesSearch = !q || c.name.toLowerCase().includes(q);
      const matchesSource = deepDiveSourceFilters.length === 0 || deepDiveSourceFilters.includes(c.platform);
      return matchesSearch && matchesSource;
    });
  }, [campaignsList, deepDiveSearchQuery, deepDiveSourceFilters]);

  // Qualified Leads drill-down page — the real leads behind a Deep Dive
  // row's Qualified Leads count.
  const [qualifiedLeadsSearchQuery, setQualifiedLeadsSearchQuery] = useState("");
  const qualifiedLeadsDrillList = useMemo(() => {
    if (!analyticsDrillView || analyticsDrillView.type !== "qualifiedLeads") return [];
    const campaignName = analyticsDrillView.campaign.name.toLowerCase();
    const q = qualifiedLeadsSearchQuery.trim().toLowerCase();
    return leads.filter(l =>
      (l.campaign || l.source)?.toLowerCase() === campaignName
      && QUALIFIED_LEAD_STATUSES.includes(l.status)
      && (!q || l.name.toLowerCase().includes(q))
    );
  }, [analyticsDrillView, leads, qualifiedLeadsSearchQuery]);

  const exportQualifiedLeadsCsv = () => {
    const rows = [
      ["Lead Name", "Phone", "Email", "Status", "Assigned To", "Date", "Notes", "Next Call Date", "Campaign"],
      ...qualifiedLeadsDrillList.map(l => [
        l.name, l.phone, l.email, l.status, l.assignedAgent,
        l.createdAtStr || "—", latestLogMessage(l), nextCallDateFor(l.id), l.campaign || l.source || "—"
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

  // "Status" tab: one row per real (campaign, date) pair — i.e. per real
  // AdSpendRecord — broken down by real Lead pipeline status, not campaign
  // Active/Pause/Stopped status. Total Leads is the platform-reported
  // leadsGenerated for that day; the status columns count actual matching
  // Lead records, so they needn't sum to Total Leads (a lead's current
  // status can differ from what the platform originally reported, and some
  // leads land in statuses not broken out here).
  const statusDateBreakdown = useMemo(() => {
    const filteredRecords = breakdownCampaignFilters.length === 0
      ? adSpendRecords
      : adSpendRecords.filter(r => breakdownCampaignFilters.includes(r.accountName));

    return filteredRecords.map(rec => {
      const dayLeads = leads.filter(l =>
        (l.campaign || l.source)?.toLowerCase() === rec.accountName.toLowerCase()
        && l.createdAtStr && l.createdAtStr.slice(0, 10) === rec.date
      );
      const countStatus = (statuses: string[]) => dayLeads.filter(l => statuses.includes(l.status)).length;
      const d = new Date(rec.date);
      const dateLabel = isNaN(d.getTime())
        ? rec.date
        : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      return {
        id: rec.id,
        date: rec.date,
        dateLabel,
        campaign: rec.accountName,
        platform: rec.platform,
        totalLeads: rec.leadsGenerated,
        newLead: countStatus(["New Lead", "New", "New Leads"]),
        callBack: countStatus(["Call Back"]),
        followUps: countStatus(["Follow-ups"]),
        siteVisits: countStatus(SITE_VISIT_LEAD_STATUSES),
        eoi: countStatus(["EOI Customers"]),
        booked: countStatus(BOOKING_LEAD_STATUSES),
        dead: countStatus(["Dead"]),
        rnr: countStatus(["RNR"]),
        lowBudget: countStatus(["Low Budget"])
      };
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [adSpendRecords, leads, breakdownCampaignFilters]);

  const exportBreakdownCsv = () => {
    const rows = breakdownTab === "Property"
      ? [["Property", "Campaigns", "Source", "Total Leads", "Qualified Leads", "CPL", "QCPL", "Spend"],
          ...propertyBreakdown.map(r => [r.property, r.campaigns.length, r.platforms.join("/"), r.totalLeads, r.qualifiedLeads, r.cpl.toFixed(2), r.qcpl.toFixed(2), r.spend.toFixed(2)])]
      : [["Date", "Campaign", "Total Leads", "Call Back", "Follow ups", "Site Visits", "Dead", "RNR", "Low Budget"],
          ...statusDateBreakdown.map(r => [r.dateLabel, r.campaign, r.totalLeads, r.callBack, r.followUps, r.siteVisits, r.dead, r.rnr, r.lowBudget])];
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `campaigns-${breakdownTab.toLowerCase()}-breakdown.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

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

      {/* Date Filter & Metrics — one unified card matching the CRM dashboard's
          layout: a header bar (date range) sitting directly on top of the
          stat columns, separated by a divider instead of floating as a
          separate padded/shadowed card. Shown on both tabs. */}
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
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
              {([
                { label: "Active Campaigns", value: summaryMetrics.activeCampaigns, color: "text-slate-900" },
                { label: "Total Leads", value: summaryMetrics.totalLeads, color: "text-slate-900" },
                { label: "Qualified Leads", value: summaryMetrics.qualifiedLeads, color: "text-rose-600" },
                { label: "Site Visits", value: summaryMetrics.siteVisits, color: "text-amber-500" },
                { label: "Follow Ups", value: summaryMetrics.followUps, color: "text-blue-500" },
                { label: "Call Backs", value: summaryMetrics.callBacks, color: "text-orange-500" }
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
            // "Active Campaigns" is the one card that's a count of campaigns
            // rather than leads, so it's the only one that drills into the
            // campaign table. Total Leads/Qualified Leads/Site Visits/Follow
            // Ups all drill into the real, individual leads behind that
            // number (pure lead details — Name/Phone/Status/Campaign),
            // pulled from categoryLeads regardless of how the summary
            // card's own number is computed.
            const isCampaignsTable = selectedCategory === "Active Campaigns";
            const q = drillSearchQuery.trim().toLowerCase();
            const shownCampaigns = isCampaignsTable
              ? activeCampaignsDrill.filter(c => !q || c.name.toLowerCase().includes(q))
              : [];
            const shownLeads = !isCampaignsTable
              ? (categoryLeadsInRange[selectedCategory] || []).filter(l =>
                  !q || l.name.toLowerCase().includes(q) || l.phone.includes(q) || (l.campaign || l.source || "").toLowerCase().includes(q)
                )
              : [];
            const shownCount = isCampaignsTable ? shownCampaigns.length : shownLeads.length;
            const totalPages = Math.max(1, Math.ceil(shownCount / drillRowsPerPage));
            const currentPage = Math.min(drillPage, totalPages);
            const rangeStart = shownCount === 0 ? 0 : (currentPage - 1) * drillRowsPerPage + 1;
            const rangeEnd = Math.min(currentPage * drillRowsPerPage, shownCount);

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
                        placeholder={isCampaignsTable ? "Search campaign..." : "Search name, phone, campaign..."}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:border-[#0B1E6E]"
                      />
                    </div>
                    <button type="button" onClick={() => setSelectedCategory(null)} className="text-slate-400 hover:text-slate-700 shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div ref={drillScrollRef} onScroll={handleDrillScroll} className="max-h-80 overflow-y-auto">
                  {isCampaignsTable ? (
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
                              No campaigns found.
                            </td>
                          </tr>
                        ) : (
                          (drillPageRowRefs.current = [], shownCampaigns.map((c, idx) => (
                            <tr
                              key={c.id}
                              ref={idx % drillRowsPerPage === 0 ? (el) => { drillPageRowRefs.current[Math.floor(idx / drillRowsPerPage)] = el; } : undefined}
                              className="hover:bg-slate-50/50 transition-colors"
                            >
                              <td className="px-5 py-2.5 font-semibold text-slate-900">{c.name}</td>
                              <td className="px-5 py-2.5">{c.totalLeads}</td>
                              <td className="px-5 py-2.5">{c.qualifiedLeads}</td>
                              <td className="px-5 py-2.5">{c.siteVisit}</td>
                            </tr>
                          )))
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
                          (drillPageRowRefs.current = [], shownLeads.map((l, idx) => (
                            <tr
                              key={l.id}
                              ref={idx % drillRowsPerPage === 0 ? (el) => { drillPageRowRefs.current[Math.floor(idx / drillRowsPerPage)] = el; } : undefined}
                              className="hover:bg-slate-50/50 transition-colors"
                            >
                              <td className="px-5 py-2.5 font-semibold text-slate-900">{l.name}</td>
                              <td className="px-5 py-2.5 font-mono">{l.phone}</td>
                              <td className="px-5 py-2.5">{l.status}</td>
                              <td className="px-5 py-2.5">{l.campaign || l.source || "—"}</td>
                            </tr>
                          )))
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="px-5 py-3 flex flex-wrap justify-between items-center gap-3 border-t border-slate-100 text-[11px] text-slate-500 font-semibold">
                  <span>{shownCount} Row{shownCount === 1 ? "" : "s"}</span>
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      Rows per page
                      <select
                        value={drillRowsPerPage}
                        onChange={(e) => {
                          drillProgrammaticScroll.current = true;
                          setDrillRowsPerPage(Number(e.target.value));
                          setDrillPage(1);
                          drillScrollRef.current?.scrollTo(0, 0);
                          requestAnimationFrame(() => {
                            requestAnimationFrame(() => { drillProgrammaticScroll.current = false; });
                          });
                        }}
                        className="bg-slate-50 border border-slate-200 rounded px-1.5 py-1 font-bold text-slate-700 focus:outline-none"
                      >
                        {[8, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </span>
                    <span>{rangeStart}-{rangeEnd} of {shownCount}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => goToDrillPage(currentPage - 1, totalPages)}
                        disabled={currentPage <= 1}
                        className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ‹
                      </button>
                      <button
                        onClick={() => goToDrillPage(currentPage + 1, totalPages)}
                        disabled={currentPage >= totalPages}
                        className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                </div>
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
                {analyticsDrillView.type === "adSetBreakdown" ? "Campaign Deep Dive" : "Qualified Leads"}
              </span>
            </div>

            {analyticsDrillView.type === "adSetBreakdown" ? (
              <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200/80">
                  <h3 className="text-sm font-bold text-slate-900">Campaign Deep Dive</h3>
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-left border-collapse min-w-[760px]">
                    <thead>
                      <tr className="border-b border-slate-200/80 text-[12px] font-bold text-slate-900">
                        <th className="px-5 py-3">Campaign Name</th>
                        <th className="px-5 py-3 whitespace-nowrap">Source</th>
                        <th className="px-5 py-3 whitespace-nowrap">Ad Set Name</th>
                        <th className="px-5 py-3 whitespace-nowrap">Ad creative Name</th>
                        <th className="px-5 py-3 whitespace-nowrap">Qualified Leads</th>
                        <th className="px-5 py-3 whitespace-nowrap">CPL</th>
                        <th className="px-5 py-3 whitespace-nowrap">Spend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[12px] font-medium text-slate-700">
                      <tr>
                        <td className="px-5 py-3 text-slate-900 font-semibold">{analyticsDrillView.campaign.name}</td>
                        <td className="px-5 py-3"><PlatformIcon platform={analyticsDrillView.campaign.platform} /></td>
                        <td className="px-5 py-3 text-slate-300" title="Not tracked yet — no ad-set-level data ingested">—</td>
                        <td className="px-5 py-3 text-slate-300" title="Not tracked yet — no ad-creative-level data ingested">—</td>
                        <td className="px-5 py-3">{analyticsDrillView.campaign.qualifiedLeads}</td>
                        <td className="px-5 py-3">{analyticsDrillView.campaign.cpl.toFixed(2)}</td>
                        <td className="px-5 py-3 font-semibold text-slate-800">{formatCurrency(analyticsDrillView.campaign.spend)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="px-5 py-3 text-[11px] text-slate-400 italic border-t border-slate-100">
                  Ad-set and ad-creative level breakdown is not tracked yet — Meta/Google ad-set and creative reporting is not ingested. The Qualified Leads/CPL/Spend above are this campaign&apos;s real totals.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200/80">
                  <h3 className="text-sm font-bold text-slate-900">
                    Qualified Leads
                    <span className="text-slate-400 font-medium ml-1.5">({qualifiedLeadsDrillList.length}) — {analyticsDrillView.campaign.name}</span>
                  </h3>
                  <div className="flex items-center gap-2.5">
                    <div className="relative w-full max-w-[200px]">
                      <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        value={qualifiedLeadsSearchQuery}
                        onChange={(e) => setQualifiedLeadsSearchQuery(e.target.value)}
                        placeholder="Search lead name..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:border-[#0B1E6E]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={exportQualifiedLeadsCsv}
                      title="Download CSV"
                      className="p-2 border border-slate-300/80 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5 text-blue-600" />
                    </button>
                  </div>
                </div>
                <div className="overflow-auto max-h-[55vh]">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr className="border-b border-slate-200/80 text-[12px] font-bold text-slate-900">
                        <th className="px-5 py-3">Lead Name</th>
                        <th className="px-5 py-3 whitespace-nowrap">Email</th>
                        <th className="px-5 py-3 whitespace-nowrap">Status</th>
                        <th className="px-5 py-3 whitespace-nowrap">Assigned To</th>
                        <th className="px-5 py-3 whitespace-nowrap">Date</th>
                        <th className="px-5 py-3 whitespace-nowrap">Notes</th>
                        <th className="px-5 py-3 whitespace-nowrap">Next Call Date</th>
                        <th className="px-5 py-3 whitespace-nowrap">Campaign</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[12px] font-medium text-slate-700">
                      {qualifiedLeadsDrillList.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-5 py-8 text-center text-slate-400 italic">No qualified leads found for this campaign.</td>
                        </tr>
                      ) : (
                        qualifiedLeadsDrillList.map(l => (
                          <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3 text-slate-900 font-semibold">{l.name}</td>
                            <td className="px-5 py-3 truncate max-w-[160px]" title={l.email}>{l.email || "—"}</td>
                            <td className="px-5 py-3 whitespace-nowrap">{l.status}</td>
                            <td className="px-5 py-3">{l.assignedAgent || "—"}</td>
                            <td className="px-5 py-3 whitespace-nowrap">{l.createdAtStr || "—"}</td>
                            <td className="px-5 py-3 truncate max-w-[200px]" title={latestLogMessage(l)}>{latestLogMessage(l)}</td>
                            <td className="px-5 py-3 whitespace-nowrap">{nextCallDateFor(l.id)}</td>
                            <td className="px-5 py-3">{l.campaign || l.source || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
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
                  <div className="relative">
                    <button
                      type="button"
                      ref={chartViewModeBtnRef}
                      onClick={() => openPositionedMenu(chartViewModeBtnRef, setChartViewModeMenuPos, setChartViewModeMenuOpen, "right", 110)}
                      className="flex items-center gap-1.5 bg-white border border-slate-300/80 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      {chartViewMode}
                      <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${chartViewModeMenuOpen ? "rotate-180" : ""}`} />
                    </button>
                    {chartViewModeMenuOpen && chartViewModeMenuPos && createPortal(
                      <>
                        <div className="fixed inset-0 z-[60]" onClick={() => setChartViewModeMenuOpen(false)} />
                        <div
                          className="fixed z-[70] bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 overflow-hidden text-xs font-semibold"
                          style={{ top: chartViewModeMenuPos.top, left: chartViewModeMenuPos.left, width: 110 }}
                        >
                          {CHART_VIEW_MODES.map(opt => (
                            <button
                              key={opt}
                              onClick={() => { setChartViewMode(opt); setChartViewModeMenuOpen(false); }}
                              className={`w-full text-left px-3 py-1.5 transition-colors ${chartViewMode === opt ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </>,
                      document.body
                    )}
                  </div>
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
                <div className="relative">
                  <button
                    type="button"
                    ref={typeGroupByBtnRef}
                    onClick={() => openPositionedMenu(typeGroupByBtnRef, setTypeGroupByMenuPos, setTypeGroupByMenuOpen, "right", 160)}
                    className="flex items-center gap-1.5 bg-white border border-slate-300/80 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    {typeGroupBy === "Platform" ? "Campaign Type" : "Campaign Status"}
                    <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${typeGroupByMenuOpen ? "rotate-180" : ""}`} />
                  </button>
                  {typeGroupByMenuOpen && typeGroupByMenuPos && createPortal(
                    <>
                      <div className="fixed inset-0 z-[60]" onClick={() => setTypeGroupByMenuOpen(false)} />
                      <div
                        className="fixed z-[70] w-36 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 overflow-hidden text-xs font-semibold"
                        style={{ top: typeGroupByMenuPos.top, left: typeGroupByMenuPos.left }}
                      >
                        {([{ v: "Platform" as const, label: "Campaign Type" }, { v: "Status" as const, label: "Campaign Status" }]).map(opt => (
                          <button
                            key={opt.v}
                            onClick={() => { setTypeGroupBy(opt.v); setSelectedChartTypes({}); setTypeGroupByMenuOpen(false); }}
                            className={`w-full text-left px-3 py-1.5 transition-colors ${typeGroupBy === opt.v ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </>,
                    document.body
                  )}
                </div>
              </div>
              <div className="grid grid-cols-[1fr_64px_112px] gap-x-4 items-center text-[10px] font-bold text-slate-400 uppercase pb-2 border-b border-slate-100">
                <span>{typeGroupBy === "Platform" ? "Type" : "Status"}</span>
                <span className="text-right">Leads</span>
                <span className="text-right">Spend</span>
              </div>
              <div className="overflow-y-auto max-h-[160px] divide-y divide-slate-50">
                {typeBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4 text-center">No data yet.</p>
                ) : (
                  typeBreakdown.map(t => (
                    <label key={t.type} className="grid grid-cols-[1fr_64px_112px] gap-x-4 items-center py-2 text-xs cursor-pointer">
                      <span className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isTypeChecked(t.type)}
                          onChange={() => toggleChartType(t.type)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-[#0B1E6E] focus:ring-0 focus:ring-offset-0 shrink-0"
                        />
                        {typeGroupBy === "Platform" && (t.type === "Meta" || t.type === "Google") && (
                          <PlatformIcon platform={t.type} />
                        )}
                        <span className="font-semibold text-slate-700 truncate">{t.type}</span>
                      </span>
                      <span className="text-slate-600 text-right">{t.leads.toLocaleString("en-IN")}</span>
                      <span className="text-slate-600 text-right">{formatCurrency(t.spend)}</span>
                    </label>
                  ))
                )}
              </div>
              <div className="grid grid-cols-[1fr_64px_112px] gap-x-4 items-center pt-2 mt-2 border-t border-slate-200 text-xs font-bold text-slate-900">
                <span>Total</span>
                <span className="text-right">{typeBreakdownLeadsTotal.toLocaleString("en-IN")}</span>
                <span className="text-right">{formatCurrency(typeBreakdownTotal)}</span>
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
                  title="Download CSV"
                  className="p-2 border border-slate-300/80 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Download className="h-3.5 w-3.5 text-blue-600" />
                </button>
                <CampaignDateRangePicker
                  label={dateRangePickerLabel}
                  customRangeStartDraft={customRangeStartDraft}
                  customRangeEndDraft={customRangeEndDraft}
                  onStartDraftChange={handleDateRangeStartChange}
                  onEndDraftChange={handleDateRangeEndChange}
                  onOpen={handleDateRangeOpen}
                  onReset={handleDateRangeReset}
                  onApply={handleDateRangeApply}
                  canApply={dateRangeCanApply}
                />
                <div className="relative">
                  <button
                    type="button"
                    ref={breakdownCampaignBtnRef}
                    onClick={() => openPositionedMenu(breakdownCampaignBtnRef, setBreakdownCampaignMenuPos, setBreakdownCampaignMenuOpen, "right", 200)}
                    className="flex items-center gap-2 bg-white border border-slate-300/80 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <span>
                      {breakdownCampaignFilters.length === 0
                        ? "Campaigns"
                        : breakdownCampaignFilters.length === 1
                          ? breakdownCampaignFilters[0]
                          : `${breakdownCampaignFilters.length} campaigns`}
                    </span>
                    <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${breakdownCampaignMenuOpen ? "rotate-180" : ""}`} />
                  </button>
                  {breakdownCampaignMenuOpen && breakdownCampaignMenuPos && createPortal(
                    <>
                      <div className="fixed inset-0 z-[60]" onClick={() => setBreakdownCampaignMenuOpen(false)} />
                      <div
                        className="fixed z-[70] w-56 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 text-xs font-medium"
                        style={{ top: breakdownCampaignMenuPos.top, left: breakdownCampaignMenuPos.left }}
                      >
                        <button
                          type="button"
                          onClick={() => setBreakdownCampaignFilters([])}
                          className="w-full flex items-center gap-1.5 text-left px-3 py-1.5 text-slate-500 font-bold hover:bg-slate-50 border-b border-slate-100 transition-colors"
                        >
                          <Minus className="h-3 w-3" />
                          All Campaigns
                        </button>
                        {campaignsList.map(c => (
                          <label
                            key={c.id}
                            className="flex items-center gap-2 px-3 py-1.5 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer transition-colors truncate"
                          >
                            <input
                              type="checkbox"
                              checked={breakdownCampaignFilters.includes(c.name)}
                              onChange={() => toggleBreakdownCampaignFilter(c.name)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-[#0B1E6E] focus:ring-0 focus:ring-offset-0 shrink-0"
                            />
                            <span className="truncate">{c.name}</span>
                          </label>
                        ))}
                      </div>
                    </>,
                    document.body
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsBreakdownFilterOpen(true)}
                  className="flex items-center gap-2 border border-slate-300/80 bg-white rounded-xl px-3.5 py-1.5 text-xs text-slate-700 font-semibold hover:bg-slate-50 shadow-2xs transition-colors"
                >
                  <Sliders className="h-3.5 w-3.5 text-blue-600" />
                  Filter
                </button>
              </div>
            </div>

            <div className="overflow-auto max-h-[40vh]">
              <table className="w-full text-left border-collapse min-w-[720px]">
                {breakdownTab === "Property" ? (
                  <>
                    <thead className="sticky top-0 z-10 bg-white">
                      <tr className="border-b border-slate-200/80 text-[12px] font-bold text-slate-900">
                        {breakdownVisibleColumns.property && <th className="px-5 py-3">Property</th>}
                        {breakdownVisibleColumns.date && <th className="px-5 py-3 whitespace-nowrap">Date</th>}
                        {breakdownVisibleColumns.campaigns && <th className="px-5 py-3 whitespace-nowrap">Campaigns</th>}
                        {breakdownVisibleColumns.source && <th className="px-5 py-3 whitespace-nowrap">Source</th>}
                        {breakdownVisibleColumns.totalLeads && <th className="px-5 py-3 whitespace-nowrap">Total Leads</th>}
                        {breakdownVisibleColumns.qualifiedLeads && <th className="px-5 py-3 whitespace-nowrap">Qualified Leads</th>}
                        {breakdownVisibleColumns.unqualifiedLeads && <th className="px-5 py-3 whitespace-nowrap">Unqualified Leads</th>}
                        {breakdownVisibleColumns.qualifiedPercent && <th className="px-5 py-3 whitespace-nowrap">Qualified %age</th>}
                        {breakdownVisibleColumns.cpl && <th className="px-5 py-3 whitespace-nowrap">CPL</th>}
                        {breakdownVisibleColumns.qcpl && <th className="px-5 py-3 whitespace-nowrap">QCPL</th>}
                        {breakdownVisibleColumns.spend && <th className="px-5 py-3 whitespace-nowrap">Spend</th>}
                        {breakdownVisibleColumns.qSpend && <th className="px-5 py-3 whitespace-nowrap">Q Spend</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[12px] font-medium text-slate-700">
                      {propertyBreakdown.length === 0 ? (
                        <tr>
                          <td colSpan={BREAKDOWN_COLUMNS.filter(c => breakdownVisibleColumns[c.key]).length || 1} className="px-5 py-8 text-center text-slate-400 italic">No campaign/ad-spend data yet.</td>
                        </tr>
                      ) : (
                        propertyBreakdown.map(row => {
                          const isExpanded = expandedProperties.has(row.property);
                          return (
                            <React.Fragment key={row.property}>
                              <tr className="hover:bg-slate-50/50 transition-colors">
                                {breakdownVisibleColumns.property && (
                                  <td className="px-5 py-3 text-slate-900 font-semibold">
                                    <button
                                      type="button"
                                      onClick={() => togglePropertyExpanded(row.property)}
                                      className="flex items-center gap-1.5 hover:text-[#0B1E6E] transition-colors"
                                    >
                                      {row.property}
                                      {isExpanded ? <CircleMinus className="h-3.5 w-3.5 text-slate-400" /> : <CirclePlus className="h-3.5 w-3.5 text-slate-400" />}
                                    </button>
                                  </td>
                                )}
                                {breakdownVisibleColumns.date && <td className="px-5 py-3 text-slate-300" title="Not tracked yet — no per-campaign date field ingested">—</td>}
                                {breakdownVisibleColumns.campaigns && <td className="px-5 py-3">{row.campaigns.length}</td>}
                                {breakdownVisibleColumns.source && <td className="px-5 py-3"><PlatformIcons platforms={row.platforms} /></td>}
                                {breakdownVisibleColumns.totalLeads && <td className="px-5 py-3">{row.totalLeads}</td>}
                                {breakdownVisibleColumns.qualifiedLeads && <td className="px-5 py-3">{row.qualifiedLeads}</td>}
                                {breakdownVisibleColumns.unqualifiedLeads && <td className="px-5 py-3">{row.unqualifiedLeads}</td>}
                                {breakdownVisibleColumns.qualifiedPercent && <td className="px-5 py-3">{row.qualifiedPercent.toFixed(1)}%</td>}
                                {breakdownVisibleColumns.cpl && <td className="px-5 py-3">{row.cpl.toFixed(2)}</td>}
                                {breakdownVisibleColumns.qcpl && <td className="px-5 py-3">{row.qcpl.toFixed(2)}</td>}
                                {breakdownVisibleColumns.spend && <td className="px-5 py-3 font-semibold text-slate-800">{formatCurrency(row.spend)}</td>}
                                {breakdownVisibleColumns.qSpend && <td className="px-5 py-3 text-slate-300" title="Not tracked yet — no qualified-spend field defined">—</td>}
                              </tr>
                              {isExpanded && (
                                <tr className="bg-slate-50/50 text-[12px] font-bold text-slate-900">
                                  {breakdownVisibleColumns.property && <td className="px-5 py-2">Campaign</td>}
                                  {breakdownVisibleColumns.date && <td className="px-5 py-2"></td>}
                                  {breakdownVisibleColumns.campaigns && <td className="px-5 py-2"></td>}
                                  {breakdownVisibleColumns.source && <td className="px-5 py-2">Source</td>}
                                  {breakdownVisibleColumns.totalLeads && <td className="px-5 py-2">Total Leads</td>}
                                  {breakdownVisibleColumns.qualifiedLeads && <td className="px-5 py-2">Qualified Leads</td>}
                                  {breakdownVisibleColumns.unqualifiedLeads && <td className="px-5 py-2">Unqualified Leads</td>}
                                  {breakdownVisibleColumns.qualifiedPercent && <td className="px-5 py-2">Qualified %age</td>}
                                  {breakdownVisibleColumns.cpl && <td className="px-5 py-2">CPL</td>}
                                  {breakdownVisibleColumns.qcpl && <td className="px-5 py-2">QCPL</td>}
                                  {breakdownVisibleColumns.spend && <td className="px-5 py-2">Spend</td>}
                                  {breakdownVisibleColumns.qSpend && <td className="px-5 py-2"></td>}
                                </tr>
                              )}
                              {isExpanded && row.campaigns.map(c => {
                                const cQualifiedPercent = c.totalLeads > 0 ? (c.qualifiedLeads / c.totalLeads) * 100 : 0;
                                return (
                                  <tr key={c.id} className="bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                    {breakdownVisibleColumns.property && <td className="px-5 py-2.5 text-slate-700">{c.name}</td>}
                                    {breakdownVisibleColumns.date && <td className="px-5 py-2.5 text-slate-300">—</td>}
                                    {breakdownVisibleColumns.campaigns && <td className="px-5 py-2.5"></td>}
                                    {breakdownVisibleColumns.source && <td className="px-5 py-2.5"><PlatformIcon platform={c.platform} /></td>}
                                    {breakdownVisibleColumns.totalLeads && <td className="px-5 py-2.5">{c.totalLeads}</td>}
                                    {breakdownVisibleColumns.qualifiedLeads && <td className="px-5 py-2.5">{c.qualifiedLeads}</td>}
                                    {breakdownVisibleColumns.unqualifiedLeads && <td className="px-5 py-2.5">{c.unqualifiedLeads}</td>}
                                    {breakdownVisibleColumns.qualifiedPercent && <td className="px-5 py-2.5">{cQualifiedPercent.toFixed(1)}%</td>}
                                    {breakdownVisibleColumns.cpl && <td className="px-5 py-2.5">{c.cpl.toFixed(2)}</td>}
                                    {breakdownVisibleColumns.qcpl && <td className="px-5 py-2.5">{computeCPL(c.spend, c.qualifiedLeads).toFixed(2)}</td>}
                                    {breakdownVisibleColumns.spend && <td className="px-5 py-2.5 font-semibold text-slate-800">{formatCurrency(c.spend)}</td>}
                                    {breakdownVisibleColumns.qSpend && <td className="px-5 py-2.5 text-slate-300">—</td>}
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
                      <tr className="border-b border-slate-200/80 text-[12px] font-bold text-slate-900">
                        {statusVisibleColumns.date && <th className="px-5 py-3 whitespace-nowrap">Date</th>}
                        {statusVisibleColumns.campaign && <th className="px-5 py-3 whitespace-nowrap">Campaign</th>}
                        {statusVisibleColumns.totalLeads && <th className="px-5 py-3 whitespace-nowrap">Total Leads</th>}
                        {statusVisibleColumns.source && <th className="px-5 py-3 whitespace-nowrap">Source</th>}
                        {statusVisibleColumns.newLead && <th className="px-5 py-3 whitespace-nowrap">New Lead</th>}
                        {statusVisibleColumns.callBack && <th className="px-5 py-3 whitespace-nowrap">Call Back</th>}
                        {statusVisibleColumns.followUps && <th className="px-5 py-3 whitespace-nowrap">Follow ups</th>}
                        {statusVisibleColumns.siteVisits && <th className="px-5 py-3 whitespace-nowrap">Site Visits</th>}
                        {statusVisibleColumns.eoi && <th className="px-5 py-3 whitespace-nowrap">EOI</th>}
                        {statusVisibleColumns.booked && <th className="px-5 py-3 whitespace-nowrap">Booked</th>}
                        {statusVisibleColumns.dead && <th className="px-5 py-3 whitespace-nowrap">Dead</th>}
                        {statusVisibleColumns.rnr && <th className="px-5 py-3 whitespace-nowrap">RNR</th>}
                        {statusVisibleColumns.lowBudget && <th className="px-5 py-3 whitespace-nowrap">Low Budget</th>}
                        {statusVisibleColumns.otherReq && <th className="px-5 py-3 whitespace-nowrap">Other Req.</th>}
                        {statusVisibleColumns.cancelled && <th className="px-5 py-3 whitespace-nowrap">Cancelled</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[12px] font-medium text-slate-700">
                      {statusDateBreakdown.length === 0 ? (
                        <tr>
                          <td colSpan={STATUS_COLUMNS.filter(c => statusVisibleColumns[c.key]).length || 1} className="px-5 py-8 text-center text-slate-400 italic">No ad-spend data yet.</td>
                        </tr>
                      ) : (
                        statusDateBreakdown.map(row => (
                          <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                            {statusVisibleColumns.date && <td className="px-5 py-3 text-slate-700 whitespace-nowrap">{row.dateLabel}</td>}
                            {statusVisibleColumns.campaign && <td className="px-5 py-3 text-slate-900 font-semibold">{row.campaign}</td>}
                            {statusVisibleColumns.totalLeads && <td className="px-5 py-3">{row.totalLeads}</td>}
                            {statusVisibleColumns.source && <td className="px-5 py-3"><PlatformIcon platform={row.platform} /></td>}
                            {statusVisibleColumns.newLead && <td className="px-5 py-3">{row.newLead}</td>}
                            {statusVisibleColumns.callBack && <td className="px-5 py-3">{row.callBack}</td>}
                            {statusVisibleColumns.followUps && <td className="px-5 py-3">{row.followUps}</td>}
                            {statusVisibleColumns.siteVisits && <td className="px-5 py-3">{row.siteVisits}</td>}
                            {statusVisibleColumns.eoi && <td className="px-5 py-3">{row.eoi}</td>}
                            {statusVisibleColumns.booked && <td className="px-5 py-3">{row.booked}</td>}
                            {statusVisibleColumns.dead && <td className="px-5 py-3">{row.dead}</td>}
                            {statusVisibleColumns.rnr && <td className="px-5 py-3">{row.rnr}</td>}
                            {statusVisibleColumns.lowBudget && <td className="px-5 py-3">{row.lowBudget}</td>}
                            {statusVisibleColumns.otherReq && <td className="px-5 py-3 text-slate-300" title="Not tracked yet — no matching lead status defined">—</td>}
                            {statusVisibleColumns.cancelled && <td className="px-5 py-3 text-slate-300" title="Not tracked yet — no matching lead status defined">—</td>}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </>
                )}
              </table>
            </div>
          </div>

          {/* Filter button's column-visibility drawer for the Property/Status
              breakdown table — a full-height right-docked drawer, same
              pattern as the Campaigns tab's own Filter drawer. */}
          {isBreakdownFilterOpen && createPortal(
            <div className="fixed inset-0 z-[100]">
              <div className="fixed inset-0" onClick={() => setIsBreakdownFilterOpen(false)} />
              <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-slide-in">
                <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
                  <h3 className="text-base font-extrabold text-slate-900">Filter</h3>
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
              "Ad creative Name" have no backing field yet (no ad-set/ad-
              creative-level ingestion), so they honestly render "—" rather
              than inventing numbers, same convention used elsewhere. */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200/80">
              <h3 className="text-sm font-bold text-slate-900">Campaign Deep Dive</h3>
            </div>
            <div className="overflow-auto max-h-[45vh]">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b border-slate-200/80 text-[12px] font-bold text-slate-900">
                    <th className="px-5 py-3">
                      {deepDiveSearchOpen ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={deepDiveSearchQuery}
                            onChange={(e) => setDeepDiveSearchQuery(e.target.value)}
                            placeholder="Filter campaign..."
                            className="bg-slate-50 border border-blue-400 rounded px-2 py-0.5 text-xs font-normal focus:outline-none w-36"
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
                    <th className="px-5 py-3 whitespace-nowrap">
                      <div className="relative inline-block">
                        <button
                          type="button"
                          ref={deepDiveSourceBtnRef}
                          onClick={() => openPositionedMenu(deepDiveSourceBtnRef, setDeepDiveSourceMenuPos, setDeepDiveSourceMenuOpen, "left", 160)}
                          className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                        >
                          <span>Source</span>
                          <ChevronDown className={`h-3 w-3 text-slate-800 transition-transform ${deepDiveSourceMenuOpen ? "rotate-180" : ""}`} />
                        </button>
                        {deepDiveSourceMenuOpen && deepDiveSourceMenuPos && createPortal(
                          <>
                            <div className="fixed inset-0 z-[60]" onClick={() => setDeepDiveSourceMenuOpen(false)} />
                            <div
                              className="fixed z-[70] w-40 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 text-xs font-medium overflow-hidden"
                              style={{ top: deepDiveSourceMenuPos.top, left: deepDiveSourceMenuPos.left }}
                            >
                              <button
                                type="button"
                                onClick={() => setDeepDiveSourceFilters([])}
                                className="w-full flex items-center gap-1.5 text-left px-3 py-1.5 text-slate-500 font-bold hover:bg-slate-50 border-b border-slate-100 transition-colors"
                              >
                                <Minus className="h-3 w-3" />
                                All Sources
                              </button>
                              {deepDiveSourceOptions.map(src => (
                                <label key={src} className="flex items-center gap-2 px-3 py-1.5 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={deepDiveSourceFilters.includes(src)}
                                    onChange={() => setDeepDiveSourceFilters(prev => prev.includes(src) ? prev.filter(s => s !== src) : [...prev, src])}
                                    className="h-3.5 w-3.5 rounded border-slate-300 text-[#0B1E6E] focus:ring-0 focus:ring-offset-0"
                                  />
                                  {src}
                                </label>
                              ))}
                            </div>
                          </>,
                          document.body
                        )}
                      </div>
                    </th>
                    <th className="px-5 py-3 whitespace-nowrap">Ad Set Name</th>
                    <th className="px-5 py-3 whitespace-nowrap">Ad creative Name</th>
                    <th className="px-5 py-3 whitespace-nowrap">Qualified Leads</th>
                    <th className="px-5 py-3 whitespace-nowrap">CPL</th>
                    <th className="px-5 py-3 whitespace-nowrap">Spend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[12px] font-medium text-slate-700">
                  {deepDiveCampaigns.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-slate-400 italic">No campaigns found matching filter.</td>
                    </tr>
                  ) : (
                    deepDiveCampaigns.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3 text-slate-900 font-semibold">{c.name}</td>
                        <td className="px-5 py-3"><PlatformIcon platform={c.platform} /></td>
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            onClick={() => setAnalyticsDrillView({ type: "adSetBreakdown", campaign: c })}
                            className="flex items-center gap-1 text-slate-400 hover:text-[#0B1E6E] transition-colors"
                            title="Open ad-set breakdown"
                          >
                            <span>—</span>
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                        </td>
                        <td className="px-5 py-3 text-slate-300" title="Not tracked yet — no ad-creative-level data ingested">—</td>
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            onClick={() => setAnalyticsDrillView({ type: "qualifiedLeads", campaign: c })}
                            className="font-semibold text-[#0B1E6E] hover:underline"
                          >
                            {c.qualifiedLeads}
                          </button>
                        </td>
                        <td className="px-5 py-3">{c.cpl.toFixed(2)}</td>
                        <td className="px-5 py-3 font-semibold text-slate-800">{formatCurrency(c.spend)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )
      ) : (
        <>
          {/* Action Toolbar (Date Picker Pill, Campaigns Dropdown, Filter Button) */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
            {/* Date Range Picker Pill */}
            <CampaignDateRangePicker
              label={dateRangePickerLabel}
              customRangeStartDraft={customRangeStartDraft}
              customRangeEndDraft={customRangeEndDraft}
              onStartDraftChange={handleDateRangeStartChange}
              onEndDraftChange={handleDateRangeEndChange}
              onOpen={handleDateRangeOpen}
              onReset={handleDateRangeReset}
              onApply={handleDateRangeApply}
              canApply={dateRangeCanApply}
            />

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

          {/* Main Campaigns Data Table — row area is height-capped with its
              own scroll (independent of the page scroll), so a long/paged
              list doesn't stretch the whole page; header stays pinned and
              the pagination footer below stays out of the scroll area. */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-auto max-h-[45vh]">
              <table className="w-full text-left border-collapse table-auto min-w-[850px]">
                <thead className="sticky top-0 z-10">
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
