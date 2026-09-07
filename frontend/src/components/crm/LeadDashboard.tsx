"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp, Lead, LeadStatus } from "@/context/AppContext";
import { Sliders, Sparkles, Plus, Check, ChevronDown, Search, Calendar, X, Minus } from "lucide-react";
import { DB_CODE_TO_FRONTEND_STATUS } from "@/lib/leadStatusMapping";
import { WhatsAppIcon, CallIcon } from "@/components/icons/ContactIcons";
import TopMetricsCards from "./TopMetricsCards";
import LeadFilterBar from "./LeadFilterBar";
import LeadTable from "./LeadTable";
import AddLeadModal from "./AddLeadModal";
import LeadDetailDrawer from "./LeadDetailDrawer";

const STATUS_OPTIONS = Array.from(new Set(Object.values(DB_CODE_TO_FRONTEND_STATUS)));

// The admin leads table's togglable columns (beyond the always-shown Lead
// Name/Email/Assigned To) — driven by the Filter panel's Settings modal.
// "Ad Set Name" and "Property Match" have no real backing field on Lead yet
// (no ad-set-level ingestion, no property-match scoring anywhere in the app),
// so their cells honestly render "—" for every row rather than inventing data.
type AdminColumnKey =
  | "date" | "property" | "reassignedTo" | "source" | "leadScore"
  | "status" | "nextCallDate" | "actions" | "adSetName" | "campaign"
  | "notes" | "propertyMatch";

const ADMIN_COLUMNS: { key: AdminColumnKey; label: string; width: number }[] = [
  { key: "date", label: "Date", width: 140 },
  { key: "property", label: "Property", width: 150 },
  { key: "reassignedTo", label: "Reassigned To", width: 140 },
  { key: "source", label: "Source", width: 130 },
  { key: "leadScore", label: "Lead Score", width: 100 },
  { key: "status", label: "Status", width: 130 },
  { key: "nextCallDate", label: "Next Call Date", width: 150 },
  { key: "actions", label: "Actions", width: 100 },
  { key: "adSetName", label: "Ad Set Name", width: 150 },
  { key: "campaign", label: "Campaign", width: 150 },
  { key: "notes", label: "Notes", width: 200 },
  { key: "propertyMatch", label: "Property Match", width: 140 }
];

const ADMIN_DEFAULT_VISIBLE_COLUMNS: Record<AdminColumnKey, boolean> = {
  date: true, property: false, reassignedTo: false, source: false, leadScore: false,
  status: true, nextCallDate: true, actions: false, adSetName: false, campaign: true,
  notes: true, propertyMatch: false
};

export default function LeadDashboard() {
  const {
    leads,
    addLead,
    updateLeadStatus,
    activeRole,
    deleteLead,
    editLead,
    currentUser,
    properties,
    calendarEvents,
    users,
    followupCalls
  } = useApp();

  const router = useRouter();
  const searchParams = useSearchParams();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<LeadStatus[]>([]);
  const [activeMetricFilter, setActiveMetricFilter] = useState("all");

  // Drawer / Modals State
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Deep-link support: notifications route here with ?openLead=<id> to jump straight to a lead
  useEffect(() => {
    const openLeadId = searchParams.get("openLead");
    if (openLeadId) {
      const found = leads.find(l => l.id === openLeadId);
      if (found) {
        setSelectedLead(found);
      }
      router.replace("/dashboard/crm");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Scoping check: is the current user a Sales Member?
  const isSalesMember = currentUser?.role_type === "Member" && currentUser?.role !== "ADMIN";
  const isAdmin = currentUser?.role === "ADMIN";

  // Data scoping based on role
  const scopedLeads = leads.filter(l => {
    if (isSalesMember) {
      return l.assignedAgent.toLowerCase() === currentUser?.name.toLowerCase();
    }
    return true;
  });

  // Unique status list gathered from the requested list of 20 statuses
  const availableStatuses: LeadStatus[] = [
    "Unassigned", "RNR", "Call Back", "Switch off", "Booked", "New Leads",
    "Assigned", "Connected", "Interested", "Follow-ups", "Visit Schedule",
    "Not Interested", "EOI Customers", "Invalid", "Low Budget",
    "Meeting Scheduled", "Meeting Done", "Site Visit", "Completed",
    "In Negotiation", "Dead"
  ];

  // Sub-account breakdown, grouped from real leads by ad-source keyword —
  // populates for real once the Meta/Google Ads integration starts writing
  // leads with source="Meta Ads"/"Google Ads". Empty until then, honestly.
  const groupBySourceKeyword = (pattern: RegExp) => {
    const counts = new Map<string, number>();
    scopedLeads.forEach(l => {
      const haystack = `${l.source || ""} ${l.campaign || ""}`;
      if (!pattern.test(haystack)) return;
      const key = l.campaign || l.source || "Unlabeled";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  };

  const metaSubAccounts = groupBySourceKeyword(/meta|facebook|instagram/i);
  const googleSubAccounts = groupBySourceKeyword(/google/i);

  const metaLeadsSum = metaSubAccounts.reduce((sum, a) => sum + a.count, 0);
  const googleLeadsSum = googleSubAccounts.reduce((sum, a) => sum + a.count, 0);
  const totalLeadsSum = scopedLeads.length;

  const isSameLocalDay = (isoStr: string | undefined, ref: Date) => {
    if (!isoStr) return false;
    const d = new Date(isoStr);
    return d.toDateString() === ref.toDateString();
  };

  const today = new Date();
  const todayStr = today.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const leadsToday = scopedLeads.filter(l => isSameLocalDay(l.createdAtStr, today)).length;
  const visitsToday = scopedLeads.filter(l =>
    ["Visit Schedule", "Site Visit", "Site Visit Scheduled", "Meeting Scheduled"].includes(l.status)
  ).length;
  // Site-visit calendar events falling on this week's Saturday/Sunday.
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const weekendVisits = calendarEvents.filter(e => {
    if (e.type !== "SITE_VISIT") return false;
    const d = new Date(e.date);
    const isWeekendDay = d.getDay() === 0 || d.getDay() === 6;
    return isWeekendDay && d >= startOfWeek && d <= endOfWeek;
  }).length;
  const monthBookings = scopedLeads.filter(l => {
    if (!["Booked", "Booking Done", "Booking Approved"].includes(l.status)) return false;
    if (!l.createdAtStr) return false;
    const d = new Date(l.createdAtStr);
    return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  }).length;

  // Dynamic filter logic
  const filteredLeads = scopedLeads.filter(l => {
    const matchesSearch =
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.phone.includes(searchQuery) ||
      (l.email && l.email.toLowerCase().includes(searchQuery.toLowerCase()));

    // Match any of the selected statuses in multi-select pool (if empty, matches all)
    const matchesStatus =
      selectedStatuses.length === 0 ||
      selectedStatuses.includes(l.status) ||
      (selectedStatuses.includes("New Leads") && l.status === "New Lead"); // mapping fallback

    // Match activeMetricFilter — real dates/statuses only (this used to match
    // on leftover literal mock-date substrings and on a lead's ID containing
    // "2"/"4" as a fake stand-in for "weekend").
    let matchesMetric = true;
    if (activeMetricFilter === "today") {
      matchesMetric = isSameLocalDay(l.createdAtStr, today);
    } else if (activeMetricFilter === "visits") {
      matchesMetric = l.status === "Visit Schedule" || l.status === "Site Visit" || l.status === "Site Visit Scheduled" || l.status === "Meeting Scheduled";
    } else if (activeMetricFilter === "weekend") {
      const isVisitStatus = ["Visit Schedule", "Site Visit Scheduled", "Meeting Scheduled", "Site Visit"].includes(l.status);
      const d = l.createdAtStr ? new Date(l.createdAtStr) : null;
      const isWeekendDay = !!d && !isNaN(d.getTime()) && (d.getDay() === 0 || d.getDay() === 6);
      matchesMetric = isVisitStatus && isWeekendDay;
    } else if (activeMetricFilter === "bookings") {
      matchesMetric = l.status === "Booked" || l.status === "Booking Done" || l.status === "Booking Approved";
    } else if (activeMetricFilter === "meta") {
      matchesMetric = /meta|facebook|instagram/i.test(`${l.campaign || ""} ${l.source || ""}`);
    } else if (activeMetricFilter === "google") {
      matchesMetric = /google/i.test(`${l.campaign || ""} ${l.source || ""}`);
    }

    return matchesSearch && matchesStatus && matchesMetric;
  });

  // Extract properties lists for Bulk Upload assignments
  const propertiesList = properties.map(p => p.name);
  // Real sales roster (agents + managers/TLs), not a hardcoded seed-data
  // snapshot — matches the same department === "SALES" scoping already used
  // for the Properties team-member picker.
  const agentsList = users
    .filter(u => u.department === "SALES" && u.status !== "INACTIVE")
    .map(u => u.name);

  // Callback Handlers
  const handleViewLeadDetails = (lead: Lead) => {
    setSelectedLead(lead);
  };

  const handleUpdateLeadStatus = (leadId: string, status: LeadStatus) => {
    // Booking a lead auto-generates a real invoice using this deal value as
    // the base amount (see AppContext's updateLeadStatus) — a real value is
    // required here, not a hardcoded ₹5,00,000 regardless of the actual deal.
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

    // Update local drawer state if active
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead(prev => prev ? { ...prev, status } : null);
    }

    setSuccessMsg(`Status updated to: ${status}`);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  const handleAddManualLead = (data: {
    name: string;
    phone: string;
    email: string;
    agent: string;
    source: string;
    property: string;
    note: string;
  }) => {
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
      setIsAddOpen(false);
      setSuccessMsg(`Successfully ingested lead for: ${data.name}`);
      setTimeout(() => setSuccessMsg(""), 4000);
    } else {
      alert(`Ingestion failed: ${res.error}`);
    }
  };

  const handleAddBulkLeads = (data: {
    assignmentMode: "project" | "agent";
    target: string;
    fileName: string;
  }) => {
    // This used to inject 3 hardcoded fake leads (Rohit Sharma, Virat Kohli,
    // Jasprit Bumrah) into the real database on every click, regardless of
    // the file's actual contents, and then claim the import succeeded.
    // Bulk CSV/XLSX parsing isn't wired to a real backend endpoint yet.
    alert("Bulk import isn't wired up to a real backend yet — please use Manual Ingestion Entry for now.");
    setIsAddOpen(false);
  };

  const handleDeleteLead = (leadId: string) => {
    if (confirm("Are you sure you want to delete this lead from the partition database?")) {
      deleteLead(leadId);
      setSelectedLead(null);
      setSuccessMsg("Lead successfully deleted.");
      setTimeout(() => setSuccessMsg(""), 3000);
    }
  };

  const handleMetricFilterChange = (filter: string) => {
    setActiveMetricFilter(filter);
  };

  // ===========================================================================
  // ADMIN-ONLY Leads console — everything below this point (state, helpers and
  // JSX) is scoped to currentUser.role === "ADMIN" and renders instead of the
  // member/manager view further down. Kept in the same component so it shares
  // scopedLeads/handleUpdateLeadStatus/AddLeadModal wiring/etc. rather than
  // duplicating them in a second file.
  // ===========================================================================

  const [adminTab, setAdminTab] = useState<"leads" | "analytics">("leads");
  const [adminDateRange, setAdminDateRange] = useState<"today" | "yesterday" | "week" | "month" | "all" | "custom">("today");
  const [adminCustomRange, setAdminCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [adminMetric, setAdminMetric] = useState<string | null>(null);
  const [adminSearch, setAdminSearch] = useState("");
  const [adminSearchOpen, setAdminSearchOpen] = useState(false);
  const [adminStatusFilter, setAdminStatusFilter] = useState<string[]>([]);
  const [adminStatusMenuOpen, setAdminStatusMenuOpen] = useState(false);
  const [adminAssignedFilter, setAdminAssignedFilter] = useState<string[]>([]);
  const [adminAssignedMenuOpen, setAdminAssignedMenuOpen] = useState(false);
  const [adminCampaignFilter, setAdminCampaignFilter] = useState<string[]>([]);
  const [adminCampaignMenuOpen, setAdminCampaignMenuOpen] = useState(false);
  const [adminPage, setAdminPage] = useState(1);
  const [adminRowsPerPage, setAdminRowsPerPage] = useState(100);
  const [dateRangeMenuOpen, setDateRangeMenuOpen] = useState(false);
  const [dateRangeMenuPos, setDateRangeMenuPos] = useState<{ top: number; left: number } | null>(null);
  const dateRangeBtnRef = useRef<HTMLButtonElement>(null);
  const [adminStatusMenuPos, setAdminStatusMenuPos] = useState<{ top: number; left: number } | null>(null);
  const adminStatusBtnRef = useRef<HTMLButtonElement>(null);
  const [adminAssignedMenuPos, setAdminAssignedMenuPos] = useState<{ top: number; left: number } | null>(null);
  const adminAssignedBtnRef = useRef<HTMLButtonElement>(null);
  const [adminCampaignMenuPos, setAdminCampaignMenuPos] = useState<{ top: number; left: number } | null>(null);
  const adminCampaignBtnRef = useRef<HTMLButtonElement>(null);

  // Top "Campaigns" quick-filter (next to Upload Leads) — a grouped dropdown
  // splitting real campaigns by ad platform, distinct from the table column
  // header's flat Campaign filter dropdown above.
  const [adminCampaignsQuickMenuOpen, setAdminCampaignsQuickMenuOpen] = useState(false);
  const [adminCampaignsQuickMenuPos, setAdminCampaignsQuickMenuPos] = useState<{ top: number; left: number } | null>(null);
  const adminCampaignsQuickBtnRef = useRef<HTMLButtonElement>(null);
  const [adminCampaignsMetaOpen, setAdminCampaignsMetaOpen] = useState(true);
  const [adminCampaignsGoogleOpen, setAdminCampaignsGoogleOpen] = useState(true);

  // Calendar badge → a real custom date-range picker (Start/End), an
  // alternative to the preset Today/Yesterday/Week/Month/All buckets above.
  const [calendarPickerOpen, setCalendarPickerOpen] = useState(false);
  const [calendarMenuPos, setCalendarMenuPos] = useState<{ top: number; left: number } | null>(null);
  const calendarBtnRef = useRef<HTMLButtonElement>(null);
  const [customRangeStartDraft, setCustomRangeStartDraft] = useState("");
  const [customRangeEndDraft, setCustomRangeEndDraft] = useState("");

  // Filter button → Settings panel for which table columns are shown — a
  // full-height right-docked drawer (same pattern as the lead quick-view
  // drawer elsewhere in this app), not a small anchored flyout.
  const [isColumnsSettingsOpen, setIsColumnsSettingsOpen] = useState(false);

  const [adminVisibleColumns, setAdminVisibleColumns] = useState<Record<AdminColumnKey, boolean>>(ADMIN_DEFAULT_VISIBLE_COLUMNS);

  const toggleAdminColumn = (key: AdminColumnKey) => {
    setAdminVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allAdminColumnsVisible = ADMIN_COLUMNS.every(c => adminVisibleColumns[c.key]);
  const toggleSelectAllAdminColumns = () => {
    const next = !allAdminColumnsVisible;
    setAdminVisibleColumns(
      ADMIN_COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: next }), {} as Record<AdminColumnKey, boolean>)
    );
  };

  const adminVisibleColumnList = ADMIN_COLUMNS.filter(c => adminVisibleColumns[c.key]);

  const DATE_RANGE_OPTIONS: { value: typeof adminDateRange; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "week", label: "This Week" },
    { value: "month", label: "This Month" },
    { value: "all", label: "All Time" }
  ];

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

  const adminDateInRange = (dateStr: string | undefined, range: typeof adminDateRange, refNow: Date): boolean => {
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
    if (range === "custom") {
      if (!adminCustomRange) return false;
      const start = new Date(adminCustomRange.start);
      const end = new Date(adminCustomRange.end);
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    }
    return d.getMonth() === refNow.getMonth() && d.getFullYear() === refNow.getFullYear();
  };

  const adminSortedLogs = (l: Lead) => [...(l.logs || [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const adminLatestLogMessage = (l: Lead): string => {
    const logs = adminSortedLogs(l);
    return logs.length > 0 ? logs[0].message : "No feedback yet";
  };
  const adminFormatDateTime = (iso: string | undefined): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  const adminNextCallDateFor = (leadId: string): string => {
    const upcoming = followupCalls
      .filter(c => c.leadId === leadId && c.status === "Upcoming")
      .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());
    return upcoming.length > 0 ? `${upcoming[0].date} ${upcoming[0].time}` : "—";
  };

  // The Campaigns quick-filter (declared further below, alongside the
  // dropdown's own state) narrows these same 7 stat cards down to whichever
  // campaign(s) are selected — declared as a var here since adminCampaignFilter
  // itself is defined later in this file alongside its dropdown state.
  const adminCampaignScopedLeads = adminCampaignFilter.length === 0
    ? scopedLeads
    : scopedLeads.filter(l => !!l.campaign && adminCampaignFilter.includes(l.campaign));

  const adminRangeLeads = adminCampaignScopedLeads.filter(l => adminDateInRange(l.createdAtStr, adminDateRange, today));

  const adminStatCards: { key: string; label: string; value: number; color: string }[] = [
    { key: "total", label: "Total Leads", value: adminRangeLeads.length, color: "text-slate-900" },
    { key: "new", label: "New Leads", value: adminRangeLeads.filter(l => l.status === "New Lead").length, color: "text-[#0084FF]" },
    { key: "rnr", label: "RNR", value: adminCampaignScopedLeads.filter(l => l.status === "RNR").length, color: "text-[#FF0000]" },
    { key: "callbacks", label: "Call Backs", value: adminCampaignScopedLeads.filter(l => l.status === "Call Back").length, color: "text-[#FF8C00]" },
    { key: "followups", label: "Follow Ups", value: adminCampaignScopedLeads.filter(l => l.status === "Follow-ups").length, color: "text-[#0084FF]" },
    { key: "sitevisit_sched", label: "Site Visit Scheduled", value: adminCampaignScopedLeads.filter(l => l.status === "Visit Schedule").length, color: "text-[#FF0000]" },
    { key: "sitevisit_done", label: "Site Visit Done", value: adminCampaignScopedLeads.filter(l => l.status === "Site Visit").length, color: "text-[#015814]" }
  ];

  const adminMetricPredicate: Record<string, (l: Lead) => boolean> = {
    total: () => true,
    new: (l) => l.status === "New Lead",
    rnr: (l) => l.status === "RNR",
    callbacks: (l) => l.status === "Call Back",
    followups: (l) => l.status === "Follow-ups",
    sitevisit_sched: (l) => l.status === "Visit Schedule",
    sitevisit_done: (l) => l.status === "Site Visit"
  };

  const adminCampaignsList = Array.from(new Set(scopedLeads.map(l => l.campaign).filter(Boolean))) as string[];
  const adminAssignedOptions = Array.from(new Set(scopedLeads.map(l => l.assignedAgent).filter(Boolean)));

  // Same ad-source keyword classification used by the Meta/Google sub-account
  // breakdown above (source="Meta Ads"/"Google Ads") — reused here to split
  // the real campaign list by platform for the grouped Campaigns dropdown.
  const classifyCampaignPlatform = (campaign: string): "Meta" | "Google" | "Other" => {
    const lead = scopedLeads.find(l => l.campaign === campaign);
    const haystack = `${lead?.source || ""} ${campaign}`;
    if (/meta|facebook|instagram/i.test(haystack)) return "Meta";
    if (/google/i.test(haystack)) return "Google";
    return "Other";
  };
  const adminMetaCampaigns = adminCampaignsList.filter(c => classifyCampaignPlatform(c) === "Meta");
  const adminGoogleCampaigns = adminCampaignsList.filter(c => classifyCampaignPlatform(c) === "Google");
  const adminOtherCampaigns = adminCampaignsList.filter(c => classifyCampaignPlatform(c) === "Other");

  const toggleAdminCampaignFilter = (value: string) => {
    setAdminPage(1);
    setAdminCampaignFilter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };

  const adminFilteredLeads = (adminMetric ? adminRangeLeads.filter(adminMetricPredicate[adminMetric]) : adminRangeLeads).filter(l => {
    const matchesSearch = !adminSearch || l.name.toLowerCase().includes(adminSearch.toLowerCase()) || l.phone.includes(adminSearch);
    const matchesStatus = adminStatusFilter.length === 0 || adminStatusFilter.includes(l.status);
    const matchesAssigned = adminAssignedFilter.length === 0 || adminAssignedFilter.includes(l.assignedAgent);
    const matchesCampaign = adminCampaignFilter.length === 0 || (!!l.campaign && adminCampaignFilter.includes(l.campaign));
    return matchesSearch && matchesStatus && matchesAssigned && matchesCampaign;
  });

  const adminTotalPages = Math.max(1, Math.ceil(adminFilteredLeads.length / adminRowsPerPage));
  const adminCurrentPage = Math.min(adminPage, adminTotalPages);

  // All rows render continuously in the scroll container (not just the
  // current page's slice) so scrolling moves smoothly across page
  // boundaries instead of stopping dead at the end of each page. Each
  // page's first row is ref'd; scrolling past one updates adminPage (so the
  // "a-b of c" label and Rows-per-page selector track where you actually
  // are), and clicking a pagination arrow scrolls that page's first row to
  // the top of the container — the two stay synced in both directions.
  const adminScrollRef = useRef<HTMLDivElement>(null);
  const adminPageRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const adminProgrammaticScroll = useRef(false);

  const handleAdminTableScroll = () => {
    if (adminProgrammaticScroll.current) return;
    const container = adminScrollRef.current;
    if (!container) return;
    const scrollTop = container.scrollTop;
    let current = 1;
    for (let i = 0; i < adminPageRowRefs.current.length; i++) {
      const row = adminPageRowRefs.current[i];
      if (row && row.offsetTop - container.offsetTop <= scrollTop + 4) {
        current = i + 1;
      }
    }
    setAdminPage(prev => (prev !== current ? current : prev));
  };

  const goToAdminPage = (page: number) => {
    const clamped = Math.max(1, Math.min(adminTotalPages, page));
    setAdminPage(clamped);
    const row = adminPageRowRefs.current[clamped - 1];
    const container = adminScrollRef.current;
    if (!row || !container) return;
    adminProgrammaticScroll.current = true;
    container.scrollTop = clamped === 1 ? 0 : row.offsetTop - container.offsetTop;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { adminProgrammaticScroll.current = false; });
    });
  };

  // Real per-agent lead-quality breakdown for the Leads Analytics tab —
  // same categorization the stat cards above use, just grouped per agent.
  const adminAgentBreakdown = agentsList.map(agentName => {
    const agentLeads = scopedLeads.filter(l => l.assignedAgent === agentName);
    const qualified = agentLeads.filter(l => !["Unassigned", "RNR", "Switch off", "Not Interested", "Invalid", "Low Budget", "Dead"].includes(l.status)).length;
    const siteVisits = agentLeads.filter(l => ["Site Visit", "Meeting Done", "Visit Schedule"].includes(l.status)).length;
    return {
      agentName,
      total: agentLeads.length,
      qualified,
      unqualified: agentLeads.length - qualified,
      siteVisits
    };
  }).filter(row => row.total > 0);

  if (isAdmin) {
    return (
      <div className="space-y-4 pb-12 animate-fade-in">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div className="bg-slate-200/60 p-1 rounded-xl flex items-center gap-1">
            <button
              onClick={() => setAdminTab("leads")}
              className={`rounded-lg px-4 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                adminTab === "leads" ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Leads
            </button>
            <button
              onClick={() => setAdminTab("analytics")}
              className={`rounded-lg px-4 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                adminTab === "analytics" ? "bg-white shadow-sm text-slate-800" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Leads Analytics
            </button>
          </div>

          {adminTab === "leads" && (
            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  ref={adminCampaignsQuickBtnRef}
                  onClick={() => openPositionedMenu(adminCampaignsQuickBtnRef, setAdminCampaignsQuickMenuPos, setAdminCampaignsQuickMenuOpen, "left", 260)}
                  className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-xs text-slate-700 font-bold focus:outline-none cursor-pointer"
                >
                  {adminCampaignFilter.length === 0
                    ? "Campaigns"
                    : adminCampaignFilter.length === 1
                    ? adminCampaignFilter[0]
                    : `${adminCampaignFilter.length} Campaigns`}
                  <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${adminCampaignsQuickMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {adminCampaignsQuickMenuOpen && adminCampaignsQuickMenuPos && createPortal(
                  <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setAdminCampaignsQuickMenuOpen(false)} />
                    <div
                      className="fixed z-[70] w-64 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 max-h-80 overflow-y-auto"
                      style={{ top: adminCampaignsQuickMenuPos.top, left: adminCampaignsQuickMenuPos.left }}
                    >
                      {adminCampaignFilter.length > 0 && (
                        <button
                          onClick={() => { setAdminPage(1); setAdminCampaignFilter([]); }}
                          className="w-full text-left px-3 py-1.5 text-[11px] font-bold text-brand-700 hover:bg-slate-50"
                        >
                          Clear selection
                        </button>
                      )}

                      {/* Meta group */}
                      <button
                        onClick={() => setAdminCampaignsMetaOpen(o => !o)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
                      >
                        <span className="flex items-center gap-2">
                          <img src="https://img.icons8.com/?size=100&id=wA5rN96FVDtq&format=png&color=000000" alt="Meta" className="h-4 w-4" />
                          Meta
                        </span>
                        <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${adminCampaignsMetaOpen ? "rotate-180" : ""}`} />
                      </button>
                      {adminCampaignsMetaOpen && (
                        adminMetaCampaigns.length === 0 ? (
                          <p className="pl-9 pr-3 py-1.5 text-[11px] text-slate-400 italic font-normal">No Meta campaigns yet</p>
                        ) : (
                          adminMetaCampaigns.map(c => (
                            <label key={c} className="flex items-center gap-2 pl-9 pr-3 py-1.5 text-xs font-normal text-slate-700 hover:bg-slate-50 cursor-pointer">
                              <input type="checkbox" checked={adminCampaignFilter.includes(c)} onChange={() => toggleAdminCampaignFilter(c)} />
                              <span className="truncate">{c}</span>
                            </label>
                          ))
                        )
                      )}

                      <div className="border-t border-slate-100 my-1" />

                      {/* Google group */}
                      <button
                        onClick={() => setAdminCampaignsGoogleOpen(o => !o)}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
                      >
                        <span className="flex items-center gap-2">
                          <img src="https://img.icons8.com/?size=100&id=4hR4Ih04Je2t&format=png&color=000000" alt="Google" className="h-4 w-4" />
                          Google
                        </span>
                        <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${adminCampaignsGoogleOpen ? "rotate-180" : ""}`} />
                      </button>
                      {adminCampaignsGoogleOpen && (
                        adminGoogleCampaigns.length === 0 ? (
                          <p className="pl-9 pr-3 py-1.5 text-[11px] text-slate-400 italic font-normal">No Google campaigns yet</p>
                        ) : (
                          adminGoogleCampaigns.map(c => (
                            <label key={c} className="flex items-center gap-2 pl-9 pr-3 py-1.5 text-xs font-normal text-slate-700 hover:bg-slate-50 cursor-pointer">
                              <input type="checkbox" checked={adminCampaignFilter.includes(c)} onChange={() => toggleAdminCampaignFilter(c)} />
                              <span className="truncate">{c}</span>
                            </label>
                          ))
                        )
                      )}

                      {adminOtherCampaigns.length > 0 && (
                        <>
                          <div className="border-t border-slate-100 my-1" />
                          <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Other</p>
                          {adminOtherCampaigns.map(c => (
                            <label key={c} className="flex items-center gap-2 px-3 py-1.5 text-xs font-normal text-slate-700 hover:bg-slate-50 cursor-pointer">
                              <input type="checkbox" checked={adminCampaignFilter.includes(c)} onChange={() => toggleAdminCampaignFilter(c)} />
                              <span className="truncate">{c}</span>
                            </label>
                          ))}
                        </>
                      )}
                    </div>
                  </>,
                  document.body
                )}
              </div>
              <button
                onClick={() => setIsAddOpen(true)}
                className="inline-flex items-center gap-2 bg-[#0B1E6E] hover:bg-[#081650] text-white px-4 py-2.5 rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Upload Leads
              </button>
            </div>
          )}
        </div>

        {successMsg && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-100 text-[11px] text-emerald-700 rounded-xl font-bold flex items-center gap-2 animate-fade-in shadow-sm">
            <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {adminTab === "leads" ? (
          <>
            {/* Date Filter & Metrics — one unified card */}
            <div className="bg-slate-100/70 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex justify-between items-center px-4 py-2.5 text-[11px] border-b border-slate-200/60">
                <div className="flex items-center gap-1.5 font-bold text-slate-700">
                  <span className="font-normal text-slate-500">Date Range</span>
                  <div className="relative">
                    <button
                      ref={dateRangeBtnRef}
                      onClick={() => openPositionedMenu(dateRangeBtnRef, setDateRangeMenuPos, setDateRangeMenuOpen, "left", 144)}
                      className="flex items-center gap-1.5 bg-white border border-slate-300/80 rounded-md px-2 py-0.5 font-black text-slate-800 text-[11px] hover:bg-slate-50 transition-colors"
                    >
                      {DATE_RANGE_OPTIONS.find(o => o.value === adminDateRange)?.label ?? "Custom Range"}
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
                              onClick={() => { setAdminDateRange(opt.value); setDateRangeMenuOpen(false); setAdminPage(1); }}
                              className={`w-full text-left px-3 py-1.5 text-xs font-bold transition-colors ${
                                adminDateRange === opt.value ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"
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
                <button
                  type="button"
                  onClick={() => setAdminTab("analytics")}
                  className="text-blue-600 font-extrabold hover:underline"
                >
                  View Detailed Analytics
                </button>
              </div>

              <div className="flex md:grid md:grid-cols-7 bg-white divide-x divide-slate-100 overflow-x-auto min-w-full">
                {adminStatCards.map((s) => {
                  const isActive = adminMetric === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => { setAdminMetric(prev => (prev === s.key ? null : s.key)); setAdminPage(1); }}
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

            {/* Date badge (now a real custom date-range picker) + Filter row */}
            <div className="flex justify-end items-center gap-3">
              <div className="relative">
                <button
                  ref={calendarBtnRef}
                  type="button"
                  onClick={() => {
                    const rect = calendarBtnRef.current?.getBoundingClientRect();
                    if (rect) setCalendarMenuPos({ top: rect.bottom + 6, left: rect.right - 260 });
                    setCustomRangeStartDraft(adminCustomRange?.start || "");
                    setCustomRangeEndDraft(adminCustomRange?.end || "");
                    setCalendarPickerOpen(o => !o);
                  }}
                  className="flex items-center gap-2 border border-slate-200 bg-white rounded-lg px-3 py-1.5 text-xs text-slate-700 font-bold shadow-sm hover:bg-slate-50 transition-all"
                >
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <span>
                    {adminDateRange === "custom" && adminCustomRange
                      ? `${adminCustomRange.start} to ${adminCustomRange.end}`
                      : todayStr}
                  </span>
                </button>
                {calendarPickerOpen && calendarMenuPos && createPortal(
                  <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setCalendarPickerOpen(false)} />
                    <div
                      className="fixed z-[70] w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3"
                      style={{ top: calendarMenuPos.top, left: calendarMenuPos.left }}
                    >
                      <p className="text-[11px] font-bold text-slate-700">Filter leads by date range</p>
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase">Start Date</label>
                        <input
                          type="date"
                          value={customRangeStartDraft}
                          onChange={(e) => setCustomRangeStartDraft(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0B1E6E]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-[9px] font-bold text-slate-400 uppercase">End Date</label>
                        <input
                          type="date"
                          value={customRangeEndDraft}
                          onChange={(e) => setCustomRangeEndDraft(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#0B1E6E]"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAdminCustomRange(null);
                            setAdminDateRange("today");
                            setCalendarPickerOpen(false);
                            setAdminPage(1);
                          }}
                          className="flex-1 bg-slate-100 text-slate-600 font-bold text-[11px] py-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!customRangeStartDraft || !customRangeEndDraft) return;
                            setAdminCustomRange({ start: customRangeStartDraft, end: customRangeEndDraft });
                            setAdminDateRange("custom");
                            setCalendarPickerOpen(false);
                            setAdminPage(1);
                          }}
                          disabled={!customRangeStartDraft || !customRangeEndDraft}
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
                onClick={() => setIsColumnsSettingsOpen(true)}
                className="flex items-center gap-2 border border-slate-200 bg-white rounded-lg px-3 py-1.5 text-xs text-slate-700 font-bold shadow-sm hover:bg-slate-50 transition-all"
              >
                <Sliders className="h-4 w-4 text-blue-600" />
                Filter
              </button>
            </div>

            {/* Main Leads Table Card — the row area is height-capped with its
                own vertical scroll (independent of the page scroll), so a
                100-rows-per-page setting doesn't stretch the whole page;
                pagination still moves between full pages of that size. Both
                read from the same adminFilteredLeads/adminPageLeads, so the
                "X Rows"/"a-b of c" footer always matches what's actually
                scrollable. */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <div ref={adminScrollRef} onScroll={handleAdminTableScroll} className="overflow-auto max-h-[70vh]">
                <table className="w-full text-left border-collapse table-fixed min-w-[1080px]">
                  <colgroup>
                    {/* Pinned: Lead Name, Email, Assigned To */}
                    <col className="w-[150px]" />
                    <col className="w-[170px]" />
                    <col className="w-[130px]" />
                    {/* Togglable, driven by the Filter panel */}
                    {adminVisibleColumnList.map(c => (
                      <col key={c.key} style={{ width: c.width }} />
                    ))}
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr className="border-b border-slate-200 text-xs font-bold text-slate-800">
                      <th className="px-4 py-2.5">
                        {adminSearchOpen ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={adminSearch}
                              onChange={(e) => { setAdminSearch(e.target.value); setAdminPage(1); }}
                              onBlur={() => { setAdminSearch(""); setAdminSearchOpen(false); }}
                              placeholder="Search name or phone..."
                              className="min-w-0 flex-1 bg-white border border-brand-400 rounded-md px-1.5 py-1 text-[11px] font-normal focus:outline-none"
                            />
                            <button
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { setAdminSearch(""); setAdminSearchOpen(false); }}
                              className="text-slate-400 hover:text-slate-700 shrink-0"
                              title="Close search"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            Lead Name
                            <button onClick={() => setAdminSearchOpen(true)} className="text-slate-400 hover:text-brand-700" title="Search">
                              <Search className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </th>
                      <th className="px-4 py-2.5 whitespace-nowrap">Email</th>
                      {/* Pinned */}
                      <th className="px-4 py-2.5">
                        <div className="relative">
                          <button
                            ref={adminAssignedBtnRef}
                            onClick={() => openPositionedMenu(adminAssignedBtnRef, setAdminAssignedMenuPos, setAdminAssignedMenuOpen, "left", 208)}
                            className="flex items-center gap-1.5 hover:text-brand-700 whitespace-nowrap"
                          >
                            Assigned To
                            <ChevronDown className="h-3 w-3" />
                            {adminAssignedFilter.length > 0 && (
                              <span className="text-[9px] bg-brand-50 text-brand-700 rounded-full px-1.5 py-0.5 font-bold">{adminAssignedFilter.length}</span>
                            )}
                          </button>
                          {adminAssignedMenuOpen && adminAssignedMenuPos && createPortal(
                            <>
                              <div className="fixed inset-0 z-[60]" onClick={() => setAdminAssignedMenuOpen(false)} />
                              <div
                                className="fixed z-[70] w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1.5 max-h-56 overflow-y-auto"
                                style={{ top: adminAssignedMenuPos.top, left: adminAssignedMenuPos.left }}
                              >
                                {adminAssignedOptions.length === 0 ? (
                                  <p className="px-3 py-2 text-xs text-slate-400 italic font-normal">No data yet</p>
                                ) : (
                                  adminAssignedOptions.map(opt => (
                                    <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-xs font-normal text-slate-700 hover:bg-slate-50 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={adminAssignedFilter.includes(opt)}
                                        onChange={() => {
                                          setAdminPage(1);
                                          setAdminAssignedFilter(prev => prev.includes(opt) ? prev.filter(v => v !== opt) : [...prev, opt]);
                                        }}
                                      />
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

                      {/* Togglable, in the same order as the Filter panel */}
                      {adminVisibleColumns.date && <th className="px-4 py-2.5 whitespace-nowrap">Date</th>}
                      {adminVisibleColumns.property && <th className="px-4 py-2.5 whitespace-nowrap">Property</th>}
                      {adminVisibleColumns.reassignedTo && <th className="px-4 py-2.5 whitespace-nowrap">Reassigned To</th>}
                      {adminVisibleColumns.source && <th className="px-4 py-2.5 whitespace-nowrap">Source</th>}
                      {adminVisibleColumns.leadScore && <th className="px-4 py-2.5 whitespace-nowrap">Lead Score</th>}
                      {adminVisibleColumns.status && (
                        <th className="px-4 py-2.5">
                          <div className="relative">
                            <button
                              ref={adminStatusBtnRef}
                              onClick={() => openPositionedMenu(adminStatusBtnRef, setAdminStatusMenuPos, setAdminStatusMenuOpen, "left", 208)}
                              className="flex items-center gap-1.5 hover:text-brand-700 whitespace-nowrap"
                            >
                              Status
                              <ChevronDown className="h-3 w-3" />
                              {adminStatusFilter.length > 0 && (
                                <span className="text-[9px] bg-brand-50 text-brand-700 rounded-full px-1.5 py-0.5 font-bold">{adminStatusFilter.length}</span>
                              )}
                            </button>
                            {adminStatusMenuOpen && adminStatusMenuPos && createPortal(
                              <>
                                <div className="fixed inset-0 z-[60]" onClick={() => setAdminStatusMenuOpen(false)} />
                                <div
                                  className="fixed z-[70] w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1.5 max-h-56 overflow-y-auto"
                                  style={{ top: adminStatusMenuPos.top, left: adminStatusMenuPos.left }}
                                >
                                  {STATUS_OPTIONS.map(opt => (
                                    <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-xs font-normal text-slate-700 hover:bg-slate-50 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={adminStatusFilter.includes(opt)}
                                        onChange={() => {
                                          setAdminPage(1);
                                          setAdminStatusFilter(prev => prev.includes(opt) ? prev.filter(v => v !== opt) : [...prev, opt]);
                                        }}
                                      />
                                      {opt}
                                    </label>
                                  ))}
                                </div>
                              </>,
                              document.body
                            )}
                          </div>
                        </th>
                      )}
                      {adminVisibleColumns.nextCallDate && <th className="px-4 py-2.5 whitespace-nowrap">Next Call Date</th>}
                      {adminVisibleColumns.actions && <th className="px-4 py-2.5 text-right whitespace-nowrap">Actions</th>}
                      {adminVisibleColumns.adSetName && <th className="px-4 py-2.5 whitespace-nowrap">Ad Set Name</th>}
                      {adminVisibleColumns.campaign && (
                        <th className="px-4 py-2.5">
                          <div className="relative">
                            <button
                              ref={adminCampaignBtnRef}
                              onClick={() => openPositionedMenu(adminCampaignBtnRef, setAdminCampaignMenuPos, setAdminCampaignMenuOpen, "right", 224)}
                              className="flex items-center gap-1.5 hover:text-brand-700 whitespace-nowrap"
                            >
                              Campaign
                              <ChevronDown className="h-3 w-3" />
                              {adminCampaignFilter.length > 0 && (
                                <span className="text-[9px] bg-brand-50 text-brand-700 rounded-full px-1.5 py-0.5 font-bold">{adminCampaignFilter.length}</span>
                              )}
                            </button>
                            {adminCampaignMenuOpen && adminCampaignMenuPos && createPortal(
                              <>
                                <div className="fixed inset-0 z-[60]" onClick={() => setAdminCampaignMenuOpen(false)} />
                                <div
                                  className="fixed z-[70] w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1.5 max-h-56 overflow-y-auto"
                                  style={{ top: adminCampaignMenuPos.top, left: adminCampaignMenuPos.left }}
                                >
                                  {adminCampaignsList.length === 0 ? (
                                    <p className="px-3 py-2 text-xs text-slate-400 italic font-normal">No data yet</p>
                                  ) : (
                                    adminCampaignsList.map(opt => (
                                      <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-xs font-normal text-slate-700 hover:bg-slate-50 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={adminCampaignFilter.includes(opt)}
                                          onChange={() => {
                                            setAdminPage(1);
                                            setAdminCampaignFilter(prev => prev.includes(opt) ? prev.filter(v => v !== opt) : [...prev, opt]);
                                          }}
                                        />
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
                      )}
                      {adminVisibleColumns.notes && <th className="px-4 py-2.5 whitespace-nowrap">Notes</th>}
                      {adminVisibleColumns.propertyMatch && <th className="px-4 py-2.5 whitespace-nowrap">Property Match</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {adminFilteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={3 + adminVisibleColumnList.length} className="px-4 py-8 text-center text-slate-400 font-semibold italic">
                          No leads match the current filters.
                        </td>
                      </tr>
                    ) : (
                      (adminPageRowRefs.current = [], adminFilteredLeads.map((l, idx) => (
                        <tr
                          key={l.id}
                          ref={idx % adminRowsPerPage === 0 ? (el) => { adminPageRowRefs.current[Math.floor(idx / adminRowsPerPage)] = el; } : undefined}
                          className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 align-top overflow-hidden">
                            <button
                              onClick={() => setSelectedLead(l)}
                              className="font-bold text-[#0B1E6E] hover:underline text-left truncate block max-w-full"
                              title={l.name}
                            >
                              {l.name}
                            </button>
                            <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">{l.phone}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600 align-top truncate" title={l.email || "—"}>{l.email || "—"}</td>
                          <td className="px-4 py-3 text-slate-700 font-medium align-top truncate" title={l.assignedAgent || "Unassigned"}>{l.assignedAgent || "Unassigned"}</td>

                          {adminVisibleColumns.date && (
                            <td className="px-4 py-3 text-slate-500 align-top truncate">{adminFormatDateTime(l.createdAtStr)}</td>
                          )}
                          {adminVisibleColumns.property && (
                            <td className="px-4 py-3 text-slate-700 font-medium align-top truncate" title={l.property || "Not set"}>{l.property || "Not set"}</td>
                          )}
                          {adminVisibleColumns.reassignedTo && (
                            <td className="px-4 py-3 text-slate-700 font-medium align-top truncate" title={l.previousAgent || "—"}>{l.previousAgent || "—"}</td>
                          )}
                          {adminVisibleColumns.source && (
                            <td className="px-4 py-3 text-slate-700 font-medium align-top truncate" title={l.source || "—"}>{l.source || "—"}</td>
                          )}
                          {adminVisibleColumns.leadScore && (
                            <td className="px-4 py-3 text-slate-700 font-medium align-top truncate">{l.leadScore != null ? l.leadScore : "—"}</td>
                          )}
                          {adminVisibleColumns.status && (
                            <td className="px-4 py-3 align-top">
                              <select
                                value={l.status}
                                onChange={(e) => handleUpdateLeadStatus(l.id, e.target.value as LeadStatus)}
                                className="w-full max-w-[110px] bg-slate-50 border border-slate-200 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-slate-700 focus:outline-none cursor-pointer"
                              >
                                {!STATUS_OPTIONS.includes(l.status) && <option value={l.status}>{l.status}</option>}
                                {STATUS_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </td>
                          )}
                          {adminVisibleColumns.nextCallDate && (
                            <td className="px-4 py-3 text-slate-500 align-top truncate">{adminNextCallDateFor(l.id)}</td>
                          )}
                          {adminVisibleColumns.actions && (
                            <td className="px-4 py-3 align-top text-right">
                              <a
                                href={`https://wa.me/${l.phone.replace(/[^0-9]/g, "")}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                                title="WhatsApp"
                              >
                                <WhatsAppIcon className="h-4 w-4" />
                              </a>
                              <a
                                href={`tel:${l.phone}`}
                                className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-slate-100 text-slate-700 hover:bg-brand-50 hover:text-brand-700 transition-colors ml-1.5"
                                title="Call"
                              >
                                <CallIcon className="h-3.5 w-3.5" />
                              </a>
                            </td>
                          )}
                          {adminVisibleColumns.adSetName && (
                            <td className="px-4 py-3 text-slate-400 align-top truncate italic" title="Not tracked yet — no ad-set-level data ingested">—</td>
                          )}
                          {adminVisibleColumns.campaign && (
                            <td className="px-4 py-3 text-slate-700 font-medium align-top truncate" title={l.campaign || l.source || "—"}>{l.campaign || l.source || "—"}</td>
                          )}
                          {adminVisibleColumns.notes && (
                            <td className="px-4 py-3 text-slate-600 truncate align-top" title={adminLatestLogMessage(l)}>{adminLatestLogMessage(l)}</td>
                          )}
                          {adminVisibleColumns.propertyMatch && (
                            <td className="px-4 py-3 text-slate-400 align-top truncate italic" title="Not tracked yet — no property-match scoring implemented">—</td>
                          )}
                        </tr>
                      )))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-3 flex flex-wrap justify-between items-center gap-3 border-t border-slate-100 text-[11px] text-slate-500 font-semibold">
                <span>{adminFilteredLeads.length} Row{adminFilteredLeads.length === 1 ? "" : "s"}</span>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    Rows per page
                    <select
                      value={adminRowsPerPage}
                      onChange={(e) => {
                        adminProgrammaticScroll.current = true;
                        setAdminRowsPerPage(Number(e.target.value));
                        setAdminPage(1);
                        adminScrollRef.current?.scrollTo(0, 0);
                        requestAnimationFrame(() => {
                          requestAnimationFrame(() => { adminProgrammaticScroll.current = false; });
                        });
                      }}
                      className="bg-slate-50 border border-slate-200 rounded px-1.5 py-1 font-bold text-slate-700 focus:outline-none"
                    >
                      {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </span>
                  <span>{adminFilteredLeads.length === 0 ? 0 : (adminCurrentPage - 1) * adminRowsPerPage + 1}-{Math.min(adminCurrentPage * adminRowsPerPage, adminFilteredLeads.length)} of {adminFilteredLeads.length}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => goToAdminPage(adminCurrentPage - 1)} disabled={adminCurrentPage <= 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">‹</button>
                    <button onClick={() => goToAdminPage(adminCurrentPage + 1)} disabled={adminCurrentPage >= adminTotalPages} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">›</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Leads Analytics tab — real per-agent lead-quality breakdown */
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden p-6">
            <h3 className="text-sm font-extrabold text-slate-900 mb-4">Per-Agent Lead Quality</h3>
            {adminAgentBreakdown.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No leads assigned to any agent yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase font-bold text-slate-500">
                      <th className="py-2.5 pr-4">Agent</th>
                      <th className="py-2.5 pr-4">Total</th>
                      <th className="py-2.5 pr-4">Qualified</th>
                      <th className="py-2.5 pr-4">Unqualified</th>
                      <th className="py-2.5 pr-4">Site Visits</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {adminAgentBreakdown.map(row => (
                      <tr key={row.agentName} className="hover:bg-slate-50/50">
                        <td className="py-2.5 pr-4 font-bold text-slate-900">{row.agentName}</td>
                        <td className="py-2.5 pr-4">{row.total}</td>
                        <td className="py-2.5 pr-4 text-emerald-600">{row.qualified}</td>
                        <td className="py-2.5 pr-4 text-red-500">{row.unqualified}</td>
                        <td className="py-2.5 pr-4">{row.siteVisits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <AddLeadModal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onSubmitManual={handleAddManualLead}
          onSubmitBulk={handleAddBulkLeads}
          agentsList={agentsList}
          propertiesList={propertiesList}
        />

        <LeadDetailDrawer
          lead={selectedLead}
          isOpen={selectedLead !== null}
          onClose={() => setSelectedLead(null)}
          onUpdateStatus={handleUpdateLeadStatus}
        />

        {/* Filter button's column-visibility Settings panel — a full-height
            right-docked drawer (same pattern as the lead quick-view drawer
            elsewhere in this app): no dark backdrop, the rest of the page
            stays visible, closes on an invisible click-outside catcher. */}
        {isColumnsSettingsOpen && createPortal(
          <div className="fixed inset-0 z-[100]">
            <div className="fixed inset-0" onClick={() => setIsColumnsSettingsOpen(false)} />
            <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-slide-in">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
                <h3 className="text-base font-extrabold text-slate-900">Settings</h3>
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
                    onClick={toggleSelectAllAdminColumns}
                    className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-[#0B1E6E]"
                  >
                    <Minus className="h-3 w-3" />
                    Select All
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {ADMIN_COLUMNS.map(c => {
                    const isOn = adminVisibleColumns[c.key];
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => toggleAdminColumn(c.key)}
                        className={`text-left pl-2.5 py-2 text-xs transition-colors truncate ${
                          isOn
                            ? "border-l-[3px] border-[#0B1E6E] font-extrabold text-slate-900"
                            : "border-l-[3px] border-transparent font-semibold text-slate-400 hover:text-slate-600"
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

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {/* Top Title Bar */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
            <Sliders className="h-6.5 w-6.5 text-brand-600" />
            CRM Lead Partition Management
          </h2>
          <p className="text-xs text-slate-500">Acquire, distribute, and audit property buyer lead pipelines.</p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center gap-2 bg-brand-700 hover:bg-brand-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md shadow-brand-700/10 shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Lead
        </button>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-100 text-xs text-emerald-700 rounded-xl font-bold flex items-center gap-2 animate-fade-in shadow-sm">
          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Step 1: Top Metrics Summary Cards */}
      <TopMetricsCards
        totalLeads={totalLeadsSum}
        metaLeads={metaLeadsSum}
        googleLeads={googleLeadsSum}
        leadsToday={leadsToday}
        visitsToday={visitsToday}
        weekendVisits={weekendVisits}
        monthBookings={monthBookings}
        metaSubAccounts={metaSubAccounts}
        googleSubAccounts={googleSubAccounts}
        activeFilter={activeMetricFilter}
        onFilterChange={handleMetricFilterChange}
      />

      {/* Step 2: Search & scrollable Status Pool filters */}
      <LeadFilterBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedStatuses={selectedStatuses}
        setSelectedStatuses={setSelectedStatuses}
        availableStatuses={availableStatuses}
      />

      {/* Step 3: Core Leads Data Table */}
      <LeadTable
        leads={filteredLeads}
        onViewDetails={handleViewLeadDetails}
        onDelete={handleDeleteLead}
        activeRole={activeRole}
      />

      {/* Step 4: Add Lead Modal (Manual & Bulk Import) */}
      <AddLeadModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSubmitManual={handleAddManualLead}
        onSubmitBulk={handleAddBulkLeads}
        agentsList={agentsList}
        propertiesList={propertiesList}
      />

      {/* Step 5: Side Slide-Out Details Drawer */}
      <LeadDetailDrawer
        lead={selectedLead}
        isOpen={selectedLead !== null}
        onClose={() => setSelectedLead(null)}
        onUpdateStatus={handleUpdateLeadStatus}
      />
    </div>
  );
}
