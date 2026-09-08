"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useApp, Lead } from "@/context/AppContext";
import { ChevronDown, Calendar, Search, Sliders, Minus, X } from "lucide-react";

const QUALIFIED_LEAD_STATUSES = ["Interested", "Connected", "Visit Schedule", "Site Visit", "Booking Done", "Booked"];
const FOLLOW_UP_LEAD_STATUSES = ["Follow-ups", "Call Back"];

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

export default function DataCallingPage() {
  const { leads, followupCalls } = useApp();

  const [activeTab, setActiveTab] = useState<"DataCalling" | "Analytics">("DataCalling");

  // Summary card date range — same intake-volume-only-for-"Total" convention
  // as the Campaigns page: Total Leads Assigned respects the range; the
  // other four are current pipeline-status snapshots, not date-scoped.
  const [dateRange, setDateRange] = useState<"Today" | "Yesterday" | "This Week" | "This Month" | "All Time">("Today");
  const [summaryDateMenuOpen, setSummaryDateMenuOpen] = useState(false);
  const [summaryDateMenuPos, setSummaryDateMenuPos] = useState<{ top: number; left: number } | null>(null);
  const summaryDateBtnRef = useRef<HTMLButtonElement>(null);

  const today = new Date();
  const todayStr = today.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

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
  const leadInSelectedRange = (l: Lead) => dateInRange(l.createdAtStr, mapDateRangeToKey(dateRange), today);

  // Custom date-range calendar pill (toolbar) — mirrors the Campaigns page's
  // picker: Start/End inputs, Reset/Apply, guards end < start.
  const [calendarPickerOpen, setCalendarPickerOpen] = useState(false);
  const [calendarMenuPos, setCalendarMenuPos] = useState<{ top: number; left: number } | null>(null);
  const calendarBtnRef = useRef<HTMLButtonElement>(null);
  const [customRangeStartDraft, setCustomRangeStartDraft] = useState("");
  const [customRangeEndDraft, setCustomRangeEndDraft] = useState("");
  const [appliedCustomRange, setAppliedCustomRange] = useState<{ start: string; end: string } | null>(null);
  const dateRangePickerLabel = appliedCustomRange ? `${appliedCustomRange.start} to ${appliedCustomRange.end}` : todayStr;

  // Summary metrics — real, no hardcoded fallbacks.
  const summaryMetrics = useMemo(() => {
    const rangeLeads = leads.filter(leadInSelectedRange);
    return {
      totalAssigned: rangeLeads.filter(l => !!l.assignedAgent).length,
      callsMade: leads.filter(l => l.logs && l.logs.length > 0).length,
      qualifiedLeads: leads.filter(l => QUALIFIED_LEAD_STATUSES.includes(l.status)).length,
      rnr: leads.filter(l => l.status === "RNR").length,
      followUps: leads.filter(l => FOLLOW_UP_LEAD_STATUSES.includes(l.status)).length
    };
  }, [leads, dateRange]);

  // Table filters
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [statusMenuPos, setStatusMenuPos] = useState<{ top: number; left: number } | null>(null);
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const statusOptions = useMemo(() => Array.from(new Set(leads.map(l => l.status))).sort(), [leads]);

  const [assignedFilters, setAssignedFilters] = useState<string[]>([]);
  const [assignedMenuOpen, setAssignedMenuOpen] = useState(false);
  const [assignedMenuPos, setAssignedMenuPos] = useState<{ top: number; left: number } | null>(null);
  const assignedBtnRef = useRef<HTMLButtonElement>(null);
  const assignedOptions = useMemo(() => Array.from(new Set(leads.map(l => l.assignedAgent).filter(Boolean))).sort(), [leads]);

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

  // Every button-anchored dropdown here snapshots its position once on
  // click and never re-measures, so it visually detaches from its button
  // if the page scrolls while open — close on scroll instead (same fix
  // applied to the Campaigns page's dropdowns).
  useEffect(() => {
    const anyOpen = summaryDateMenuOpen || calendarPickerOpen || statusMenuOpen || assignedMenuOpen;
    if (!anyOpen) return;
    const closeAll = () => {
      setSummaryDateMenuOpen(false);
      setCalendarPickerOpen(false);
      setStatusMenuOpen(false);
      setAssignedMenuOpen(false);
    };
    window.addEventListener("scroll", closeAll, true);
    return () => window.removeEventListener("scroll", closeAll, true);
  }, [summaryDateMenuOpen, calendarPickerOpen, statusMenuOpen, assignedMenuOpen]);

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

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter(l => {
      const matchesSearch = !q || l.name.toLowerCase().includes(q);
      const matchesStatus = statusFilters.length === 0 || statusFilters.includes(l.status);
      const matchesAssigned = assignedFilters.length === 0 || assignedFilters.includes(l.assignedAgent);
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
      return matchesSearch && matchesStatus && matchesAssigned && matchesDate;
    });
  }, [leads, searchQuery, statusFilters, assignedFilters, appliedCustomRange]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / rowsPerPage));
  const currentPageClamped = Math.min(currentPage, totalPages);
  const paginatedLeads = filteredLeads.slice((currentPageClamped - 1) * rowsPerPage, currentPageClamped * rowsPerPage);

  const visibleColCount = 4 + DATA_CALLING_COLUMNS.filter(c => visibleColumns[c.key]).length;

  return (
    <div className="space-y-4 pb-8 animate-fade-in text-slate-800">
      {/* Top Toggle Switcher: Data Calling vs Data Calling Analytics */}
      <div className="flex items-center gap-1.5">
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
      </div>

      {/* Date Filter & Metrics — same unified card pattern as the CRM
          Dashboard/Campaigns pages: a header bar (date range) sitting
          directly on the stat columns, no separate padded/shadowed cards. */}
      <div className="bg-slate-100/70 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
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
                        onClick={() => { setDateRange(opt); setSummaryDateMenuOpen(false); }}
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

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          {([
            { label: "Total Leads Assigned", value: summaryMetrics.totalAssigned, color: "text-slate-900" },
            { label: "Calls Made", value: summaryMetrics.callsMade, color: "text-slate-900" },
            { label: "Qualified Leads", value: summaryMetrics.qualifiedLeads, color: "text-rose-600" },
            { label: "RNR", value: summaryMetrics.rnr, color: "text-amber-500" },
            { label: "Follow Ups", value: summaryMetrics.followUps, color: "text-blue-500" }
          ] as const).map(s => (
            <div key={s.label} className="p-3 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-medium text-slate-500 block">{s.label}</span>
                <span className={`text-lg font-extrabold mt-1.5 block ${s.color}`}>{s.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {activeTab === "Analytics" ? (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-1">Data Calling Analytics</h3>
          <p className="text-xs text-slate-500 mb-4">A deeper breakdown (charts, per-agent/property performance) can be built out here, same as Campaigns Analytics — let me know what you want first.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-400 font-medium">Leads Contacted</span>
              <p className="text-xl font-bold text-slate-800 mt-1">{summaryMetrics.callsMade}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-400 font-medium">Qualified Rate</span>
              <p className="text-xl font-bold text-emerald-600 mt-1">
                {leads.length > 0 ? ((summaryMetrics.qualifiedLeads / leads.length) * 100).toFixed(1) : "0.0"}%
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-400 font-medium">RNR Rate</span>
              <p className="text-xl font-bold text-rose-600 mt-1">
                {leads.length > 0 ? ((summaryMetrics.rnr / leads.length) * 100).toFixed(1) : "0.0"}%
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Action Toolbar (Date Picker Pill, Filter Button) */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
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
                <span>{dateRangePickerLabel}</span>
              </button>
              {calendarPickerOpen && calendarMenuPos && createPortal(
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setCalendarPickerOpen(false)} />
                  <div
                    className="fixed z-[70] w-64 max-w-[calc(100vw-1rem)] bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3"
                    style={{ top: calendarMenuPos.top, left: calendarMenuPos.left }}
                  >
                    <p className="text-[11px] font-bold text-slate-700">Filter leads by date range</p>
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-bold text-slate-400 uppercase">Start Date</label>
                      <input
                        type="date"
                        value={customRangeStartDraft}
                        onChange={(e) => {
                          const newStart = e.target.value;
                          setCustomRangeStartDraft(newStart);
                          if (customRangeEndDraft && newStart && customRangeEndDraft < newStart) setCustomRangeEndDraft("");
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
                          if (!customRangeStartDraft || !customRangeEndDraft || customRangeEndDraft < customRangeStartDraft) return;
                          setAppliedCustomRange({ start: customRangeStartDraft, end: customRangeEndDraft });
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

            <button
              type="button"
              onClick={() => setIsFilterOpen(true)}
              className="flex items-center gap-2 border border-slate-300/80 bg-white rounded-xl px-3.5 py-1.5 text-xs text-slate-700 font-semibold hover:bg-slate-50 shadow-2xs transition-colors"
            >
              <Sliders className="h-3.5 w-3.5 text-blue-600" />
              Filter
            </button>
          </div>

          {/* Main Data Calling Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-auto max-h-[55vh]">
              <table className="w-full text-left border-collapse table-auto min-w-[900px]">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="border-b border-slate-200/80 text-[12px] font-bold text-slate-900">
                    <th className="px-5 py-3.5">
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
                      <div className="relative inline-block">
                        <button
                          type="button"
                          ref={statusBtnRef}
                          onClick={() => openPositionedMenu(statusBtnRef, setStatusMenuPos, setStatusMenuOpen, "left", 180)}
                          className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                        >
                          <span>Status</span>
                          <ChevronDown className={`h-3 w-3 text-slate-800 transition-transform ${statusMenuOpen ? "rotate-180" : ""}`} />
                        </button>
                        {statusMenuOpen && statusMenuPos && createPortal(
                          <>
                            <div className="fixed inset-0 z-[60]" onClick={() => setStatusMenuOpen(false)} />
                            <div
                              className="fixed z-[70] w-48 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 text-xs font-medium"
                              style={{ top: statusMenuPos.top, left: statusMenuPos.left }}
                            >
                              <button
                                type="button"
                                onClick={() => setStatusFilters([])}
                                className="w-full flex items-center gap-1.5 text-left px-3 py-1.5 text-slate-500 font-bold hover:bg-slate-50 border-b border-slate-100 transition-colors"
                              >
                                <Minus className="h-3 w-3" />
                                All Statuses
                              </button>
                              {statusOptions.map(st => (
                                <label key={st} className="flex items-center gap-2 px-3 py-1.5 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={statusFilters.includes(st)}
                                    onChange={() => setStatusFilters(prev => prev.includes(st) ? prev.filter(s => s !== st) : [...prev, st])}
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
                    {visibleColumns.assignedTo && (
                      <th className="px-5 py-3.5 whitespace-nowrap">
                        <div className="relative inline-block">
                          <button
                            type="button"
                            ref={assignedBtnRef}
                            onClick={() => openPositionedMenu(assignedBtnRef, setAssignedMenuPos, setAssignedMenuOpen, "left", 180)}
                            className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                          >
                            <span>Assigned To</span>
                            <ChevronDown className={`h-3 w-3 text-slate-800 transition-transform ${assignedMenuOpen ? "rotate-180" : ""}`} />
                          </button>
                          {assignedMenuOpen && assignedMenuPos && createPortal(
                            <>
                              <div className="fixed inset-0 z-[60]" onClick={() => setAssignedMenuOpen(false)} />
                              <div
                                className="fixed z-[70] w-48 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 text-xs font-medium"
                                style={{ top: assignedMenuPos.top, left: assignedMenuPos.left }}
                              >
                                <button
                                  type="button"
                                  onClick={() => setAssignedFilters([])}
                                  className="w-full flex items-center gap-1.5 text-left px-3 py-1.5 text-slate-500 font-bold hover:bg-slate-50 border-b border-slate-100 transition-colors"
                                >
                                  <Minus className="h-3 w-3" />
                                  Everyone
                                </button>
                                {assignedOptions.map(agent => (
                                  <label key={agent} className="flex items-center gap-2 px-3 py-1.5 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={assignedFilters.includes(agent)}
                                      onChange={() => setAssignedFilters(prev => prev.includes(agent) ? prev.filter(a => a !== agent) : [...prev, agent])}
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-[#0B1E6E] focus:ring-0 focus:ring-offset-0"
                                    />
                                    {agent}
                                  </label>
                                ))}
                              </div>
                            </>,
                            document.body
                          )}
                        </div>
                      </th>
                    )}
                    {visibleColumns.date && <th className="px-5 py-3.5 whitespace-nowrap">Date</th>}
                    {visibleColumns.notes && <th className="px-5 py-3.5 whitespace-nowrap">Notes</th>}
                    <th className="px-5 py-3.5 whitespace-nowrap">Next Call Date</th>
                    {visibleColumns.property && <th className="px-5 py-3.5 whitespace-nowrap">Property</th>}
                    {visibleColumns.dataCallSource && <th className="px-5 py-3.5 whitespace-nowrap">Data Call Source</th>}
                    {visibleColumns.usageCount && <th className="px-5 py-3.5 whitespace-nowrap">Usage Count</th>}
                    {visibleColumns.qualifiedLeads && <th className="px-5 py-3.5 whitespace-nowrap">Qualified Leads</th>}
                    {visibleColumns.unqualifiedLeads && <th className="px-5 py-3.5 whitespace-nowrap">Unqualified Leads</th>}
                    {visibleColumns.cpl && <th className="px-5 py-3.5 whitespace-nowrap">CPL</th>}
                    {visibleColumns.qualifiedPercent && <th className="px-5 py-3.5 whitespace-nowrap">Qualified %age</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[12px] font-medium text-slate-700">
                  {paginatedLeads.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColCount} className="px-5 py-8 text-center text-slate-400 italic">No leads found matching filter.</td>
                    </tr>
                  ) : (
                    paginatedLeads.map(l => (
                      <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3.5 text-slate-900 font-semibold">{l.name}</td>
                        <td className="px-5 py-3.5 truncate max-w-[160px]" title={l.email}>{l.email || "—"}</td>
                        <td className="px-5 py-3.5 whitespace-nowrap">{l.status}</td>
                        {visibleColumns.assignedTo && <td className="px-5 py-3.5">{l.assignedAgent || "—"}</td>}
                        {visibleColumns.date && <td className="px-5 py-3.5 whitespace-nowrap">{l.createdAtStr || "—"}</td>}
                        {visibleColumns.notes && <td className="px-5 py-3.5 truncate max-w-[200px]" title={latestLogMessage(l)}>{latestLogMessage(l)}</td>}
                        <td className="px-5 py-3.5 whitespace-nowrap">{nextCallDateFor(l.id)}</td>
                        {visibleColumns.property && <td className="px-5 py-3.5">{l.property || "—"}</td>}
                        {visibleColumns.dataCallSource && <td className="px-5 py-3.5">{l.source || "—"}</td>}
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

            {/* Table Footer / Pagination Controls */}
            <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 font-medium">
              <span className="font-bold text-slate-700">{filteredLeads.length} Rows</span>
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
                  {filteredLeads.length === 0
                    ? "0-0 of 0"
                    : `${(currentPageClamped - 1) * rowsPerPage + 1}-${Math.min(currentPageClamped * rowsPerPage, filteredLeads.length)} of ${filteredLeads.length}`}
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
    </div>
  );
}
