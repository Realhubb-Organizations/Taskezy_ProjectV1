"use client";

import React, { useState, useRef, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useApp, Lead } from "@/context/AppContext";
import { ChevronDown, ChevronRight, Calendar, Search, Sliders, Minus, X, Copy, Users } from "lucide-react";

const QUALIFIED_LEAD_STATUSES = ["Interested", "Connected", "Visit Schedule", "Site Visit", "Booking Done", "Booked"];
const FOLLOW_UP_LEAD_STATUSES = ["Follow-ups", "Call Back"];

// Quick-edit options for the per-row Status dropdown — the calling-workflow
// subset of LeadDetailDrawer's canonical status list. "Booked"/"Completed"
// are excluded here: those require a deal-value form (updateLeadStatus
// auto-generates a ₹0 invoice without one), so that transition stays gated
// behind the full LeadDetailDrawer instead of this quick row menu.
const ROW_STATUS_OPTIONS: Lead["status"][] = [
  "New Lead", "Assigned", "Connected", "RNR", "Call Back", "Interested", "Follow-ups",
  "Visit Schedule", "Site Visit", "Meeting Scheduled", "Meeting Done", "In Negotiation",
  "Not Interested", "Low Budget", "Invalid", "Dead"
];

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

export default function DataCallingPage() {
  const { leads, followupCalls, properties, users, activeRole, updateLeadStatus, reassignLead } = useApp();
  // Bulk select + Assign/Reshuffle are an admin-only workflow — a sales
  // agent has no one to hand leads off to in that sense, so the checkbox
  // column and both toolbar buttons stay admin-only.
  const isAdmin = activeRole === "ADMIN";

  const [activeTab, setActiveTab] = useState<"DataCalling" | "Analytics">("DataCalling");

  // Summary card date range — same intake-volume-only-for-"Total" convention
  // as the Campaigns page: Total Leads Assigned respects the range; the
  // other four are current pipeline-status snapshots, not date-scoped.
  const [dateRange, setDateRange] = useState<"Today" | "Yesterday" | "This Week" | "This Month" | "All Time">("Today");
  const [summaryDateMenuOpen, setSummaryDateMenuOpen] = useState(false);
  const [summaryDateMenuPos, setSummaryDateMenuPos] = useState<{ top: number; left: number } | null>(null);
  const summaryDateBtnRef = useRef<HTMLButtonElement>(null);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

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

  const [propertyDropdownOpen, setPropertyDropdownOpen] = useState(false);
  const [propertyDropdownPos, setPropertyDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const propertyBtnRef = useRef<HTMLButtonElement>(null);
  const [propertySearch, setPropertySearch] = useState("");

  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);
  const [assigneeDropdownPos, setAssigneeDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const assigneeBtnRef = useRef<HTMLButtonElement>(null);
  const [assigneeSearch, setAssigneeSearch] = useState("");

  const filteredAssignProperties = useMemo(() => {
    const q = propertySearch.trim().toLowerCase();
    return properties.filter(p => !q || p.name.toLowerCase().includes(q));
  }, [properties, propertySearch]);

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
    const pool = anyAllMembers ? users.filter(u => u.role === "AGENT") : users.filter(u => restrictedIds.has(u.id));
    const q = assigneeSearch.trim().toLowerCase();
    return pool.filter(u => !q || u.name.toLowerCase().includes(q));
  }, [assignSelectedPropertyIds, properties, users, assigneeSearch]);

  const selectedPropertyLabel = useMemo(() => {
    if (assignSelectedPropertyIds.size === 0) return "";
    if (assignSelectedPropertyIds.size === 1) {
      return properties.find(p => assignSelectedPropertyIds.has(p.id))?.name || "";
    }
    return `${assignSelectedPropertyIds.size} properties selected`;
  }, [assignSelectedPropertyIds, properties]);
  const selectedAssigneeName = useMemo(
    () => users.find(u => u.id === assignSelectedAssigneeId)?.name || "",
    [users, assignSelectedAssigneeId]
  );
  const canConfirmAssign = assignSelectedPropertyIds.size > 0 && !!assignSelectedAssigneeId;

  const openAssignFlow = (mode: "assign" | "reshuffle") => {
    setAssignSelectedPropertyIds(new Set());
    setAssignSelectedAssigneeId("");
    setPropertySearch("");
    setAssigneeSearch("");
    setAssignFlowMode(mode);
  };
  const closeAssignFlow = () => {
    setAssignFlowMode(null);
    setPropertyDropdownOpen(false);
    setAssigneeDropdownOpen(false);
  };
  const togglePropertySelection = (id: string) => {
    setAssignSelectedPropertyIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
      // Not relevant to Reshuffle: those leads already have a real status.
      if (assignFlowMode === "assign" && lead?.status === "Unassigned") updateLeadStatus(id, "Assigned");
    });
    setSelectedIds(prev => {
      const next = new Set(prev);
      targetIds.forEach(id => next.delete(id));
      return next;
    });
    closeAssignFlow();
  };

  // Per-row quick-edit dropdowns (Status, Assigned To) — same click-to-open-
  // portal pattern as the header filter menus, but keyed by lead id since a
  // table has many rows sharing one pair of open/pos state slots.
  const [rowStatusMenuFor, setRowStatusMenuFor] = useState<string | null>(null);
  const [rowStatusMenuPos, setRowStatusMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [rowAssignMenuFor, setRowAssignMenuFor] = useState<string | null>(null);
  const [rowAssignMenuPos, setRowAssignMenuPos] = useState<{ top: number; left: number } | null>(null);

  const copyToClipboard = (text: string) => {
    if (text) navigator.clipboard?.writeText(text).catch(() => {});
  };

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
    const anyOpen = summaryDateMenuOpen || calendarPickerOpen || statusMenuOpen || assignedMenuOpen ||
      propertyDropdownOpen || assigneeDropdownOpen || !!rowStatusMenuFor || !!rowAssignMenuFor;
    if (!anyOpen) return;
    const closeAll = () => {
      setSummaryDateMenuOpen(false);
      setCalendarPickerOpen(false);
      setStatusMenuOpen(false);
      setAssignedMenuOpen(false);
      setPropertyDropdownOpen(false);
      setAssigneeDropdownOpen(false);
      setRowStatusMenuFor(null);
      setRowAssignMenuFor(null);
    };
    window.addEventListener("scroll", closeAll, true);
    return () => window.removeEventListener("scroll", closeAll, true);
  }, [summaryDateMenuOpen, calendarPickerOpen, statusMenuOpen, assignedMenuOpen, propertyDropdownOpen, assigneeDropdownOpen, rowStatusMenuFor, rowAssignMenuFor]);

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
              <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
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
          {/* Action Toolbar (Bulk Assign/Reshuffle, Date Picker Pill, Settings Button) */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
            {isAdmin && selectedUnassignedIds.length > 0 && (
              <button
                type="button"
                onClick={() => openAssignFlow("assign")}
                className="flex items-center gap-2 bg-white border border-slate-300/80 rounded-xl px-3.5 py-1.5 text-xs text-slate-700 font-semibold hover:bg-slate-50 shadow-2xs transition-colors"
              >
                <Users className="h-3.5 w-3.5 text-blue-600" />
                Assign
              </button>
            )}
            {isAdmin && selectedAssignedIds.length > 0 && (
              <button
                type="button"
                onClick={() => openAssignFlow("reshuffle")}
                className="flex items-center gap-2 bg-white border border-slate-300/80 rounded-xl px-3.5 py-1.5 text-xs text-slate-700 font-semibold hover:bg-slate-50 shadow-2xs transition-colors"
              >
                <Users className="h-3.5 w-3.5 text-blue-600" />
                Reshuffle
              </button>
            )}
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
              Settings
            </button>
          </div>

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
                          <p className="text-slate-900 font-semibold truncate" title={l.name}>{l.name}</p>
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
                          <div className="relative inline-block">
                            <button
                              type="button"
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setRowStatusMenuPos({ top: rect.bottom + 4, left: rect.left });
                                setRowStatusMenuFor(prev => (prev === l.id ? null : l.id));
                              }}
                              className="flex items-center gap-1 font-bold text-slate-900 hover:text-blue-600 transition-colors"
                            >
                              <span>{l.status}</span>
                              <ChevronDown className={`h-3 w-3 transition-transform ${rowStatusMenuFor === l.id ? "rotate-180" : ""}`} />
                            </button>
                            {rowStatusMenuFor === l.id && rowStatusMenuPos && createPortal(
                              <>
                                <div className="fixed inset-0 z-[60]" onClick={() => setRowStatusMenuFor(null)} />
                                <div
                                  className="fixed z-[70] w-44 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 text-xs font-semibold"
                                  style={{ top: rowStatusMenuPos.top, left: rowStatusMenuPos.left }}
                                >
                                  {ROW_STATUS_OPTIONS.map(st => (
                                    <button
                                      key={st}
                                      type="button"
                                      onClick={() => { updateLeadStatus(l.id, st); setRowStatusMenuFor(null); }}
                                      className={`w-full text-left px-3 py-1.5 transition-colors ${
                                        l.status === st ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"
                                      }`}
                                    >
                                      {st}
                                    </button>
                                  ))}
                                </div>
                              </>,
                              document.body
                            )}
                          </div>
                        </td>
                        {visibleColumns.assignedTo && (
                          <td className="px-5 py-3.5">
                            <div className="relative inline-block max-w-[140px]">
                              <button
                                type="button"
                                onClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setRowAssignMenuPos({ top: rect.bottom + 4, left: rect.left });
                                  setRowAssignMenuFor(prev => (prev === l.id ? null : l.id));
                                }}
                                className="flex items-center gap-1 font-semibold text-slate-700 hover:text-blue-600 transition-colors max-w-full"
                              >
                                <span className="truncate">{l.assignedAgent || "—"}</span>
                                <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${rowAssignMenuFor === l.id ? "rotate-180" : ""}`} />
                              </button>
                              {rowAssignMenuFor === l.id && rowAssignMenuPos && createPortal(
                                <>
                                  <div className="fixed inset-0 z-[60]" onClick={() => setRowAssignMenuFor(null)} />
                                  <div
                                    className="fixed z-[70] w-44 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 text-xs font-semibold"
                                    style={{ top: rowAssignMenuPos.top, left: rowAssignMenuPos.left }}
                                  >
                                    {assignedOptions.map(agent => (
                                      <button
                                        key={agent}
                                        type="button"
                                        onClick={() => { reassignLead(l.id, agent); setRowAssignMenuFor(null); }}
                                        className={`w-full text-left px-3 py-1.5 transition-colors truncate ${
                                          l.assignedAgent === agent ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"
                                        }`}
                                      >
                                        {agent}
                                      </button>
                                    ))}
                                  </div>
                                </>,
                                document.body
                              )}
                            </div>
                          </td>
                        )}
                        {visibleColumns.date && <td className="px-5 py-3.5 whitespace-nowrap">{formatDateTime(l.createdAtStr)}</td>}
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
                <button
                  ref={propertyBtnRef}
                  type="button"
                  onClick={() => openPositionedMenu(propertyBtnRef, setPropertyDropdownPos, setPropertyDropdownOpen, "left", 400)}
                  className="w-full flex items-center justify-between border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-left hover:bg-slate-50 transition-colors"
                >
                  <span className={`truncate ${selectedPropertyLabel ? "text-slate-800 font-semibold" : "text-slate-400"}`}>
                    {selectedPropertyLabel || "Select property"}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${propertyDropdownOpen ? "rotate-180" : ""}`} />
                </button>
                {propertyDropdownOpen && propertyDropdownPos && createPortal(
                  <>
                    <div className="fixed inset-0 z-[110]" onClick={() => setPropertyDropdownOpen(false)} />
                    <div
                      className="fixed z-[120] w-[400px] max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
                      style={{ top: propertyDropdownPos.top, left: propertyDropdownPos.left }}
                    >
                      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-slate-100">
                        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <input
                          autoFocus
                          value={propertySearch}
                          onChange={(e) => setPropertySearch(e.target.value)}
                          placeholder="Search property..."
                          className="w-full text-sm focus:outline-none"
                        />
                      </div>
                      <div className="max-h-56 overflow-y-auto py-1">
                        {filteredAssignProperties.length === 0 ? (
                          <div className="px-3.5 py-3 text-xs text-slate-400 italic">No properties found</div>
                        ) : (
                          filteredAssignProperties.map(p => (
                            <label key={p.id} className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 font-medium hover:bg-slate-50 cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={assignSelectedPropertyIds.has(p.id)}
                                onChange={() => togglePropertySelection(p.id)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-[#0B1E6E] focus:ring-0 focus:ring-offset-0"
                              />
                              {p.name}
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  </>,
                  document.body
                )}
              </div>

              {/* Select Assignee — locked until at least one property is picked */}
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-800">
                  {assignFlowMode === "reshuffle" ? "Select Reshuffle Assignee" : "Select Assignee"}
                </label>
                <button
                  ref={assigneeBtnRef}
                  type="button"
                  disabled={assignSelectedPropertyIds.size === 0}
                  onClick={() => openPositionedMenu(assigneeBtnRef, setAssigneeDropdownPos, setAssigneeDropdownOpen, "left", 400)}
                  className={`w-full flex items-center justify-between border rounded-xl px-3.5 py-2.5 text-sm text-left transition-colors ${
                    assignSelectedPropertyIds.size === 0
                      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className={`truncate ${selectedAssigneeName ? "text-slate-800 font-semibold" : "text-slate-400"}`}>
                    {selectedAssigneeName || "Select Member"}
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${assigneeDropdownOpen ? "rotate-180" : ""} ${assignSelectedPropertyIds.size === 0 ? "text-slate-300" : "text-slate-400"}`} />
                </button>
                {assigneeDropdownOpen && assigneeDropdownPos && assignSelectedPropertyIds.size > 0 && createPortal(
                  <>
                    <div className="fixed inset-0 z-[110]" onClick={() => setAssigneeDropdownOpen(false)} />
                    <div
                      className="fixed z-[120] w-[400px] max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
                      style={{ top: assigneeDropdownPos.top, left: assigneeDropdownPos.left }}
                    >
                      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-slate-100">
                        <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <input
                          autoFocus
                          value={assigneeSearch}
                          onChange={(e) => setAssigneeSearch(e.target.value)}
                          placeholder="Search assignee..."
                          className="w-full text-sm focus:outline-none"
                        />
                      </div>
                      <div className="max-h-56 overflow-y-auto py-1 text-sm font-semibold">
                        {eligibleAssignees.length === 0 ? (
                          <div className="px-3.5 py-3 text-xs text-slate-400 italic font-normal">No connected assignees found</div>
                        ) : (
                          eligibleAssignees.map(u => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => { setAssignSelectedAssigneeId(u.id); setAssigneeDropdownOpen(false); }}
                              className={`w-full text-left px-3.5 py-2 transition-colors truncate ${
                                assignSelectedAssigneeId === u.id ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              {u.name}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </>,
                  document.body
                )}
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
    </div>
  );
}
