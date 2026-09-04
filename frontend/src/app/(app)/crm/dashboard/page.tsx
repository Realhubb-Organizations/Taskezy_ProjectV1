"use client";

import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useApp, Lead, LeadStatus } from "@/context/AppContext";
import AddLeadModal from "@/components/crm/AddLeadModal";
import PendingLeadsTable, { PendingRow } from "@/components/dashboard/PendingLeadsTable";
import { DB_CODE_TO_FRONTEND_STATUS } from "@/lib/leadStatusMapping";
import { WhatsAppIcon, CallIcon } from "@/components/icons/ContactIcons";
import { ChevronDown, Plus, CheckCircle, Phone, Mail, X, Copy, Check, User, Search } from "lucide-react";

const STATUS_OPTIONS = Array.from(new Set(Object.values(DB_CODE_TO_FRONTEND_STATUS)));

// CRM's own overview — moved out of the old bare /dashboard route (which
// branched its content by department/activeSystem, so the same URL showed a
// different page depending on runtime state, and was also registered as the
// CRM sidebar group's own "Dashboard" item — force-expanding CRM any time
// this rendered, even for users who weren't in CRM at all) into its own
// real path, alongside /hrms/dashboard and /finance/dashboard.
export default function CrmDashboardPage() {
  const { leads, properties, users, currentUser, addLead, followupCalls, updateLeadStatus } = useApp();

  const [dateRange, setDateRange] = useState<"today" | "yesterday" | "week" | "month" | "all">("today");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [drillPage, setDrillPage] = useState(1);
  const [drillRowsPerPage, setDrillRowsPerPage] = useState(10);
  const [quickViewLead, setQuickViewLead] = useState<Lead | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [drillSearch, setDrillSearch] = useState("");
  const [drillSearchOpen, setDrillSearchOpen] = useState(false);
  const [drillStatusFilter, setDrillStatusFilter] = useState<string[]>([]);
  const [drillStatusMenuOpen, setDrillStatusMenuOpen] = useState(false);
  const [drillAssignedFilter, setDrillAssignedFilter] = useState<string[]>([]);
  const [drillAssignedMenuOpen, setDrillAssignedMenuOpen] = useState(false);
  const [drillCampaignFilter, setDrillCampaignFilter] = useState<string[]>([]);
  const [drillCampaignMenuOpen, setDrillCampaignMenuOpen] = useState(false);
  const [dateRangeMenuOpen, setDateRangeMenuOpen] = useState(false);
  const [dateRangeMenuPos, setDateRangeMenuPos] = useState<{ top: number; left: number } | null>(null);
  const dateRangeBtnRef = useRef<HTMLButtonElement>(null);
  const [drillSearchPos, setDrillSearchPos] = useState<{ top: number; left: number } | null>(null);
  const drillSearchBtnRef = useRef<HTMLButtonElement>(null);
  const [drillStatusMenuPos, setDrillStatusMenuPos] = useState<{ top: number; left: number } | null>(null);
  const drillStatusBtnRef = useRef<HTMLButtonElement>(null);
  const [drillAssignedMenuPos, setDrillAssignedMenuPos] = useState<{ top: number; left: number } | null>(null);
  const drillAssignedBtnRef = useRef<HTMLButtonElement>(null);
  const [drillCampaignMenuPos, setDrillCampaignMenuPos] = useState<{ top: number; left: number } | null>(null);
  const drillCampaignBtnRef = useRef<HTMLButtonElement>(null);

  // The table's own horizontal-scroll wrapper (overflow-x-auto) and the
  // stat-cards card (overflow-hidden, for its rounded corners) both clip any
  // descendant that visually extends past them — which every one of these
  // dropdown/search panels does. Portaled to <body> and positioned from the
  // trigger's real screen coordinates instead of relying on CSS `absolute`
  // inside a clipped ancestor.
  const openPositionedMenu = (
    ref: React.RefObject<HTMLButtonElement>,
    setPos: (p: { top: number; left: number } | null) => void,
    setOpen: (fn: (o: boolean) => boolean) => void,
    align: "left" | "right" = "left",
    panelWidth = 208
  ) => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: align === "left" ? rect.left : rect.right - panelWidth });
    setOpen(o => !o);
  };

  const openDateRangeMenu = () => openPositionedMenu(dateRangeBtnRef, setDateRangeMenuPos, setDateRangeMenuOpen, "left", 144);

  const DATE_RANGE_OPTIONS: { value: typeof dateRange; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "week", label: "This Week" },
    { value: "month", label: "This Month" },
    { value: "all", label: "All Time" }
  ];

  const toggleDrillFilter = (list: string[], value: string, setList: (v: string[]) => void) => {
    setDrillPage(1);
    setList(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  };

  const copyToClipboard = (field: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  };

  const statusBadgeClasses = (status: LeadStatus) => {
    switch (status) {
      case "Booked":
      case "Booking Done":
      case "Booking Approved":
      case "Completed":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "New Lead":
      case "New Leads":
      case "New":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "Interested":
      case "Connected":
      case "EOI Customers":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "Follow up":
      case "Follow-ups":
      case "Visit Schedule":
      case "Site Visit Scheduled":
      case "Meeting Scheduled":
      case "Call Back":
      case "RNR":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "Dead":
      case "Invalid":
      case "Finance Rejected":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  const dateInRange = (dateStr: string | undefined, range: typeof dateRange, refNow: Date): boolean => {
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
    // month
    return d.getMonth() === refNow.getMonth() && d.getFullYear() === refNow.getFullYear();
  };

  const sortedLogs = (l: Lead) => [...(l.logs || [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const latestLogMessage = (l: Lead): string => {
    const logs = sortedLogs(l);
    return logs.length > 0 ? logs[0].message : "No feedback yet";
  };

  // "When did this lead actually enter its current pending state" — the most
  // recent log entry, not the lead's original createdAtStr (which stays fixed
  // from lead creation and would make a follow-up look "due" from weeks ago).
  const formatDateTime = (iso: string | undefined): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const lastActivityIso = (l: Lead): string | undefined => {
    const logs = sortedLogs(l);
    return logs.length > 0 ? logs[0].timestamp : l.createdAtStr;
  };

  const lastActivityTime = (l: Lead): string => formatDateTime(lastActivityIso(l));

  const isSalesMember = currentUser?.role_type === "Member" && currentUser?.role !== "ADMIN";

  const scopedLeads = leads.filter(l => {
    if (isSalesMember) {
      return l.assignedAgent.toLowerCase() === currentUser?.name.toLowerCase();
    }
    return true;
  });

  const now = new Date();
  // "Date Range" filters by when a lead was *created* — meaningful for "how
  // many leads came in today", but wrong for a status like RNR: a lead
  // created last week that gets marked RNR today would be created-date
  // "not today" and silently disappear from the count even though it's
  // sitting in RNR right now. Total Leads/New Leads use it (they're about
  // intake volume); every other card below reflects the lead's current
  // status regardless of when it was created — a live pipeline snapshot,
  // not an intake-date snapshot.
  const rangeLeads = scopedLeads.filter(l => dateInRange(l.createdAtStr, dateRange, now));

  const totalLeadsCount = rangeLeads.length;
  const newLeadsCount = rangeLeads.filter(l => l.status === "New Lead").length;
  const rnrCount = scopedLeads.filter(l => l.status === "RNR").length;
  // "Call Backs" deliberately reads the lead's own status (like every other
  // card here) rather than the followup_calls table: a FollowupCall row is
  // only created when an agent also fills in the optional reminder date/time
  // picker after changing status, so sourcing this metric from that table
  // would silently show 0 even when leads are genuinely sitting in Call Back.
  const callBacksCount = scopedLeads.filter(l => l.status === "Call Back").length;
  const followUpsCount = scopedLeads.filter(l => l.status === "Follow-ups").length;
  const siteVisitScheduledCount = scopedLeads.filter(l => l.status === "Visit Schedule").length;
  const siteVisitDoneCount = scopedLeads.filter(l => l.status === "Site Visit").length;

  // Each card's real underlying lead list — same predicates as the counts
  // above — so clicking a card can drill into exactly what it counted.
  const categoryLeads: Record<string, Lead[]> = {
    "Total Leads": rangeLeads,
    "New Leads": rangeLeads.filter(l => l.status === "New Lead"),
    "RNR": scopedLeads.filter(l => l.status === "RNR"),
    "Call Backs": scopedLeads.filter(l => l.status === "Call Back"),
    "Follow Ups": scopedLeads.filter(l => l.status === "Follow-ups"),
    "Site Visit Scheduled": scopedLeads.filter(l => l.status === "Visit Schedule"),
    "Site Visit Done": scopedLeads.filter(l => l.status === "Site Visit")
  };

  const statCards: { label: string; value: number; color: string }[] = [
    { label: "Total Leads", value: totalLeadsCount, color: "text-slate-900" },
    { label: "New Leads", value: newLeadsCount, color: "text-[#0084FF]" },
    { label: "RNR", value: rnrCount, color: "text-[#FF0000]" },
    { label: "Call Backs", value: callBacksCount, color: "text-[#FF8C00]" },
    { label: "Follow Ups", value: followUpsCount, color: "text-[#0084FF]" },
    { label: "Site Visit Scheduled", value: siteVisitScheduledCount, color: "text-[#FF0000]" },
    { label: "Site Visit Done", value: siteVisitDoneCount, color: "text-[#015814]" }
  ];

  const toggleCategory = (label: string) => {
    setSelectedCategory(prev => (prev === label ? null : label));
    setDrillPage(1);
    setDrillSearch("");
    setDrillStatusFilter([]);
    setDrillAssignedFilter([]);
    setDrillCampaignFilter([]);
  };

  // The full, unfiltered set behind the selected stat card — filter option
  // lists are built from this so they don't shrink as filters are applied.
  const drillCategoryLeads = selectedCategory ? categoryLeads[selectedCategory] : [];
  const drillStatusOptions = Array.from(new Set(drillCategoryLeads.map(l => l.status)));
  const drillAssignedOptions = Array.from(new Set(drillCategoryLeads.map(l => l.assignedAgent).filter(Boolean)));
  const drillCampaignOptions = Array.from(new Set(drillCategoryLeads.map(l => l.campaign || l.source).filter(Boolean))) as string[];

  const drillLeads = drillCategoryLeads.filter(l => {
    const matchesSearch = !drillSearch || l.name.toLowerCase().includes(drillSearch.toLowerCase()) || l.phone.includes(drillSearch);
    const matchesStatus = drillStatusFilter.length === 0 || drillStatusFilter.includes(l.status);
    const matchesAssigned = drillAssignedFilter.length === 0 || drillAssignedFilter.includes(l.assignedAgent);
    const campaignVal = l.campaign || l.source || "";
    const matchesCampaign = drillCampaignFilter.length === 0 || drillCampaignFilter.includes(campaignVal);
    return matchesSearch && matchesStatus && matchesAssigned && matchesCampaign;
  });
  const drillTotalPages = Math.max(1, Math.ceil(drillLeads.length / drillRowsPerPage));
  const drillCurrentPage = Math.min(drillPage, drillTotalPages);
  const drillPageLeads = drillLeads.slice((drillCurrentPage - 1) * drillRowsPerPage, drillCurrentPage * drillRowsPerPage);

  // Real next-scheduled-call date, from the actual followup_calls queue —
  // "—" when no reminder was ever set for this lead, rather than a
  // fabricated createdAt+1day placeholder.
  const nextCallDateFor = (leadId: string): string => {
    const upcoming = followupCalls
      .filter(c => c.leadId === leadId && c.status === "Upcoming")
      .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());
    return upcoming.length > 0 ? `${upcoming[0].date} ${upcoming[0].time}` : "—";
  };

  // Booking a lead auto-generates a real invoice using this deal value as
  // the base amount (see AppContext's updateLeadStatus) — a real value is
  // required here, not invented, matching the same guard used everywhere
  // else in the app a status dropdown can reach a Booking status.
  const handleDrillStatusChange = (leadId: string, status: LeadStatus) => {
    if (status === "Booking Done" || status === "Booking Approved" || status === "Booked") {
      const input = prompt("Enter the real deal value for this booking (INR):");
      const dealValue = input ? parseFloat(input.replace(/[^0-9.]/g, "")) : NaN;
      if (!input || isNaN(dealValue) || dealValue <= 0) {
        alert("A valid deal value is required to mark a lead as Booked.");
        return;
      }
      updateLeadStatus(leadId, status, dealValue);
    } else {
      updateLeadStatus(leadId, status);
    }
  };

  // Pending Follow ups/Call Backs rows only carry a summary shape
  // (PendingRow), not the full Lead the quick-view needs — look the real
  // record up by id from the same `leads` list everything else here reads.
  const openQuickView = (leadId: string) => {
    const found = leads.find(l => l.id === leadId);
    if (found) setQuickViewLead(found);
  };

  const byMostRecentActivity = (a: Lead, b: Lead) => new Date(lastActivityIso(b) || 0).getTime() - new Date(lastActivityIso(a) || 0).getTime();

  const pendingFollowUpLeads = scopedLeads.filter(l => l.status === "Follow-ups").sort(byMostRecentActivity);
  const pendingCallBackLeads = scopedLeads.filter(l => l.status === "Call Back").sort(byMostRecentActivity);

  // Real sales roster + property list, same source the Leads page's Add Lead
  // modal already uses — reused here so "+ Upload Leads" is a real, working
  // entry point rather than a second, divergent implementation.
  const propertiesList = properties.map(p => p.name);
  const agentsList = users.filter(u => u.department === "SALES" && u.status !== "INACTIVE").map(u => u.name);

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

  const followUpRows: PendingRow[] = pendingFollowUpLeads.map(l => ({
    id: l.id,
    time: lastActivityTime(l),
    name: l.name,
    phone: l.phone,
    assignedTo: l.assignedAgent,
    feedback: latestLogMessage(l),
    property: l.property || "Not set",
    leadId: l.id
  }));

  const callBackRows: PendingRow[] = pendingCallBackLeads.map(l => ({
    id: l.id,
    time: lastActivityTime(l),
    name: l.name,
    phone: l.phone,
    assignedTo: l.assignedAgent,
    feedback: latestLogMessage(l),
    property: l.property || "Not set",
    leadId: l.id
  }));

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
            <div className="relative">
              <button
                ref={dateRangeBtnRef}
                onClick={openDateRangeMenu}
                className="flex items-center gap-1.5 bg-white border border-slate-300/80 rounded-md px-2 py-0.5 font-black text-slate-800 text-[11px] hover:bg-slate-50 transition-colors"
              >
                {DATE_RANGE_OPTIONS.find(o => o.value === dateRange)?.label}
                <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${dateRangeMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {dateRangeMenuOpen && dateRangeMenuPos && createPortal(
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setDateRangeMenuOpen(false)} />
                  <div
                    className="fixed z-[70] w-36 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 overflow-hidden"
                    style={{ top: dateRangeMenuPos.top, left: dateRangeMenuPos.left }}
                  >
                    {DATE_RANGE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => { setDateRange(opt.value); setDateRangeMenuOpen(false); }}
                        className={`w-full text-left px-3 py-1.5 text-xs font-bold transition-colors ${
                          dateRange === opt.value ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"
                        }`}
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
          <Link href="/dashboard/reports" className="text-blue-600 font-extrabold hover:underline">
            View Detailed Analytics
          </Link>
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
                onClick={() => toggleCategory(s.label)}
                className={`p-3 flex flex-col justify-between min-h-[70px] min-w-[110px] md:min-w-0 flex-1 text-left group transition-colors ${
                  isActive ? "bg-blue-50/70" : "hover:bg-slate-50/50"
                }`}
              >
                <span className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                  {s.label}
                  <ChevronDown className={`h-3 w-3 text-slate-300 shrink-0 transition-transform ${isActive ? "rotate-180 text-blue-500" : ""}`} />
                </span>
                <span className={`text-lg font-extrabold block mt-1.5 ${s.color}`}>{s.value}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Drill-down table — the real leads behind whichever stat column is selected */}
      {selectedCategory && (
        <div className="bg-white rounded-2xl shadow-md animate-fade-in">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900">{selectedCategory}</h3>
            <button onClick={() => setSelectedCategory(null)} className="text-[11px] font-bold text-slate-400 hover:text-slate-700">
              Close ✕
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed min-w-[1080px]">
              <colgroup>
                <col className="w-[150px]" />
                <col className="w-[160px]" />
                <col className="w-[140px]" />
                <col className="w-[120px]" />
                <col className="w-[110px]" />
                <col className="w-[180px]" />
                <col className="w-[120px]" />
                <col className="w-[150px]" />
                <col className="w-[90px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold text-slate-800">
                  <th className="px-4 py-2.5">
                    <div className="relative flex items-center gap-1.5">
                      Lead Name
                      <button
                        ref={drillSearchBtnRef}
                        onClick={() => openPositionedMenu(drillSearchBtnRef, setDrillSearchPos, setDrillSearchOpen, "left", 208)}
                        className="text-slate-400 hover:text-brand-700"
                        title="Search"
                      >
                        <Search className="h-3.5 w-3.5" />
                      </button>
                      {drillSearchOpen && drillSearchPos && createPortal(
                        <>
                          <div className="fixed inset-0 z-[60]" onClick={() => { if (!drillSearch) setDrillSearchOpen(false); }} />
                          <input
                            autoFocus
                            value={drillSearch}
                            onChange={(e) => { setDrillSearch(e.target.value); setDrillPage(1); }}
                            placeholder="Search name or phone..."
                            className="fixed z-[70] w-52 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-normal shadow-lg focus:outline-none focus:border-brand-500"
                            style={{ top: drillSearchPos.top, left: drillSearchPos.left }}
                          />
                        </>,
                        document.body
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-2.5 whitespace-nowrap">Email</th>
                  <th className="px-4 py-2.5">
                    <div className="relative">
                      <button
                        ref={drillStatusBtnRef}
                        onClick={() => openPositionedMenu(drillStatusBtnRef, setDrillStatusMenuPos, setDrillStatusMenuOpen, "left", 208)}
                        className="flex items-center gap-1.5 hover:text-brand-700 whitespace-nowrap"
                      >
                        Status
                        <ChevronDown className="h-3 w-3" />
                        {drillStatusFilter.length > 0 && (
                          <span className="text-[9px] bg-brand-50 text-brand-700 rounded-full px-1.5 py-0.5 font-bold">{drillStatusFilter.length}</span>
                        )}
                      </button>
                      {drillStatusMenuOpen && drillStatusMenuPos && createPortal(
                        <>
                          <div className="fixed inset-0 z-[60]" onClick={() => setDrillStatusMenuOpen(false)} />
                          <div
                            className="fixed z-[70] w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1.5 max-h-56 overflow-y-auto"
                            style={{ top: drillStatusMenuPos.top, left: drillStatusMenuPos.left }}
                          >
                            {drillStatusOptions.length === 0 ? (
                              <p className="px-3 py-2 text-xs text-slate-400 italic font-normal">No data yet</p>
                            ) : (
                              drillStatusOptions.map(opt => (
                                <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-xs font-normal text-slate-700 hover:bg-slate-50 cursor-pointer">
                                  <input type="checkbox" checked={drillStatusFilter.includes(opt)} onChange={() => toggleDrillFilter(drillStatusFilter, opt, setDrillStatusFilter)} />
                                  {opt}
                                </label>
                              ))
                            )}
                          </div>
                        </>,
                        document.body
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-2.5">
                    <div className="relative">
                      <button
                        ref={drillAssignedBtnRef}
                        onClick={() => openPositionedMenu(drillAssignedBtnRef, setDrillAssignedMenuPos, setDrillAssignedMenuOpen, "left", 208)}
                        className="flex items-center gap-1.5 hover:text-brand-700 whitespace-nowrap"
                      >
                        Assigned To
                        <ChevronDown className="h-3 w-3" />
                        {drillAssignedFilter.length > 0 && (
                          <span className="text-[9px] bg-brand-50 text-brand-700 rounded-full px-1.5 py-0.5 font-bold">{drillAssignedFilter.length}</span>
                        )}
                      </button>
                      {drillAssignedMenuOpen && drillAssignedMenuPos && createPortal(
                        <>
                          <div className="fixed inset-0 z-[60]" onClick={() => setDrillAssignedMenuOpen(false)} />
                          <div
                            className="fixed z-[70] w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1.5 max-h-56 overflow-y-auto"
                            style={{ top: drillAssignedMenuPos.top, left: drillAssignedMenuPos.left }}
                          >
                            {drillAssignedOptions.length === 0 ? (
                              <p className="px-3 py-2 text-xs text-slate-400 italic font-normal">No data yet</p>
                            ) : (
                              drillAssignedOptions.map(opt => (
                                <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-xs font-normal text-slate-700 hover:bg-slate-50 cursor-pointer">
                                  <input type="checkbox" checked={drillAssignedFilter.includes(opt)} onChange={() => toggleDrillFilter(drillAssignedFilter, opt, setDrillAssignedFilter)} />
                                  {opt}
                                </label>
                              ))
                            )}
                          </div>
                        </>,
                        document.body
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-2.5 whitespace-nowrap">Date</th>
                  <th className="px-4 py-2.5 whitespace-nowrap">Feedback</th>
                  <th className="px-4 py-2.5 whitespace-nowrap">Next Call Date</th>
                  <th className="px-4 py-2.5">
                    <div className="relative">
                      <button
                        ref={drillCampaignBtnRef}
                        onClick={() => openPositionedMenu(drillCampaignBtnRef, setDrillCampaignMenuPos, setDrillCampaignMenuOpen, "right", 224)}
                        className="flex items-center gap-1.5 hover:text-brand-700 whitespace-nowrap"
                      >
                        Campaign
                        <ChevronDown className="h-3 w-3" />
                        {drillCampaignFilter.length > 0 && (
                          <span className="text-[9px] bg-brand-50 text-brand-700 rounded-full px-1.5 py-0.5 font-bold">{drillCampaignFilter.length}</span>
                        )}
                      </button>
                      {drillCampaignMenuOpen && drillCampaignMenuPos && createPortal(
                        <>
                          <div className="fixed inset-0 z-[60]" onClick={() => setDrillCampaignMenuOpen(false)} />
                          <div
                            className="fixed z-[70] w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1.5 max-h-56 overflow-y-auto"
                            style={{ top: drillCampaignMenuPos.top, left: drillCampaignMenuPos.left }}
                          >
                          {drillCampaignOptions.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-slate-400 italic font-normal">No data yet</p>
                          ) : (
                            drillCampaignOptions.map(opt => (
                              <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-xs font-normal text-slate-700 hover:bg-slate-50 cursor-pointer">
                                <input type="checkbox" checked={drillCampaignFilter.includes(opt)} onChange={() => toggleDrillFilter(drillCampaignFilter, opt, setDrillCampaignFilter)} />
                                {opt}
                              </label>
                            ))
                          )}
                          </div>
                        </>,
                        document.body
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {drillPageLeads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400 font-semibold italic">
                      No leads in this category for the selected date range.
                    </td>
                  </tr>
                ) : (
                  drillPageLeads.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 align-top overflow-hidden">
                        <button
                          onClick={() => setQuickViewLead(l)}
                          className="font-bold text-[#0B1E6E] hover:underline text-left truncate block max-w-full"
                          title={l.name}
                        >
                          {l.name}
                        </button>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">{l.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 align-top truncate" title={l.email || "—"}>{l.email || "—"}</td>
                      <td className="px-4 py-3 align-top">
                        <select
                          value={l.status}
                          onChange={(e) => handleDrillStatusChange(l.id, e.target.value as LeadStatus)}
                          className="w-full max-w-[110px] bg-slate-50 border border-slate-200 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-slate-700 focus:outline-none cursor-pointer"
                        >
                          {!STATUS_OPTIONS.includes(l.status) && <option value={l.status}>{l.status}</option>}
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium align-top truncate" title={l.assignedAgent || "Unassigned"}>{l.assignedAgent || "Unassigned"}</td>
                      <td className="px-4 py-3 text-slate-500 align-top truncate">{formatDateTime(l.createdAtStr)}</td>
                      <td className="px-4 py-3 text-slate-600 truncate align-top" title={latestLogMessage(l)}>{latestLogMessage(l)}</td>
                      <td className="px-4 py-3 text-slate-500 align-top truncate">{nextCallDateFor(l.id)}</td>
                      <td className="px-4 py-3 text-slate-700 font-medium align-top truncate" title={l.campaign || l.source || "—"}>{l.campaign || l.source || "—"}</td>
                      <td className="px-4 py-3 align-top text-right">
                        <a
                          href={`https://wa.me/${l.phone.replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center text-slate-900 hover:text-emerald-600 transition-colors"
                          title="WhatsApp"
                        >
                          <WhatsAppIcon className="h-6 w-6" />
                        </a>
                        <a
                          href={`tel:${l.phone}`}
                          className="inline-flex items-center justify-center text-slate-900 hover:text-brand-700 transition-colors ml-2.5"
                          title="Call"
                        >
                          <CallIcon className="h-4 w-4" />
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 flex flex-wrap justify-between items-center gap-3 border-t border-slate-100 text-[11px] text-slate-500 font-semibold">
            <span>{drillLeads.length} Row{drillLeads.length === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                Rows per page
                <select
                  value={drillRowsPerPage}
                  onChange={(e) => { setDrillRowsPerPage(Number(e.target.value)); setDrillPage(1); }}
                  className="bg-slate-50 border border-slate-200 rounded px-1.5 py-1 font-bold text-slate-700 focus:outline-none"
                >
                  {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </span>
              <span>{drillLeads.length === 0 ? 0 : (drillCurrentPage - 1) * drillRowsPerPage + 1}-{Math.min(drillCurrentPage * drillRowsPerPage, drillLeads.length)} of {drillLeads.length}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setDrillPage(p => Math.max(1, p - 1))}
                  disabled={drillCurrentPage <= 1}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ‹
                </button>
                <button
                  onClick={() => setDrillPage(p => Math.min(drillTotalPages, p + 1))}
                  disabled={drillCurrentPage >= drillTotalPages}
                  className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ›
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Follow ups — leads currently sitting in the Follow-ups status */}
      <PendingLeadsTable title="Pending Follow ups" rows={followUpRows} onViewLead={openQuickView} />

      {/* Pending Call Backs — the operational followup_calls callback queue */}
      <PendingLeadsTable title="Pending Call Backs" rows={callBackRows} onViewLead={openQuickView} />

      <AddLeadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSubmitManual={handleUploadManualLead}
        onSubmitBulk={handleUploadBulkLeads}
        agentsList={agentsList}
        propertiesList={propertiesList}
      />

      {/* Lead quick-view — opened by clicking a lead's name in the drill-down
          table above. Scoped to this page only (the shared LeadDetailDrawer
          used elsewhere is untouched); portaled to <body> since this page's
          root wrapper carries animate-fade-in, which would otherwise become
          the containing block for a fixed-position overlay. */}
      {quickViewLead && createPortal(
        <div className="fixed inset-0 z-50">
          {/* Invisible click-outside-to-close catcher — no dark backdrop, the rest of the page stays fully visible */}
          <div className="fixed inset-0" onClick={() => setQuickViewLead(null)} />

          <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-slide-in">
            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-start justify-between">
                <p className="text-base font-extrabold text-slate-900">{quickViewLead.name}</p>
                <button onClick={() => setQuickViewLead(null)} className="text-slate-400 hover:text-slate-700 -mt-1">
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <a href={`tel:${quickViewLead.phone}`} className="hover:text-brand-700">{quickViewLead.phone}</a>
                  <button onClick={() => copyToClipboard("phone", quickViewLead.phone)} className="text-slate-350 hover:text-brand-700" title="Copy phone">
                    {copiedField === "phone" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
                {quickViewLead.email && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <a href={`mailto:${quickViewLead.email}`} className="hover:text-brand-700 truncate">{quickViewLead.email}</a>
                    <button onClick={() => copyToClipboard("email", quickViewLead.email!)} className="text-slate-350 hover:text-brand-700 shrink-0" title="Copy email">
                      {copiedField === "email" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Status + meta */}
            <div className="px-5 py-3 border-b border-slate-100 shrink-0 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Current Status :</span>
                <select
                  value={quickViewLead.status}
                  onChange={(e) => {
                    const nextStatus = e.target.value as LeadStatus;
                    handleDrillStatusChange(quickViewLead.id, nextStatus);
                    setQuickViewLead({ ...quickViewLead, status: nextStatus });
                  }}
                  className={`border rounded-lg px-2 py-0.5 text-[11px] font-bold focus:outline-none cursor-pointer ${statusBadgeClasses(quickViewLead.status)}`}
                >
                  {!STATUS_OPTIONS.includes(quickViewLead.status) && <option value={quickViewLead.status}>{quickViewLead.status}</option>}
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
                <span>Last Updated : {lastActivityTime(quickViewLead)}</span>
                <span>Source : {quickViewLead.source || quickViewLead.campaign || "Direct / Manual Entry"}</span>
              </div>
            </div>

            {/* Assigned / Property / Reassigned / Captured */}
            <div className="px-5 py-3 border-b border-slate-100 shrink-0 grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
              <div>
                <span className="text-slate-400 font-bold text-[10px] block mb-0.5">Assigned To :</span>
                <span className="flex items-center gap-1 text-slate-800 font-semibold">
                  <User className="h-3 w-3 text-slate-400" /> {quickViewLead.assignedAgent || "Unassigned"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-bold text-[10px] block mb-0.5">Property :</span>
                <span className="text-slate-800 font-semibold">{quickViewLead.property || "Not set"}</span>
              </div>
              <div>
                <span className="text-slate-400 font-bold text-[10px] block mb-0.5">Reassigned To :</span>
                <span className="flex items-center gap-1 text-slate-800 font-semibold">
                  {quickViewLead.previousAgent && <User className="h-3 w-3 text-slate-400" />} {quickViewLead.previousAgent || "—"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-bold text-[10px] block mb-0.5">Captured at :</span>
                <span className="text-slate-800 font-semibold">{formatDateTime(quickViewLead.createdAtStr)}</span>
              </div>
            </div>

            {/* Activity History */}
            <div className="px-5 py-3 flex-1 min-h-0 flex flex-col">
              <span className="text-[11px] font-bold text-slate-500 block mb-2 shrink-0">Activity History :</span>
              <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
                {quickViewLead.logs.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">No activity recorded yet.</p>
                ) : (
                  [...quickViewLead.logs]
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                    .map((log, idx) => (
                      <div key={idx} className="bg-[#EEF2FF] border border-[#DCE3FA] rounded-xl px-3 py-2">
                        <p className="text-[10px] font-bold text-slate-500">{formatDateTime(log.timestamp)}</p>
                        <p className="text-[11px] text-slate-700 leading-snug mt-1">{log.message}</p>
                        <p className="text-[9px] text-slate-400 font-semibold mt-1 text-right">by {log.user}</p>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
