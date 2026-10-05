"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp, Lead, LeadStatus, mapApiLeadToFrontendLead } from "@/context/AppContext";
import { Sliders, Sparkles, Plus, Check, ChevronDown, Search, X, Minus, Download, RotateCcw, Users } from "lucide-react";
import { STATUS_OPTIONS, frontendStatusToDbCode } from "@/lib/leadStatusMapping";
import { type LeadSummaryStats } from "@/lib/leadSummaryStats";
import { apiListLeadsPage, apiGetLeadStats, type LeadListFilters } from "@/lib/apiClient";
import { WhatsAppIcon, CallIcon, PlatformLabel } from "@/components/icons/ContactIcons";
import { LineSkeleton, TableRowsSkeleton } from "@/components/ui/Skeletons";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/SearchableDropdown";
import { eligibleAssignees, isUnassignedLead } from "@/lib/leadAssignment";
import DateRangePicker, { type DateRangeValue } from "@/components/ui/DateRangePicker";
import DateRangeSelect from "@/components/ui/DateRangeSelect";
import TablePagination, { usePagination } from "@/components/ui/TablePagination";
import AddLeadModal from "./AddLeadModal";
import LeadDetailDrawer from "./LeadDetailDrawer";
import LeadDrillDownPanel from "./LeadDrillDownPanel";

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

// Every number (and the manager/team-member name) in the Leads Analytics
// breakdown table drills into the Leads tab pre-filtered to exactly the
// leads that number represents — this is the shared clickable-cell look.
function StatCell({ value, onClick }: { value: string | number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="hover:underline hover:text-[#0B1E6E] transition-colors text-left">
      {value}
    </button>
  );
}

// Client-side pagination for a list rendered inside another row (e.g. a
// manager's expanded team) — each instance keeps its own page state, so
// every expanded manager pages independently.
function PaginatedSubList<T>({ items, rowLabel, children }: { items: T[]; rowLabel: string; children: (pageRows: T[]) => React.ReactNode }) {
  const { pageRows, paginationProps } = usePagination(items, 10);
  return (
    <>
      {children(pageRows)}
      <TablePagination {...paginationProps} rowLabel={rowLabel} className="!px-0 !pb-0" />
    </>
  );
}

// The same lead-quality categorization used by the stat cards up top,
// pulled out to module scope so both the per-agent breakdown math and the
// drill-down click handlers (which need to set the Leads tab's status
// filter to "whichever statuses this number represents") share one
// definition instead of drifting apart.
const UNQUALIFIED_STATUSES: LeadStatus[] = ["Unassigned", "RNR", "Switch off", "Not Interested", "Invalid", "Low Budget", "Dead"];
const SITE_VISIT_STATUSES: LeadStatus[] = ["Site Visit", "Meeting Done", "Visit Schedule"];

// The Leads Analytics per-agent table's togglable columns — Member Name
// itself stays pinned (same role as Lead Name in the Leads table), the rest
// are driven by the same Filter panel, switched to this set while that tab
// is active. "Team Total Leads" only applies to top-level Manager rows
// (self + every direct report's total) — the nested Team Member sub-table
// skips it since a leaf member's team total is just their own total.
type AnalyticsColumnKey = "teamTotal" | "total" | "qualified" | "unqualified" | "siteVisits" | "qlPct" | "ql2svPct";

const ANALYTICS_COLUMNS: { key: AnalyticsColumnKey; label: string }[] = [
  { key: "teamTotal", label: "Team Total Leads" },
  { key: "total", label: "Total Leads Assigned" },
  { key: "qualified", label: "Qualified Leads" },
  { key: "unqualified", label: "Unqualified Leads" },
  { key: "siteVisits", label: "Site Visit Leads" },
  { key: "qlPct", label: "QL's %age" },
  { key: "ql2svPct", label: "QL2SV %age" }
];

const ANALYTICS_DEFAULT_VISIBLE_COLUMNS: Record<AnalyticsColumnKey, boolean> = {
  teamTotal: true, total: true, qualified: true, unqualified: true, siteVisits: true, qlPct: true, ql2svPct: true
};

export default function LeadDashboard() {
  const {
    leads,
    addLead,
    updateLeadStatus,
    editLead,
    currentUser,
    properties,
    users,
    followupCalls,
    reassignLead,
    isDataLoading
  } = useApp();

  const router = useRouter();
  const searchParams = useSearchParams();

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
  // Admin-only UI within the (now shared) Leads console — the top Campaigns
  // quick-filter stays admin-exclusive; a Sales Member gets the same Leads
  // table and stat bar without it.
  const isAdmin = currentUser?.role === "ADMIN";
  // The Leads Analytics tab (and its "View Detailed Analytics" links) is
  // the one piece of this admin-only UI a Manager also gets — Managers
  // already see the exact same unscoped, company-wide `scopedLeads` as
  // Admin everywhere else on this page (see isSalesMember above), so
  // showing them the same per-agent breakdown here exposes nothing they
  // couldn't already see on the plain Leads tab.
  const canViewLeadsAnalytics = isAdmin || currentUser?.role_type === "Manager";
  // Bulk select + Assign/Reshuffle (same workflow as Data Calling) — Admin
  // and Manager only; who they can pick is scoped in lib/leadAssignment.ts.
  const canBulkAssign = isAdmin || currentUser?.role_type === "Manager";

  // Data scoping based on role
  const scopedLeads = leads.filter(l => {
    if (isSalesMember) {
      return l.assignedAgent.toLowerCase() === currentUser?.name.toLowerCase();
    }
    return true;
  });

  const today = new Date();
  const todayStr = today.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  // Extract properties lists for Bulk Upload assignments
  const propertiesList = properties.map(p => p.name);
  // Real sales roster (agents + managers/TLs), not a hardcoded seed-data
  // snapshot — matches the same department === "SALES" scoping already used
  // for the Properties team-member picker.
  const agentsList = users
    .filter(u => u.department === "SALES" && u.status !== "INACTIVE")
    .map(u => u.name);

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

  // Per-row Status editor cell — the shared searchable single-select (the
  // full status list runs ~18 options deep). Shared by the main Leads table
  // and the Analytics drilldown table.
  const renderStatusCell = (l: Lead) => {
    const allOptions = STATUS_OPTIONS.includes(l.status) ? STATUS_OPTIONS : [l.status, ...STATUS_OPTIONS];
    return (
      <SearchableSelect
        variant="inline"
        options={allOptions}
        value={l.status}
        onChange={(v) => handleUpdateLeadStatus(l.id, v as LeadStatus)}
        searchPlaceholder="Search status..."
        panelWidth={176}
        className="max-w-[110px] text-[11px] text-slate-700"
      />
    );
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

  // ===========================================================================
  // The Leads console below is shared by every role — scopedLeads already
  // restricts a Sales Member to their own leads (see isSalesMember above),
  // so the same JSX/table is safe to render for anyone; there's no per-row
  // destructive/admin-only action in here to gate. The Leads Analytics tab,
  // the top Campaigns quick-filter stays admin-only (isAdmin, below);
  // Leads Analytics and "View Detailed Analytics" are canViewLeadsAnalytics
  // (Admin or Manager).
  // ===========================================================================

  // Initialized from the URL's ?tab= param (if present) so a refresh/bookmark
  // while on Leads Analytics reopens on that tab, and kept in sync below so
  // the shared page header (getActiveTabName in the app layout) can show
  // "Leads Analytics" instead of always "Leads". Only Admin/Manager can ever
  // reach "analytics" — a Sales Member stays pinned to "leads" even if an
  // old ?tab=analytics link is opened.
  const [adminTab, setAdminTab] = useState<"leads" | "analytics">(
    () => (canViewLeadsAnalytics && searchParams.get("tab") === "analytics" ? "analytics" : "leads")
  );

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (adminTab === "analytics") params.set("tab", "analytics");
    else params.delete("tab");
    const query = params.toString();
    router.replace(`/dashboard/crm${query ? `?${query}` : ""}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminTab]);
  const [adminDateRange, setAdminDateRange] = useState<"today" | "yesterday" | "week" | "month" | "all" | "custom">("today");
  // Applied range from the calendar badge (DateRangePicker) — an alternative
  // to the preset Today/Yesterday/Week/Month/All buckets; only used while
  // adminDateRange === "custom".
  const [adminCustomRange, setAdminCustomRange] = useState<DateRangeValue | null>(null);
  // Stat card selection. Sales agents (non-admin): filters the main leads
  // table below. Admins: opens the drill-down panel under the cards instead
  // (adminDrillMetric), same as the CRM Dashboard, leaving the table unfiltered.
  const [adminMetric, setAdminMetric] = useState<string | null>(null);
  const [adminDrillMetric, setAdminDrillMetric] = useState<string | null>(null);
  const [adminSearch, setAdminSearch] = useState("");
  const [adminSearchOpen, setAdminSearchOpen] = useState(false);
  // Column-header filters (Assigned To / Status / Campaign). adminCampaignFilter
  // is also driven by the top "Campaigns" quick-filter (next to Upload Leads),
  // which lists the same campaigns grouped by ad platform.
  const [adminStatusFilter, setAdminStatusFilter] = useState<string[]>([]);
  const [adminAssignedFilter, setAdminAssignedFilter] = useState<string[]>([]);
  const [adminCampaignFilter, setAdminCampaignFilter] = useState<string[]>([]);
  const [adminPage, setAdminPage] = useState(1);
  const [adminRowsPerPage, setAdminRowsPerPage] = useState(100);

  // ---- Server-paginated Leads tab data (real fetch-per-page, not the old
  // "load every lead into the browser" pattern) ----
  // The table's own rows + stat cards are fetched directly from the server
  // for exactly the current page/filters, instead of deriving from the full
  // `leads` array AppContext still bulk-loads for other consumers (Reports,
  // Analytics, Data Calling, Dashboards) that genuinely need the whole
  // dataset for their own cross-lead aggregations — that full-load stays
  // for now (a separate, larger piece of work), this just stops the admin
  // Leads LIST specifically from needing or exposing it.
  const [serverLeads, setServerLeads] = useState<Lead[]>([]);
  const [serverTotalCount, setServerTotalCount] = useState(0);
  const [serverLeadsLoading, setServerLeadsLoading] = useState(true);
  const [serverStats, setServerStats] = useState<LeadSummaryStats | null>(null);
  // Search fires on every keystroke locally but is debounced before it
  // becomes a real network request — otherwise every character typed would
  // fire its own full server round trip.
  const [debouncedAdminSearch, setDebouncedAdminSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAdminSearch(adminSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [adminSearch]);

  // Plain YYYY-MM-DD bounds for whichever date-range preset is active —
  // mirrors the boundary logic dateInRange already uses for the old
  // client-side filter, just emitting dates instead of a predicate, since
  // the server does the actual comparison now.
  const adminServerDateBounds = (): { dateFrom?: string; dateTo?: string } => {
    const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (adminDateRange === "all") return {};
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (adminDateRange === "today") return { dateFrom: toYMD(startOfToday), dateTo: toYMD(startOfToday) };
    if (adminDateRange === "yesterday") {
      const y = new Date(startOfToday);
      y.setDate(y.getDate() - 1);
      return { dateFrom: toYMD(y), dateTo: toYMD(y) };
    }
    if (adminDateRange === "week") {
      const weekAgo = new Date(startOfToday);
      weekAgo.setDate(weekAgo.getDate() - 6);
      return { dateFrom: toYMD(weekAgo), dateTo: toYMD(startOfToday) };
    }
    if (adminDateRange === "custom") {
      if (!adminCustomRange) return {};
      return { dateFrom: adminCustomRange.start.split("T")[0], dateTo: adminCustomRange.end.split("T")[0] };
    }
    // month
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { dateFrom: toYMD(monthStart), dateTo: toYMD(monthEnd) };
  };

  // Non-admin's stat-card quick-filter (adminMetric) maps onto the same
  // server status filter rather than a separate client-side predicate — see
  // adminMetricPredicate below for the equivalent labels.
  const ADMIN_METRIC_TO_STATUS: Record<string, LeadStatus> = {
    new: "New Lead", rnr: "RNR", callbacks: "Call Back", followups: "Follow-ups",
    sitevisit_sched: "Visit Schedule", sitevisit_done: "Site Visit"
  };

  const buildAdminServerFilters = (): LeadListFilters => {
    const { dateFrom, dateTo } = adminServerDateBounds();
    const statusCodes = new Set<string>();
    if (!isAdmin && adminMetric && adminMetric !== "total") {
      const mappedStatus = ADMIN_METRIC_TO_STATUS[adminMetric];
      const code = mappedStatus && frontendStatusToDbCode(mappedStatus);
      if (code) statusCodes.add(code);
    }
    adminStatusFilter.forEach(s => {
      const code = frontendStatusToDbCode(s as LeadStatus);
      if (code) statusCodes.add(code);
    });
    // Assigned-agent filter is tracked by display name (matches the
    // dropdown's existing options, sourced from the same name strings
    // leads already carry) — resolved to the real id the API needs via the
    // user roster already loaded in context.
    const nameToId = new Map(users.map(u => [u.name, u.id] as const));
    const assignedAgentIds = adminAssignedFilter
      .map(name => nameToId.get(name))
      .filter((id): id is string => !!id);
    return {
      status: statusCodes.size > 0 ? Array.from(statusCodes) : undefined,
      assignedAgentId: assignedAgentIds.length > 0 ? assignedAgentIds : undefined,
      campaign: adminCampaignFilter.length > 0 ? adminCampaignFilter : undefined,
      dateFrom,
      dateTo,
      search: debouncedAdminSearch || undefined
    };
  };

  const adminServerFiltersKey = JSON.stringify(buildAdminServerFilters());

  useEffect(() => {
    if (adminTab !== "leads") return;
    let cancelled = false;
    setServerLeadsLoading(true);
    const filters = buildAdminServerFilters();
    Promise.all([
      apiListLeadsPage(adminPage, adminRowsPerPage, filters),
      apiGetLeadStats(filters)
    ])
      .then(([pageResult, stats]) => {
        if (cancelled) return;
        setServerLeads(pageResult.rows.map(mapApiLeadToFrontendLead));
        setServerTotalCount(pageResult.totalCount);
        setServerStats(stats);
      })
      .catch((err) => {
        if (!cancelled) console.error("Could not load the leads list page:", err);
      })
      .finally(() => {
        if (!cancelled) setServerLeadsLoading(false);
      });
    return () => { cancelled = true; };
    // adminServerFiltersKey captures every filter input in one stable string
    // so this effect re-fires exactly when a real filter value changes,
    // without needing every individual filter piece listed separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminTab, adminPage, adminRowsPerPage, adminServerFiltersKey]);

  // Filter button → Settings panel for which table columns are shown — both
  // roles get the full-height right-docked drawer (same pattern as the lead
  // quick-view drawer elsewhere in this app); a Sales Member/Manager's
  // column buttons render in the boxed style of the admin Campaigns filter
  // (a bordered box with a navy left accent) instead of admin's plain
  // left-strip style, since they only ever see the Leads columns list.
  const [isColumnsSettingsOpen, setIsColumnsSettingsOpen] = useState(false);

  // Leads Analytics tab's own toolbar — a fully independent set of filters
  // (date range, member, property, campaign) from the Leads tab's, so
  // switching tabs never silently changes what the other tab is scoped to.
  const [analyticsDateRange, setAnalyticsDateRange] = useState<"today" | "yesterday" | "week" | "month" | "all" | "custom">("month");
  const [analyticsCustomRange, setAnalyticsCustomRange] = useState<DateRangeValue | null>(null);

  const [analyticsMemberFilter, setAnalyticsMemberFilter] = useState<string[]>([]);
  const [analyticsPropertyFilter, setAnalyticsPropertyFilter] = useState<string[]>([]);
  const [analyticsCampaignFilter, setAnalyticsCampaignFilter] = useState<string[]>([]);

  const [analyticsPage, setAnalyticsPage] = useState(1);
  const [analyticsRowsPerPage, setAnalyticsRowsPerPage] = useState(100);
  const [rnrSearch, setRnrSearch] = useState("");
  const [expandedManagers, setExpandedManagers] = useState<Set<string>>(new Set());

  const toggleManagerExpand = (agentName: string) => {
    setExpandedManagers(prev => {
      const next = new Set(prev);
      if (next.has(agentName)) next.delete(agentName); else next.add(agentName);
      return next;
    });
  };

  const [analyticsManagerSearchOpen, setAnalyticsManagerSearchOpen] = useState(false);
  const [analyticsManagerSearch, setAnalyticsManagerSearch] = useState("");

  // Every clickable number/name in the breakdown table opens a real drill-down
  // card right there on the Analytics tab (not a tab switch — the admin stays
  // in context) showing exactly the real Lead rows that number represents:
  // who it's assigned to (a manager's whole team, or a single person) and,
  // for the qualified/unqualified/site-visit columns, which real statuses
  // make up that category (statusScope === null means no status filter —
  // "all" leads for that scope).
  const [analyticsDrilldown, setAnalyticsDrilldown] = useState<{ title: string; leads: Lead[] } | null>(null);
  const [drilldownSearch, setDrilldownSearch] = useState("");
  const [drilldownSearchOpen, setDrilldownSearchOpen] = useState(false);
  const [drilldownPage, setDrilldownPage] = useState(1);
  const [drilldownRowsPerPage, setDrilldownRowsPerPage] = useState(8);

  // Same scroll-spy + synced-pagination pattern as the admin Leads table:
  // rows render continuously in a capped-height scroll container, scrolling
  // past a page boundary advances drilldownPage, and the pagination arrows
  // scroll that page's first row back to the top — the two stay in sync in
  // both directions.
  const drilldownScrollRef = useRef<HTMLDivElement>(null);
  const drilldownPageRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const drilldownProgrammaticScroll = useRef(false);

  const openAnalyticsDrilldown = (assignedNames: string[], statusScope: LeadStatus[] | null, title: string) => {
    const matched = analyticsScopedLeads.filter(l =>
      assignedNames.includes(l.assignedAgent) && (!statusScope || statusScope.includes(l.status))
    );
    setAnalyticsDrilldown({ title, leads: matched });
    setDrilldownSearch("");
    setDrilldownSearchOpen(false);
    setDrilldownPage(1);
  };

  const analyticsDrilldownFilteredLeads = analyticsDrilldown
    ? analyticsDrilldown.leads.filter(l =>
        !drilldownSearch || l.name.toLowerCase().includes(drilldownSearch.toLowerCase()) || l.phone.includes(drilldownSearch)
      )
    : [];
  const drilldownTotalPages = Math.max(1, Math.ceil(analyticsDrilldownFilteredLeads.length / drilldownRowsPerPage));
  const drilldownCurrentPage = Math.min(drilldownPage, drilldownTotalPages);

  const handleDrilldownTableScroll = () => {
    if (drilldownProgrammaticScroll.current) return;
    const container = drilldownScrollRef.current;
    if (!container) return;
    const scrollTop = container.scrollTop;
    let current = 1;
    for (let i = 0; i < drilldownPageRowRefs.current.length; i++) {
      const row = drilldownPageRowRefs.current[i];
      if (row && row.offsetTop - container.offsetTop <= scrollTop + 4) {
        current = i + 1;
      }
    }
    setDrilldownPage(prev => (prev !== current ? current : prev));
  };

  const goToDrilldownPage = (page: number) => {
    const clamped = Math.max(1, Math.min(drilldownTotalPages, page));
    setDrilldownPage(clamped);
    const row = drilldownPageRowRefs.current[clamped - 1];
    const container = drilldownScrollRef.current;
    if (!row || !container) return;
    drilldownProgrammaticScroll.current = true;
    container.scrollTop = clamped === 1 ? 0 : row.offsetTop - container.offsetTop;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { drilldownProgrammaticScroll.current = false; });
    });
  };

  const QUALIFIED_STATUS_OPTIONS = STATUS_OPTIONS.filter(s => !UNQUALIFIED_STATUSES.includes(s));

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

  // Sales Member/Manager never gets a Campaign column or its filter (see the
  // Campaign <th>/<td> guards below) — excluded here too so the <colgroup>'s
  // <col> count still matches the actual rendered <th> count for them.
  const adminVisibleColumnList = ADMIN_COLUMNS.filter(c => adminVisibleColumns[c.key] && (isAdmin || c.key !== "campaign"));

  const [analyticsVisibleColumns, setAnalyticsVisibleColumns] = useState<Record<AnalyticsColumnKey, boolean>>(ANALYTICS_DEFAULT_VISIBLE_COLUMNS);

  const toggleAnalyticsColumn = (key: AnalyticsColumnKey) => {
    setAnalyticsVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allAnalyticsColumnsVisible = ANALYTICS_COLUMNS.every(c => analyticsVisibleColumns[c.key]);
  const toggleSelectAllAnalyticsColumns = () => {
    const next = !allAnalyticsColumnsVisible;
    setAnalyticsVisibleColumns(
      ANALYTICS_COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: next }), {} as Record<AnalyticsColumnKey, boolean>)
    );
  };

  const DATE_RANGE_OPTIONS: { value: typeof adminDateRange; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "week", label: "This Week" },
    { value: "month", label: "This Month" },
    { value: "all", label: "All Time" }
  ];

  // Shared by both the Leads tab's date filter and the Leads Analytics tab's
  // own independent date filter — each passes its own customRange so the two
  // tabs' date pickers stay fully decoupled while sharing one implementation.
  const dateInRange = (
    dateStr: string | undefined,
    range: "today" | "yesterday" | "week" | "month" | "all" | "custom",
    refNow: Date,
    customRange: { start: string; end: string } | null
  ): boolean => {
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
      if (!customRange) return false;
      let start = new Date(customRange.start);
      let end = new Date(customRange.end);
      // The picker UI already blocks picking an End Date before Start, but
      // swap defensively in case an older/invalid range is still stored —
      // an inverted pair should still show "the selected date range's
      // leads", not silently go empty.
      if (start > end) [start, end] = [end, start];
      end.setHours(23, 59, 59, 999);
      return d >= start && d <= end;
    }
    return d.getMonth() === refNow.getMonth() && d.getFullYear() === refNow.getFullYear();
  };

  const adminDateInRange = (dateStr: string | undefined, range: typeof adminDateRange, refNow: Date): boolean =>
    dateInRange(dateStr, range, refNow, adminCustomRange);

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

  // The Campaigns quick-filter (adminCampaignFilter) narrows these same 7
  // stat cards down to whichever campaign(s) are selected.
  const adminCampaignScopedLeads = adminCampaignFilter.length === 0
    ? scopedLeads
    : scopedLeads.filter(l => !!l.campaign && adminCampaignFilter.includes(l.campaign));

  const adminRangeLeads = adminCampaignScopedLeads.filter(l => adminDateInRange(l.createdAtStr, adminDateRange, today));
  // Real counts from the server (same filters as the table itself), not a
  // computation over the full in-memory array — see the serverStats fetch
  // effect above. adminRangeLeads/adminCampaignScopedLeads stay exactly as
  // they were purely for the admin drill-down panel below (adminDrillMetric),
  // which still needs real lead rows to display, not just a count.
  const adminStats: LeadSummaryStats = serverStats ?? {
    totalLeads: 0, newLeads: 0, rnr: 0, callBacks: 0, followUps: 0, siteVisitScheduled: 0, siteVisitDone: 0
  };

  const adminStatCards: { key: string; label: string; value: number; color: string }[] = [
    { key: "total", label: "Total Leads", value: adminStats.totalLeads, color: "text-slate-900" },
    { key: "new", label: "New Leads", value: adminStats.newLeads, color: "text-[#0084FF]" },
    { key: "rnr", label: "RNR", value: adminStats.rnr, color: "text-[#FF0000]" },
    { key: "callbacks", label: "Call Backs", value: adminStats.callBacks, color: "text-[#FF8C00]" },
    { key: "followups", label: "Follow Ups", value: adminStats.followUps, color: "text-[#0084FF]" },
    { key: "sitevisit_sched", label: "Site Visit Scheduled", value: adminStats.siteVisitScheduled, color: "text-[#FF0000]" },
    { key: "sitevisit_done", label: "Site Visit Done", value: adminStats.siteVisitDone, color: "text-[#015814]" }
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
  // Grouped (Meta → Google → Other) options for the Campaigns dropdowns.
  const groupCampaignOptions = (campaigns: string[]) =>
    (["Meta", "Google", "Other"] as const).flatMap(group =>
      campaigns.filter(c => classifyCampaignPlatform(c) === group).map(c => ({ value: c, label: c, group }))
    );
  const adminCampaignOptions = groupCampaignOptions(adminCampaignsList);

  // The table itself now renders exactly one server-fetched page (serverLeads)
  // instead of filtering/slicing the full array — adminFilteredLeads/
  // adminTotalPages/adminCurrentPage below are thin aliases kept so the JSX
  // further down (and anything still reading them) doesn't need a sweeping
  // rename; they just point at server state now instead of a derived array.
  const adminFilteredLeads = serverLeads;
  const adminTotalPages = Math.max(1, Math.ceil(serverTotalCount / adminRowsPerPage));
  const adminCurrentPage = Math.min(adminPage, adminTotalPages);

  // ---- Bulk Assign / Reshuffle (Admin + Manager) ----
  // "Assign" appears once the selection holds an unassigned lead, "Reshuffle"
  // once it holds an already-assigned one — same split as Data Calling.
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const toggleLeadSelection = (id: string) => setSelectedLeadIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // serverLeads already *is* the current page — no slicing needed anymore.
  const currentPageLeads = serverLeads;
  const allOnPageSelected = currentPageLeads.length > 0 && currentPageLeads.every(l => selectedLeadIds.has(l.id));
  const toggleSelectAllOnPage = () => setSelectedLeadIds(prev => {
    const next = new Set(prev);
    if (allOnPageSelected) currentPageLeads.forEach(l => next.delete(l.id));
    else currentPageLeads.forEach(l => next.add(l.id));
    return next;
  });
  const selectedUnassignedLeads = scopedLeads.filter(l => selectedLeadIds.has(l.id) && isUnassignedLead(l));
  const selectedAssignedLeads = scopedLeads.filter(l => selectedLeadIds.has(l.id) && !isUnassignedLead(l));

  const [assignFlowMode, setAssignFlowMode] = useState<"assign" | "reshuffle" | null>(null);
  const [assignPropertyIds, setAssignPropertyIds] = useState<Set<string>>(new Set());
  const [assignAssigneeId, setAssignAssigneeId] = useState("");
  const flowTargetLeads = assignFlowMode === "reshuffle" ? selectedAssignedLeads : selectedUnassignedLeads;
  const assigneeOptions = eligibleAssignees({
    users,
    properties,
    selectedPropertyIds: assignPropertyIds,
    caller: currentUser,
    targetLeads: flowTargetLeads
  });
  const canConfirmAssign = assignPropertyIds.size > 0 && !!assignAssigneeId && assigneeOptions.some(u => u.id === assignAssigneeId);

  const openAssignFlow = (mode: "assign" | "reshuffle") => {
    setAssignPropertyIds(new Set());
    setAssignAssigneeId("");
    setAssignFlowMode(mode);
  };
  const confirmBulkAssign = () => {
    const assignee = users.find(u => u.id === assignAssigneeId);
    if (!canConfirmAssign || !assignFlowMode || !assignee) return;
    // The backend rejects moving a lead to the agent who already holds it,
    // so those are skipped rather than sent.
    const toMove = flowTargetLeads.filter(l => l.assignedAgent?.trim().toLowerCase() !== assignee.name.trim().toLowerCase());
    toMove.forEach(l => {
      reassignLead(l.id, assignee.name);
      if (assignFlowMode === "assign" && l.status === "Unassigned") updateLeadStatus(l.id, "New Lead");
    });
    const skipped = flowTargetLeads.length - toMove.length;
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      flowTargetLeads.forEach(l => next.delete(l.id));
      return next;
    });
    setAssignFlowMode(null);
    setSuccessMsg(
      `${assignFlowMode === "reshuffle" ? "Reshuffled" : "Assigned"} ${toMove.length} lead${toMove.length === 1 ? "" : "s"} to ${assignee.name}` +
      (skipped > 0 ? ` (${skipped} already with ${assignee.name}, skipped)` : "") + "."
    );
    setTimeout(() => setSuccessMsg(""), 4000);
  };

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

  // Scroll-spy is moot now that the table renders exactly one server-fetched
  // page at a time (there's only ever one "page" of rows in the DOM to spy
  // on) — left as a no-op rather than torn out, since the JSX below still
  // wires onScroll={handleAdminTableScroll} and removing that wiring isn't
  // worth the extra diff for what's already a large change.
  const handleAdminTableScroll = () => {};

  const goToAdminPage = (page: number) => {
    const clamped = Math.max(1, Math.min(adminTotalPages, page));
    setAdminPage(clamped);
    adminScrollRef.current?.scrollTo(0, 0);
  };

  // Leads Analytics tab's own filtered lead set — independent of the Leads
  // tab's filters, driven by its own toolbar (date range, Member, Property,
  // Campaigns).
  const analyticsScopedLeads = scopedLeads.filter(l => {
    const matchesMember = analyticsMemberFilter.length === 0 || analyticsMemberFilter.includes(l.assignedAgent);
    const matchesProperty = analyticsPropertyFilter.length === 0 || (!!l.property && analyticsPropertyFilter.includes(l.property));
    const matchesCampaign = analyticsCampaignFilter.length === 0 || (!!l.campaign && analyticsCampaignFilter.includes(l.campaign));
    const matchesDate = dateInRange(l.createdAtStr, analyticsDateRange, today, analyticsCustomRange);
    return matchesMember && matchesProperty && matchesCampaign && matchesDate;
  });

  const analyticsPropertiesList = Array.from(new Set(scopedLeads.map(l => l.property).filter(Boolean))) as string[];
  const analyticsCampaignsList = Array.from(new Set(scopedLeads.map(l => l.campaign).filter(Boolean))) as string[];
  // Same Meta/Google grouping as the Leads tab's own Campaigns dropdown
  // (groupCampaignOptions, defined above), reused here rather than
  // re-implemented.
  const analyticsCampaignOptions = groupCampaignOptions(analyticsCampaignsList);

  const computeLeadStats = (leadsForPerson: Lead[]) => {
    const qualified = leadsForPerson.filter(l => !UNQUALIFIED_STATUSES.includes(l.status)).length;
    const siteVisits = leadsForPerson.filter(l => SITE_VISIT_STATUSES.includes(l.status)).length;
    const total = leadsForPerson.length;
    return {
      total,
      qualified,
      unqualified: total - qualified,
      siteVisits,
      qlPct: total > 0 ? (qualified / total) * 100 : 0,
      ql2svPct: qualified > 0 ? (siteVisits / qualified) * 100 : 0
    };
  };

  // Real reporting-line data (User.role_type/managerId) — not a fabricated
  // hierarchy. Members who report to a Manager are matched to them by id,
  // then their own leads (matched by name, same as everywhere else in this
  // file) are aggregated the same way as the top-level rows.
  const salesTeamUsers = users.filter(u => u.department === "SALES" && u.status !== "INACTIVE");

  // Real per-agent lead-quality breakdown for the Leads Analytics tab — same
  // categorization the stat cards above use, just grouped per agent, plus
  // two real conversion rates derived from those same counts (no new data
  // needed): QL's %age = qualified/total, QL2SV %age = of the qualified
  // leads, what share also reached a site-visit status.
  const adminAgentBreakdown = agentsList.map(agentName => {
    const agentLeads = analyticsScopedLeads.filter(l => l.assignedAgent === agentName);
    const stats = computeLeadStats(agentLeads);
    const salesUser = salesTeamUsers.find(u => u.name === agentName);
    const isManager = salesUser?.role_type === "Manager";
    const directReports = isManager && salesUser
      ? salesTeamUsers
          .filter(u => u.managerId === salesUser.id)
          .map(member => ({
            name: member.name,
            ...computeLeadStats(analyticsScopedLeads.filter(l => l.assignedAgent === member.name))
          }))
      : [];
    const teamTotal = stats.total + directReports.reduce((sum, d) => sum + d.total, 0);
    return { agentName, isManager, directReports, teamTotal, ...stats };
  }).filter(row =>
    row.isManager &&
    (row.total > 0 || row.directReports.some(d => d.total > 0)) &&
    (!analyticsManagerSearch || row.agentName.toLowerCase().includes(analyticsManagerSearch.toLowerCase()))
  );

  const analyticsTotalPages = Math.max(1, Math.ceil(adminAgentBreakdown.length / analyticsRowsPerPage));
  const analyticsCurrentPage = Math.min(analyticsPage, analyticsTotalPages);
  const analyticsPageRows = adminAgentBreakdown.slice(
    (analyticsCurrentPage - 1) * analyticsRowsPerPage,
    analyticsCurrentPage * analyticsRowsPerPage
  );

  const handleExportAnalytics = () => {
    // Mirrors whichever columns are currently toggled on in the Filter panel.
    const visibleCols = ANALYTICS_COLUMNS.filter(c => analyticsVisibleColumns[c.key]);
    const header = ["Manager Name", ...visibleCols.map(c => c.label)];
    const cellValue: Record<AnalyticsColumnKey, (r: typeof adminAgentBreakdown[number]) => string | number> = {
      teamTotal: r => r.teamTotal,
      total: r => r.total,
      qualified: r => r.qualified,
      unqualified: r => r.unqualified,
      siteVisits: r => r.siteVisits,
      qlPct: r => `${r.qlPct.toFixed(2)}%`,
      ql2svPct: r => `${r.ql2svPct.toFixed(2)}%`
    };
    const rows = adminAgentBreakdown.map(r => [r.agentName, ...visibleCols.map(c => cellValue[c.key](r))]);
    const csv = [header, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // RNR Analysis — only "Total Leads" and "Date" are backed by real data
  // (leads currently in RNR status, most recent activity among them). The
  // per-day call-attempt average, average-calls-before-dead, and AI Notes
  // have no source anywhere in this app yet: there's no call-attempt log
  // (followupCalls only tracks scheduled callbacks, not attempts made) and
  // no AI-analysis pipeline, so those three cells stay honest "—" rather
  // than invented numbers/text.
  const rnrLeads = scopedLeads.filter(l =>
    l.status === "RNR" && (!rnrSearch || l.name.toLowerCase().includes(rnrSearch.toLowerCase()))
  );
  const rnrMostRecentActivity = rnrLeads
    .map(l => adminSortedLogs(l)[0]?.timestamp || l.createdAtStr)
    .filter((d): d is string => !!d)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  return (
    <div className="space-y-4 pb-12 animate-fade-in">
      <div className="flex flex-wrap justify-between items-center gap-3">
          {canViewLeadsAnalytics && (
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
          )}

          {adminTab === "leads" && (
            <div className="flex flex-wrap items-center gap-3 ml-auto">
              {isAdmin && (
                <SearchableMultiSelect
                  options={adminCampaignOptions}
                  selected={adminCampaignFilter}
                  onChange={(next) => { setAdminPage(1); setAdminCampaignFilter(next); }}
                  placeholder="Campaigns"
                  searchPlaceholder="Search campaigns..."
                  renderLabel={(l) => <PlatformLabel text={l} />}
                  panelWidth={260}
                />
              )}
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

        {!canViewLeadsAnalytics || adminTab === "leads" ? (
          <>
            {/* Date Filter & Metrics — one unified card */}
            <div className="bg-slate-100/70 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
              <div className="flex flex-wrap justify-between items-center gap-2 px-4 py-2.5 text-[11px] border-b border-slate-200/60">
                <div className="flex items-center gap-1.5 font-bold text-slate-700">
                  <span className="font-normal text-slate-500">Date Range</span>
                  {/* Presets + "Custom" (opens the shared calendar). Shares
                      state with the date badge below, so both stay in sync. */}
                  <DateRangeSelect
                    options={DATE_RANGE_OPTIONS}
                    value={adminDateRange}
                    customValue="custom"
                    customRange={adminCustomRange}
                    onPresetChange={(v) => { setAdminDateRange(v); setAdminPage(1); }}
                    onCustomApply={(range) => {
                      setAdminCustomRange(range);
                      setAdminDateRange("custom");
                      setAdminPage(1);
                    }}
                  />
                </div>
                {canViewLeadsAnalytics && (
                <button
                  type="button"
                  onClick={() => setAdminTab("analytics")}
                  className="text-blue-600 font-extrabold hover:underline"
                >
                  View Detailed Analytics
                </button>
                )}
              </div>

              <div className="flex md:grid md:grid-cols-7 bg-white divide-x divide-slate-100 overflow-x-auto min-w-full">
                {adminStatCards.map((s) => {
                  const isActive = (isAdmin ? adminDrillMetric : adminMetric) === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => {
                        if (isAdmin) {
                          setAdminDrillMetric(prev => (prev === s.key ? null : s.key));
                        } else {
                          setAdminMetric(prev => (prev === s.key ? null : s.key));
                          setAdminPage(1);
                        }
                      }}
                      className={`p-3 flex flex-col justify-between min-h-[70px] min-w-[110px] md:min-w-0 flex-1 text-left group transition-colors ${
                        isActive ? "bg-blue-50/70" : "hover:bg-slate-50/50"
                      }`}
                    >
                      <span className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                        {s.label}
                        <ChevronDown className={`h-3 w-3 text-slate-300 shrink-0 transition-transform ${isActive ? "rotate-180 text-blue-500" : ""}`} />
                      </span>
                      <span className={`text-lg font-extrabold block mt-1.5 ${s.color}`}>
                        {isDataLoading ? <LineSkeleton width={36} height={18} /> : s.value}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Admin only — the real leads behind the selected stat card */}
            {isAdmin && (
              <LeadDrillDownPanel
                title={adminStatCards.find(s => s.key === adminDrillMetric)?.label ?? null}
                leads={adminDrillMetric ? adminRangeLeads.filter(adminMetricPredicate[adminDrillMetric]) : []}
                onClose={() => setAdminDrillMetric(null)}
              />
            )}

            {/* Date badge (opens the shared range calendar) + Filter row.
                Applying a range switches the Date Range select above to
                Custom (it shows the picked dates); the × on the badge
                reverts it to Today. */}
            <div className="flex flex-wrap justify-end items-center gap-3">
              {canBulkAssign && selectedUnassignedLeads.length > 0 && (
                <button
                  type="button"
                  onClick={() => openAssignFlow("assign")}
                  className="flex items-center gap-2 border border-slate-200 bg-white rounded-lg px-3 py-1.5 text-xs text-slate-700 font-bold shadow-sm hover:bg-slate-50 transition-all"
                >
                  <Users className="h-4 w-4 text-blue-600" />
                  Assign ({selectedUnassignedLeads.length})
                </button>
              )}
              {canBulkAssign && selectedAssignedLeads.length > 0 && (
                <button
                  type="button"
                  onClick={() => openAssignFlow("reshuffle")}
                  className="flex items-center gap-2 border border-slate-200 bg-white rounded-lg px-3 py-1.5 text-xs text-slate-700 font-bold shadow-sm hover:bg-slate-50 transition-all"
                >
                  <Users className="h-4 w-4 text-blue-600" />
                  Reshuffle ({selectedAssignedLeads.length})
                </button>
              )}
              <DateRangePicker
                value={adminDateRange === "custom" ? adminCustomRange : null}
                onChange={(range) => {
                  setAdminCustomRange(range);
                  setAdminDateRange(range ? "custom" : "today");
                  setAdminPage(1);
                }}
                emptyLabel={todayStr}
              />
              <button
                type="button"
                onClick={() => setIsColumnsSettingsOpen(true)}
                className="flex items-center gap-2 border border-slate-200 bg-white rounded-lg px-3 py-1.5 text-xs text-slate-700 font-bold shadow-sm hover:bg-slate-50 transition-all"
              >
                <Sliders className="h-4 w-4 text-blue-600" />
                Filter
              </button>
            </div>

            {/* Which stat card's filter is currently applied to the table
                below — sales agent only. Every card (Total Leads and New
                Leads included) sets adminMetric on click, same as RNR/Call
                Backs/etc., but without this there was no visible
                confirmation of which one was actually active, so Total
                Leads (whose filter matches everything, so the table looks
                unchanged) and New Leads looked like they "did nothing". */}
            {!isAdmin && adminMetric && (
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-extrabold text-slate-900">
                  Showing: {adminStatCards.find(s => s.key === adminMetric)?.label}
                </h3>
                <button
                  type="button"
                  onClick={() => { setAdminMetric(null); setAdminPage(1); }}
                  className="text-[11px] font-bold text-slate-400 hover:text-slate-700"
                >
                  Clear ✕
                </button>
              </div>
            )}

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
                    {/* Bulk-select checkbox (Admin/Manager) */}
                    {canBulkAssign && <col className="w-[40px]" />}
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
                      {canBulkAssign && (
                        <th className="pl-4 pr-1 py-2.5">
                          <input
                            type="checkbox"
                            checked={allOnPageSelected}
                            onChange={toggleSelectAllOnPage}
                            title="Select all leads on this page"
                            className="h-3.5 w-3.5 rounded border-slate-300 accent-[#0B1E6E]"
                          />
                        </th>
                      )}
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
                        <SearchableMultiSelect
                          variant="inline"
                          label="Assigned To"
                          options={adminAssignedOptions}
                          selected={adminAssignedFilter}
                          onChange={(next) => { setAdminPage(1); setAdminAssignedFilter(next); }}
                          searchPlaceholder="Search agents..."
                          panelWidth={208}
                        />
                      </th>

                      {/* Togglable, in the same order as the Filter panel */}
                      {adminVisibleColumns.date && <th className="px-4 py-2.5 whitespace-nowrap">Date</th>}
                      {adminVisibleColumns.property && <th className="px-4 py-2.5 whitespace-nowrap">Property</th>}
                      {adminVisibleColumns.reassignedTo && <th className="px-4 py-2.5 whitespace-nowrap">Reassigned To</th>}
                      {adminVisibleColumns.source && <th className="px-4 py-2.5 whitespace-nowrap">Source</th>}
                      {adminVisibleColumns.leadScore && <th className="px-4 py-2.5 whitespace-nowrap">Lead Score</th>}
                      {adminVisibleColumns.status && (
                        <th className="px-4 py-2.5">
                          <SearchableMultiSelect
                            variant="inline"
                            label="Status"
                            options={STATUS_OPTIONS}
                            selected={adminStatusFilter}
                            onChange={(next) => { setAdminPage(1); setAdminStatusFilter(next); }}
                            searchPlaceholder="Search status..."
                            panelWidth={208}
                          />
                        </th>
                      )}
                      {adminVisibleColumns.nextCallDate && <th className="px-4 py-2.5 whitespace-nowrap">Next Call Date</th>}
                      {adminVisibleColumns.actions && <th className="px-4 py-2.5 text-right whitespace-nowrap">Actions</th>}
                      {adminVisibleColumns.adSetName && <th className="px-4 py-2.5 whitespace-nowrap">Ad Set Name</th>}
                      {isAdmin && adminVisibleColumns.campaign && (
                        <th className="px-4 py-2.5">
                          <SearchableMultiSelect
                            variant="inline"
                            label="Campaign"
                            options={adminCampaignsList}
                            selected={adminCampaignFilter}
                            onChange={(next) => { setAdminPage(1); setAdminCampaignFilter(next); }}
                            searchPlaceholder="Search campaigns..."
                            renderLabel={(l) => <PlatformLabel text={l} />}
                            panelWidth={224}
                            align="right"
                          />
                        </th>
                      )}
                      {adminVisibleColumns.notes && <th className="px-4 py-2.5 whitespace-nowrap">Notes</th>}
                      {adminVisibleColumns.propertyMatch && <th className="px-4 py-2.5 whitespace-nowrap">Property Match</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {serverLeadsLoading && adminFilteredLeads.length === 0 ? (
                      <TableRowsSkeleton rows={8} columns={(canBulkAssign ? 4 : 3) + adminVisibleColumnList.length} />
                    ) : adminFilteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={(canBulkAssign ? 4 : 3) + adminVisibleColumnList.length} className="px-4 py-8 text-center text-slate-400 font-semibold italic">
                          No leads match the current filters.
                        </td>
                      </tr>
                    ) : (
                      (adminPageRowRefs.current = [], adminFilteredLeads.map((l, idx) => (
                        <tr
                          key={l.id}
                          ref={idx % adminRowsPerPage === 0 ? (el) => { adminPageRowRefs.current[Math.floor(idx / adminRowsPerPage)] = el; } : undefined}
                          className={`transition-colors ${selectedLeadIds.has(l.id) ? "bg-blue-50/50" : "hover:bg-slate-50/60"}`}>
                          {canBulkAssign && (
                            <td className="pl-4 pr-1 py-3 align-top">
                              <input
                                type="checkbox"
                                checked={selectedLeadIds.has(l.id)}
                                onChange={() => toggleLeadSelection(l.id)}
                                aria-label={`Select ${l.name}`}
                                className="h-3.5 w-3.5 rounded border-slate-300 accent-[#0B1E6E]"
                              />
                            </td>
                          )}
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
                            <td className="px-4 py-3 text-slate-700 font-medium align-top truncate" title={l.source || "—"}>
                              <PlatformLabel text={l.source || "—"} iconOnly />
                            </td>
                          )}
                          {adminVisibleColumns.leadScore && (
                            <td className="px-4 py-3 text-slate-700 font-medium align-top truncate">{l.leadScore != null ? l.leadScore : "—"}</td>
                          )}
                          {adminVisibleColumns.status && (
                            <td className="px-4 py-3 align-top">
                              {renderStatusCell(l)}
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
                          {isAdmin && adminVisibleColumns.campaign && (
                            <td className="px-4 py-3 text-slate-700 font-medium align-top truncate" title={l.campaign || l.source || "—"}>
                              <PlatformLabel text={l.campaign || l.source || "—"} classifyBy={l.source || l.campaign} />
                            </td>
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

              <TablePagination
                totalRows={serverTotalCount}
                page={adminCurrentPage}
                rowsPerPage={adminRowsPerPage}
                onPageChange={goToAdminPage}
                onRowsPerPageChange={(n) => {
                  adminProgrammaticScroll.current = true;
                  setAdminRowsPerPage(n);
                  setAdminPage(1);
                  adminScrollRef.current?.scrollTo(0, 0);
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => { adminProgrammaticScroll.current = false; });
                  });
                }}
                rowLabel="Lead"
              />
            </div>
          </>
        ) : (
          /* Leads Analytics tab — real per-agent lead-quality breakdown */
          <div className="space-y-4">
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex flex-wrap items-center justify-end gap-2.5 p-4 border-b border-slate-100">
                <button
                  type="button"
                  onClick={handleExportAnalytics}
                  title="Export as CSV"
                  className="h-10 w-10 shrink-0 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-[#0B1E6E] hover:bg-slate-50 shadow-sm transition-colors"
                >
                  <Download className="h-4.5 w-4.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsColumnsSettingsOpen(true)}
                  title="Filter"
                  className="h-10 w-10 shrink-0 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-[#0B1E6E] hover:bg-slate-50 shadow-sm transition-colors"
                >
                  <Sliders className="h-4.5 w-4.5" />
                </button>

                {/* Date range — the shared calendar, same as the Leads tab but with
                    fully independent state. Applying switches to "custom"; the ×
                    clears back to the default This Month bucket. */}
                <DateRangePicker
                  value={analyticsDateRange === "custom" ? analyticsCustomRange : null}
                  onChange={(range) => {
                    setAnalyticsCustomRange(range);
                    setAnalyticsDateRange(range ? "custom" : "month");
                    setAnalyticsPage(1);
                  }}
                  emptyLabel={DATE_RANGE_OPTIONS.find(o => o.value === analyticsDateRange)?.label ?? "Custom Range"}
                />

                <SearchableMultiSelect
                  options={agentsList}
                  selected={analyticsMemberFilter}
                  onChange={(next) => { setAnalyticsPage(1); setAnalyticsMemberFilter(next); }}
                  placeholder="Member"
                  searchPlaceholder="Search members..."
                  panelWidth={200}
                />

                <SearchableMultiSelect
                  options={analyticsPropertiesList}
                  selected={analyticsPropertyFilter}
                  onChange={(next) => { setAnalyticsPage(1); setAnalyticsPropertyFilter(next); }}
                  placeholder="Property"
                  searchPlaceholder="Search properties..."
                  panelWidth={200}
                />

                {/* Campaigns — grouped by ad platform, same as the Leads tab's own Campaigns dropdown */}
                <SearchableMultiSelect
                  options={analyticsCampaignOptions}
                  selected={analyticsCampaignFilter}
                  onChange={(next) => { setAnalyticsPage(1); setAnalyticsCampaignFilter(next); }}
                  placeholder="Campaigns"
                  searchPlaceholder="Search campaigns..."
                  renderLabel={(l) => <PlatformLabel text={l} />}
                  panelWidth={260}
                  align="right"
                />
              </div>

              {adminAgentBreakdown.length === 0 ? (
                <p className="text-xs text-slate-400 italic p-6">No leads assigned to any agent in this range.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse min-w-[820px]">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-800">
                          <th className="px-4 py-3">
                            {analyticsManagerSearchOpen ? (
                              <div className="flex items-center gap-1">
                                <input
                                  autoFocus
                                  value={analyticsManagerSearch}
                                  onChange={(e) => setAnalyticsManagerSearch(e.target.value)}
                                  onBlur={() => { if (!analyticsManagerSearch) setAnalyticsManagerSearchOpen(false); }}
                                  placeholder="Search manager..."
                                  className="min-w-0 flex-1 bg-white border border-brand-400 rounded-md px-1.5 py-1 text-[11px] font-normal focus:outline-none"
                                />
                                <button
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => { setAnalyticsManagerSearch(""); setAnalyticsManagerSearchOpen(false); }}
                                  className="text-slate-400 hover:text-slate-700 shrink-0"
                                  title="Close search"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                Manager Name
                                <button onClick={() => setAnalyticsManagerSearchOpen(true)} className="text-slate-400 hover:text-brand-700" title="Search">
                                  <Search className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </th>
                          {analyticsVisibleColumns.teamTotal && <th className="px-4 py-3 whitespace-nowrap">Team Total Leads</th>}
                          {analyticsVisibleColumns.total && <th className="px-4 py-3 whitespace-nowrap">Total Leads Assigned</th>}
                          {analyticsVisibleColumns.qualified && <th className="px-4 py-3 whitespace-nowrap">Qualified Leads</th>}
                          {analyticsVisibleColumns.unqualified && <th className="px-4 py-3 whitespace-nowrap">Unqualified Leads</th>}
                          {analyticsVisibleColumns.siteVisits && <th className="px-4 py-3 whitespace-nowrap">Site Visit Leads</th>}
                          {analyticsVisibleColumns.qlPct && <th className="px-4 py-3 whitespace-nowrap">QL&apos;s %age</th>}
                          {analyticsVisibleColumns.ql2svPct && <th className="px-4 py-3 whitespace-nowrap">QL2SV %age</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {isDataLoading && analyticsPageRows.length === 0 ? (
                          <TableRowsSkeleton rows={8} columns={1 + ANALYTICS_COLUMNS.filter(c => analyticsVisibleColumns[c.key]).length} />
                        ) : analyticsPageRows.map(row => {
                          const isExpanded = expandedManagers.has(row.agentName);
                          const visibleColCount = ANALYTICS_COLUMNS.filter(c => analyticsVisibleColumns[c.key]).length;
                          const teamNames = [row.agentName, ...row.directReports.map(d => d.name)];
                          return (
                            <React.Fragment key={row.agentName}>
                              <tr className={`transition-colors ${isExpanded ? "bg-slate-50" : "hover:bg-slate-50/60"}`}>
                                <td className="px-4 py-3 font-bold">
                                  <div className="flex items-center gap-2">
                                    <StatCell
                                      value={row.agentName}
                                      onClick={() => openAnalyticsDrilldown(teamNames, null, `${row.agentName}'s Team — All Leads`)}
                                    />
                                    {row.isManager && (
                                      <button
                                        type="button"
                                        onClick={() => toggleManagerExpand(row.agentName)}
                                        title={isExpanded ? "Collapse team" : "Expand team"}
                                        className="h-4 w-4 shrink-0 flex items-center justify-center rounded-full border border-[#0B1E6E] text-[#0B1E6E] hover:bg-[#0B1E6E]/10 transition-colors"
                                      >
                                        {isExpanded ? <Minus className="h-2.5 w-2.5" /> : <Plus className="h-2.5 w-2.5" />}
                                      </button>
                                    )}
                                  </div>
                                </td>
                                {analyticsVisibleColumns.teamTotal && (
                                  <td className="px-4 py-3 font-semibold">
                                    <StatCell value={row.teamTotal} onClick={() => openAnalyticsDrilldown(teamNames, null, `${row.agentName}'s Team — All Leads`)} />
                                  </td>
                                )}
                                {analyticsVisibleColumns.total && (
                                  <td className="px-4 py-3 font-semibold">
                                    <StatCell value={row.total} onClick={() => openAnalyticsDrilldown([row.agentName], null, `${row.agentName} — All Leads`)} />
                                  </td>
                                )}
                                {analyticsVisibleColumns.qualified && (
                                  <td className="px-4 py-3 font-semibold">
                                    <StatCell value={row.qualified} onClick={() => openAnalyticsDrilldown([row.agentName], QUALIFIED_STATUS_OPTIONS, `${row.agentName} — Qualified Leads`)} />
                                  </td>
                                )}
                                {analyticsVisibleColumns.unqualified && (
                                  <td className="px-4 py-3 font-semibold">
                                    <StatCell value={row.unqualified} onClick={() => openAnalyticsDrilldown([row.agentName], UNQUALIFIED_STATUSES, `${row.agentName} — Unqualified Leads`)} />
                                  </td>
                                )}
                                {analyticsVisibleColumns.siteVisits && (
                                  <td className="px-4 py-3 font-semibold">
                                    <StatCell value={row.siteVisits} onClick={() => openAnalyticsDrilldown([row.agentName], SITE_VISIT_STATUSES, `${row.agentName} — Site Visit Leads`)} />
                                  </td>
                                )}
                                {analyticsVisibleColumns.qlPct && (
                                  <td className="px-4 py-3 font-semibold">
                                    <StatCell value={`${row.qlPct.toFixed(2)}%`} onClick={() => openAnalyticsDrilldown([row.agentName], QUALIFIED_STATUS_OPTIONS, `${row.agentName} — Qualified Leads`)} />
                                  </td>
                                )}
                                {analyticsVisibleColumns.ql2svPct && (
                                  <td className="px-4 py-3 font-semibold">
                                    <StatCell value={`${row.ql2svPct.toFixed(2)}%`} onClick={() => openAnalyticsDrilldown([row.agentName], SITE_VISIT_STATUSES, `${row.agentName} — Site Visit Leads`)} />
                                  </td>
                                )}
                              </tr>
                              {row.isManager && isExpanded && (
                                <tr>
                                  <td colSpan={1 + visibleColCount} className="p-0 bg-slate-50/60">
                                    <div className="px-4 py-3">
                                      {row.directReports.length === 0 ? (
                                        <p className="text-[11px] text-slate-400 italic py-1">No team members reporting to {row.agentName} yet.</p>
                                      ) : (
                                        <PaginatedSubList items={row.directReports} rowLabel="Member">
                                          {(pageRows) => (
                                            <table className="w-full text-left text-[11px] border-collapse">
                                              <thead>
                                                <tr className="border-b border-slate-200 font-bold text-slate-600">
                                                  <th className="py-2 pr-4">Team Member</th>
                                                  {analyticsVisibleColumns.total && <th className="py-2 pr-4">Total Leads Assigned</th>}
                                                  {analyticsVisibleColumns.qualified && <th className="py-2 pr-4">Qualified Leads</th>}
                                                  {analyticsVisibleColumns.unqualified && <th className="py-2 pr-4">Unqualified Leads</th>}
                                                  {analyticsVisibleColumns.siteVisits && <th className="py-2 pr-4">Site Visit Leads</th>}
                                                  {analyticsVisibleColumns.qlPct && <th className="py-2 pr-4">QL&apos;s %age</th>}
                                                  {analyticsVisibleColumns.ql2svPct && <th className="py-2 pr-4">QL2SV %age</th>}
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-100 text-slate-700">
                                                {pageRows.map(member => (
                                                  <tr key={member.name}>
                                                    <td className="py-2 pr-4 font-semibold">
                                                      <StatCell value={member.name} onClick={() => openAnalyticsDrilldown([member.name], null, `${member.name} — All Leads`)} />
                                                    </td>
                                                    {analyticsVisibleColumns.total && (
                                                      <td className="py-2 pr-4">
                                                        <StatCell value={member.total} onClick={() => openAnalyticsDrilldown([member.name], null, `${member.name} — All Leads`)} />
                                                      </td>
                                                    )}
                                                    {analyticsVisibleColumns.qualified && (
                                                      <td className="py-2 pr-4">
                                                        <StatCell value={member.qualified} onClick={() => openAnalyticsDrilldown([member.name], QUALIFIED_STATUS_OPTIONS, `${member.name} — Qualified Leads`)} />
                                                      </td>
                                                    )}
                                                    {analyticsVisibleColumns.unqualified && (
                                                      <td className="py-2 pr-4">
                                                        <StatCell value={member.unqualified} onClick={() => openAnalyticsDrilldown([member.name], UNQUALIFIED_STATUSES, `${member.name} — Unqualified Leads`)} />
                                                      </td>
                                                    )}
                                                    {analyticsVisibleColumns.siteVisits && (
                                                      <td className="py-2 pr-4">
                                                        <StatCell value={member.siteVisits} onClick={() => openAnalyticsDrilldown([member.name], SITE_VISIT_STATUSES, `${member.name} — Site Visit Leads`)} />
                                                      </td>
                                                    )}
                                                    {analyticsVisibleColumns.qlPct && (
                                                      <td className="py-2 pr-4">
                                                        <StatCell value={`${member.qlPct.toFixed(2)}%`} onClick={() => openAnalyticsDrilldown([member.name], QUALIFIED_STATUS_OPTIONS, `${member.name} — Qualified Leads`)} />
                                                      </td>
                                                    )}
                                                    {analyticsVisibleColumns.ql2svPct && (
                                                      <td className="py-2 pr-4">
                                                        <StatCell value={`${member.ql2svPct.toFixed(2)}%`} onClick={() => openAnalyticsDrilldown([member.name], SITE_VISIT_STATUSES, `${member.name} — Site Visit Leads`)} />
                                                      </td>
                                                    )}
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          )}
                                        </PaginatedSubList>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <TablePagination
                    totalRows={adminAgentBreakdown.length}
                    page={analyticsCurrentPage}
                    rowsPerPage={analyticsRowsPerPage}
                    onPageChange={setAnalyticsPage}
                    onRowsPerPageChange={setAnalyticsRowsPerPage}
                    rowLabel="Manager"
                  />
                </>
              )}
            </div>

            {/* Drill-down card — opened by clicking any manager/team-member
                name or number above. Shows the real matching Lead rows right
                here on the Analytics tab (no tab switch), same shape as the
                Leads tab's own table: Lead Name (search), Email, Status
                (live-editable), Assigned To, Date, Notes, Next Call Date,
                Campaign. */}
            {analyticsDrilldown && (
                <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden animate-fade-in">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-extrabold text-slate-900">{analyticsDrilldown.title}</h3>
                    <button
                      type="button"
                      onClick={() => setAnalyticsDrilldown(null)}
                      className="text-slate-400 hover:text-slate-700"
                      title="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {analyticsDrilldownFilteredLeads.length === 0 ? (
                    <p className="text-xs text-slate-400 italic p-6">No leads match this view.</p>
                  ) : (
                    <>
                      <div ref={drilldownScrollRef} onScroll={handleDrilldownTableScroll} className="overflow-auto max-h-[70vh]">
                        <table className="w-full text-left text-xs border-collapse table-fixed min-w-[900px]">
                          <colgroup>
                            <col className="w-[150px]" />
                            <col className="w-[170px]" />
                            <col className="w-[120px]" />
                            <col className="w-[130px]" />
                            <col className="w-[110px]" />
                            <col className="w-[200px]" />
                            <col className="w-[130px]" />
                            <col className="w-[130px]" />
                          </colgroup>
                          <thead className="sticky top-0 z-10 bg-white">
                            <tr className="border-b border-slate-200 font-bold text-slate-800">
                              <th className="px-4 py-2.5">
                                {drilldownSearchOpen ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      autoFocus
                                      value={drilldownSearch}
                                      onChange={(e) => { setDrilldownSearch(e.target.value); setDrilldownPage(1); }}
                                      onBlur={() => { if (!drilldownSearch) setDrilldownSearchOpen(false); }}
                                      placeholder="Search name or phone..."
                                      className="min-w-0 flex-1 bg-white border border-brand-400 rounded-md px-1.5 py-1 text-[11px] font-normal focus:outline-none"
                                    />
                                    <button
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => { setDrilldownSearch(""); setDrilldownSearchOpen(false); }}
                                      className="text-slate-400 hover:text-slate-700 shrink-0"
                                      title="Close search"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    Lead Name
                                    <button onClick={() => setDrilldownSearchOpen(true)} className="text-slate-400 hover:text-brand-700" title="Search">
                                      <Search className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                              </th>
                              <th className="px-4 py-2.5 whitespace-nowrap">Email</th>
                              <th className="px-4 py-2.5 whitespace-nowrap">Status</th>
                              <th className="px-4 py-2.5 whitespace-nowrap">Assigned To</th>
                              <th className="px-4 py-2.5 whitespace-nowrap">Date</th>
                              <th className="px-4 py-2.5 whitespace-nowrap">Notes</th>
                              <th className="px-4 py-2.5 whitespace-nowrap">Next Call Date</th>
                              <th className="px-4 py-2.5 whitespace-nowrap">Campaign</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {isDataLoading && analyticsDrilldownFilteredLeads.length === 0 ? (
                              <TableRowsSkeleton rows={6} columns={8} />
                            ) : (drilldownPageRowRefs.current = [], analyticsDrilldownFilteredLeads.map((l, idx) => (
                              <tr
                                key={l.id}
                                ref={idx % drilldownRowsPerPage === 0 ? (el) => { drilldownPageRowRefs.current[Math.floor(idx / drilldownRowsPerPage)] = el; } : undefined}
                                className="hover:bg-slate-50/60 transition-colors"
                              >
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
                                <td className="px-4 py-3 align-top">
                                  {renderStatusCell(l)}
                                </td>
                                <td className="px-4 py-3 text-slate-700 font-medium align-top truncate" title={l.assignedAgent || "Unassigned"}>{l.assignedAgent || "Unassigned"}</td>
                                <td className="px-4 py-3 text-slate-500 align-top truncate">{adminFormatDateTime(l.createdAtStr)}</td>
                                <td className="px-4 py-3 text-slate-600 truncate align-top" title={adminLatestLogMessage(l)}>{adminLatestLogMessage(l)}</td>
                                <td className="px-4 py-3 text-slate-500 align-top truncate">{adminNextCallDateFor(l.id)}</td>
                                <td className="px-4 py-3 text-slate-700 font-medium align-top truncate" title={l.campaign || l.source || "—"}>
                              <PlatformLabel text={l.campaign || l.source || "—"} classifyBy={l.source || l.campaign} />
                            </td>
                              </tr>
                            )))}
                          </tbody>
                        </table>
                      </div>

                      <TablePagination
                        totalRows={analyticsDrilldownFilteredLeads.length}
                        page={drilldownCurrentPage}
                        rowsPerPage={drilldownRowsPerPage}
                        onPageChange={goToDrilldownPage}
                        onRowsPerPageChange={(n) => {
                          drilldownProgrammaticScroll.current = true;
                          setDrilldownRowsPerPage(n);
                          setDrilldownPage(1);
                          drilldownScrollRef.current?.scrollTo(0, 0);
                          requestAnimationFrame(() => {
                            requestAnimationFrame(() => { drilldownProgrammaticScroll.current = false; });
                          });
                        }}
                        rowsPerPageOptions={[8, 25, 50, 100]}
                        rowLabel="Lead"
                      />
                    </>
                  )}
                </div>
            )}

            {/* RNR Analysis — Total Leads and Date are real; the two call-attempt
                averages and AI Notes have no data source anywhere in this app
                yet (see comment on rnrLeads above), so they honestly show "—". */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-sm font-extrabold text-slate-900">RNR Analysis</h3>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={rnrSearch}
                    onChange={(e) => setRnrSearch(e.target.value)}
                    placeholder="Lead Name"
                    className="pl-8 pr-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#0B1E6E] w-40"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-800">
                      <th className="px-4 py-2.5 whitespace-nowrap">Total Leads</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">Avg Call Back Initiation<br />Per Lead / Day</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">Avg Calling Per Lead<br />before dead</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">Date</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">AI Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    <tr>
                      <td className="px-4 py-3 font-bold">{isDataLoading ? <LineSkeleton width={24} height={14} /> : rnrLeads.length}</td>
                      <td className="px-4 py-3 text-slate-400 italic" title="Needs a per-call attempt log (timestamped per call, per lead) — not tracked yet">—</td>
                      <td className="px-4 py-3 text-slate-400 italic" title="Needs a per-call attempt log tied to when a lead is marked Dead — not tracked yet">—</td>
                      <td className="px-4 py-3">{rnrMostRecentActivity ? adminFormatDateTime(rnrMostRecentActivity) : "—"}</td>
                      <td className="px-4 py-3 text-slate-400 italic" title="Needs an AI-analysis pipeline — not built yet">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
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

        {/* Assign/Reshuffle Leads modal — same as Data Calling: Property must
            be picked before Assignee unlocks (it scopes who's eligible), and
            confirm stays disabled until both hold a value. The assignee list
            never includes the person reassigning, and a Manager only sees
            their own direct reports (lib/leadAssignment.ts). */}
        {canBulkAssign && assignFlowMode && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/40" onClick={() => setAssignFlowMode(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                <h3 className="text-xl font-extrabold text-slate-900">
                  {assignFlowMode === "reshuffle" ? "Reshuffle Leads" : "Assign Leads"}
                </h3>
              </div>
              <div className="px-6 py-5 space-y-5">
                <p className="text-xs text-slate-500">
                  {assignFlowMode === "reshuffle"
                    ? `Reshuffling ${flowTargetLeads.length} assigned lead${flowTargetLeads.length === 1 ? "" : "s"}.`
                    : `Assigning ${flowTargetLeads.length} unassigned lead${flowTargetLeads.length === 1 ? "" : "s"}.`}
                </p>

                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-slate-800">Select Property</label>
                  <SearchableMultiSelect
                    variant="field"
                    selected={Array.from(assignPropertyIds)}
                    onChange={(ids) => { setAssignPropertyIds(new Set(ids)); setAssignAssigneeId(""); }}
                    options={properties.map(p => ({ value: p.id, label: p.name }))}
                    placeholder="Select property"
                    searchPlaceholder="Search property..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-slate-800">
                    {assignFlowMode === "reshuffle" ? "Select Reshuffle Assignee" : "Select Assignee"}
                  </label>
                  <SearchableSelect
                    value={assignAssigneeId}
                    onChange={setAssignAssigneeId}
                    options={assigneeOptions.map(u => ({ value: u.id, label: u.name }))}
                    disabled={assignPropertyIds.size === 0}
                    placeholder="Select Member"
                    searchPlaceholder="Search assignee..."
                  />
                  {assignPropertyIds.size > 0 && assigneeOptions.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic">
                      {isAdmin ? "No eligible members for the selected properties." : "None of your direct reports are eligible for the selected properties."}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAssignFlowMode(null)}
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

        <LeadDetailDrawer
          lead={selectedLead}
          isOpen={selectedLead !== null}
          onClose={() => setSelectedLead(null)}
          onUpdateStatus={handleUpdateLeadStatus}
        />

        {/* Filter panel (column visibility) — opened from both the Leads
            tab's own Filter button and the Leads Analytics tab's sliders
            icon, since it's the same underlying table-column state. Both
            roles get the full-height right-docked drawer (same pattern as
            the lead quick-view drawer elsewhere in this app): no dark
            backdrop, the rest of the page stays visible, closes on an
            invisible click-outside catcher. A Sales Member/Manager never
            reaches the Leads Analytics tab, so their version only ever
            needs the Leads columns — and renders each one as a bordered
            box with a navy left accent (the admin Campaigns page's Filter
            drawer style) instead of admin's plain left-strip buttons. */}
        {isColumnsSettingsOpen && (isAdmin ? createPortal(
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
                    onClick={adminTab === "analytics" ? toggleSelectAllAnalyticsColumns : toggleSelectAllAdminColumns}
                    className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-[#0B1E6E]"
                  >
                    <Minus className="h-3 w-3" />
                    Select All
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {adminTab === "analytics"
                    ? ANALYTICS_COLUMNS.map(c => {
                        const isOn = analyticsVisibleColumns[c.key];
                        return (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => toggleAnalyticsColumn(c.key)}
                            className={`text-left pl-2.5 py-2 text-xs transition-colors truncate ${
                              isOn
                                ? "border-l-[3px] border-[#0B1E6E] font-extrabold text-slate-900"
                                : "border-l-[3px] border-transparent font-semibold text-slate-400 hover:text-slate-600"
                            }`}
                          >
                            {c.label}
                          </button>
                        );
                      })
                    : ADMIN_COLUMNS.map(c => {
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
        ) : (
          createPortal(
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
                      onClick={toggleSelectAllAdminColumns}
                      className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-[#0B1E6E]"
                    >
                      <Minus className="h-3 w-3" />
                      Select All
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {ADMIN_COLUMNS.filter(c => c.key !== "campaign").map(c => {
                      const isOn = adminVisibleColumns[c.key];
                      return (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => toggleAdminColumn(c.key)}
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
          )
        ))}
      </div>
    );
}
