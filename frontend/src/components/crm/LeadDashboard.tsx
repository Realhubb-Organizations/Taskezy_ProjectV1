"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp, Lead, LeadStatus, FollowupCall, mapApiLeadToFrontendLead, mapApiFollowupToFrontend } from "@/context/AppContext";
import { useDialog } from "@/components/ui/DialogProvider";
import { Sliders, Sparkles, Plus, Check, ChevronDown, Search, X, Minus, Download, RotateCcw, Users, Trash2, AlertTriangle } from "lucide-react";
import { STATUS_OPTIONS, PICKABLE_STATUS_OPTIONS, frontendStatusToDbCode, withDeadLeadGate } from "@/lib/leadStatusMapping";
import { type LeadSummaryStats } from "@/lib/leadSummaryStats";
import { apiListLeadsPage, apiGetLead, apiGetLeadStats, apiGetLeadAnalyticsStats, apiGetDistinctCampaigns, apiListFollowupsPage, apiDeleteLead, apiBulkDeleteLeads, apiBulkReassignLeads, type LeadListFilters, type AgentAnalyticsStats } from "@/lib/apiClient";
import { useServerLeadList } from "@/lib/useServerLeadList";
import { PlatformLabel } from "@/components/icons/ContactIcons";
import { isPhoneLayout } from "@/lib/viewport";
import { canTriggerLeadCall, triggerLeadCall, triggerLeadWhatsApp } from "@/lib/callTrigger";
import { LineSkeleton, TableRowsSkeleton } from "@/components/ui/Skeletons";
import Tooltip from "@/components/ui/Tooltip";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/SearchableDropdown";
import { canChangeLeadStatus, canUploadLeads, eligibleAssignees, isUnassignedLead, uploadAssignableUsers, STATUS_LOCKED_HINT } from "@/lib/leadAssignment";
import DateRangePicker, { type DateRangeValue, todayIso } from "@/components/ui/DateRangePicker";
import DateRangeSelect from "@/components/ui/DateRangeSelect";
import TablePagination, { usePagination } from "@/components/ui/TablePagination";
import AddLeadModal from "./AddLeadModal";
import LeadDetailDrawer from "./LeadDetailDrawer";
import LeadDrillDownPanel from "./LeadDrillDownPanel";
import LeadScheduleModal from "./LeadScheduleModal";
import { useLeadStatusScheduler } from "@/lib/leadScheduler";
import { DateTimeLines, dateTimeParts } from "@/components/ui/DateTimeLines";
import { nextFollowupFor } from "@/lib/followups";
import NextCallCell from "./NextCallCell";
import LeadNoteCell from "./LeadNoteCell";
import LeadRowActionsMenu from "./LeadRowActionsMenu";
import { maskPhone, maskEmail } from "@/lib/maskPII";

// The admin leads table's togglable columns (beyond the always-shown Lead
// Name/Email/Assigned To) — driven by the Filter panel's Settings modal.
// "Ad Set Name" and "Property Match" have no real backing field on Lead yet
// (no ad-set-level ingestion, no property-match scoring anywhere in the app),
// so their cells honestly render "—" for every row rather than inventing data.
type AdminColumnKey =
  | "email" | "assignedTo"
  | "date" | "property" | "reassignedTo" | "source"
  | "status" | "nextCallDate" | "actions" | "adSetName" | "campaign"
  | "notes" | "propertyMatch";

const ADMIN_COLUMNS: { key: AdminColumnKey; label: string; width: number }[] = [
  { key: "email", label: "Email", width: 180 },
  { key: "assignedTo", label: "Assigned To", width: 160 },
  { key: "date", label: "Date", width: 130 },
  { key: "property", label: "Property", width: 170 },
  { key: "reassignedTo", label: "Reassign From", width: 160 },
  { key: "source", label: "Source", width: 170 },
  { key: "status", label: "Status", width: 150 },
  { key: "nextCallDate", label: "Next Call Date", width: 130 },
  { key: "actions", label: "Actions", width: 120 },
  { key: "adSetName", label: "Ad Set Name", width: 170 },
  { key: "campaign", label: "Campaign", width: 170 },
  { key: "notes", label: "Notes", width: 240 },
  { key: "propertyMatch", label: "Property Match", width: 140 }
];

const ADMIN_DEFAULT_VISIBLE_COLUMNS: Record<AdminColumnKey, boolean> = {
  email: true, assignedTo: true,
  date: true, property: false, reassignedTo: false, source: false,
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
const UNQUALIFIED_STATUSES: LeadStatus[] = ["RNR", "Low Budget", "Dead Lead", "Not Interested"];
const SITE_VISIT_STATUSES: LeadStatus[] = ["Site Visit Scheduled", "Site Visit Done"];

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
    reassignLead,
    isDataLoading,
    leadsChangedSignal,
    removeLeadsLocally,
    recordCallEnded,
    recordWhatsAppOpened
  } = useApp();
  const { toast, prompt: promptDialog } = useDialog();

  const router = useRouter();
  const searchParams = useSearchParams();

  // Drawer / Modals State
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // Deep-link support: notifications route here with ?openLead=<id> to jump
  // straight to a lead — fetched directly by id (a 404 means deleted or no
  // longer visible to this user, same silent-no-op as before) instead of
  // scanning the bulk leads array.
  useEffect(() => {
    const openLeadId = searchParams.get("openLead");
    if (openLeadId) {
      apiGetLead(openLeadId)
        .then(row => setSelectedLead(mapApiLeadToFrontendLead(row)))
        .catch(() => { /* not found / not visible to this user — no-op, same as before */ });
      router.replace("/dashboard/crm");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Scoping check: is the current user a Sales Member?
  const isSalesMember = currentUser?.role_type === "Member" && currentUser?.role !== "ADMIN";
  const isManager = currentUser?.role_type === "Manager" && currentUser?.role !== "ADMIN";
  // Admin-only UI within the (now shared) Leads console — the top Campaigns
  // quick-filter stays admin-exclusive; a Sales Member gets the same Leads
  // table and stat bar without it.
  const isAdmin = currentUser?.role === "ADMIN";
  const callAllowed = canTriggerLeadCall(isAdmin, currentUser?.email);
  const handleCall = (lead: Lead) => {
    triggerLeadCall(lead, {
      isAdmin,
      userEmail: currentUser?.email,
      toast,
      onCallEnded: (leadId, startedAt, durationSeconds) => {
        recordCallEnded(leadId, startedAt, durationSeconds).catch((err) =>
          console.warn("Could not record call feedback gate:", err)
        );
      }
    });
  };
  const handleWhatsApp = (lead: Lead) => {
    triggerLeadWhatsApp(lead, {
      isAdmin,
      onReturn: (leadId) => {
        recordWhatsAppOpened(leadId).catch((err) => console.warn("Could not record WhatsApp feedback gate:", err));
      }
    });
  };
  // The Leads Analytics tab (and its "View Detailed Analytics" links) is
  // the one piece of this admin-only UI a Manager also gets — now safe to
  // show, since (2026-10-09) a Manager's `scopedLeads` below is restricted
  // to their own team, same as everywhere else on this page: the breakdown
  // can't expose any lead a Manager couldn't already see on the plain
  // Leads tab. See project_crm_role_based_lead_scoping memory.
  const canViewLeadsAnalytics = isAdmin || currentUser?.role_type === "Manager";
  // Bulk select + Assign/Reshuffle (same workflow as Data Calling) — Admin
  // and Manager only; who they can pick is scoped in lib/leadAssignment.ts.
  const canBulkAssign = isAdmin || currentUser?.role_type === "Manager";

  // Data scoping based on role. The backend's own GET /api/v1/leads already
  // restricts what a sales Member/Manager's session ever receives (see
  // leads.service.ts's scopeForCaller) — this client-side pass is a second,
  // defense-in-depth layer (and covers any locally-seeded/demo leads that
  // never went through that endpoint), not the real security boundary.
  const myTeamNames = isManager && currentUser
    ? new Set([currentUser.name, ...users.filter(u => u.managerId === currentUser.id).map(u => u.name)])
    : null;
  const scopedLeads = leads.filter(l => {
    if (isSalesMember) {
      return l.assignedAgent.toLowerCase() === currentUser?.name.toLowerCase();
    }
    if (myTeamNames) {
      return myTeamNames.has(l.assignedAgent);
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
  // A manager only ever deals with themselves and their direct reports, so
  // every agent picker/filter on this page (Assigned To, analytics Member,
  // per-agent rows) is limited to that team for them.
  const agentsList = users
    .filter(u => u.department === "SALES" && u.status !== "INACTIVE")
    .filter(u => !myTeamNames || myTeamNames.has(u.name))
    .map(u => u.name);

  const handleUpdateLeadStatus = async (leadId: string, status: LeadStatus) => {
    // Booking a lead auto-generates a real invoice using this deal value as
    // the base amount (see AppContext's updateLeadStatus) — a real value is
    // required here, not a hardcoded ₹5,00,000 regardless of the actual deal.
    if (status === "Booked") {
      const input = await promptDialog({
        title: "Enter deal value",
        message: "Enter the real deal value for this booking (INR):",
        label: "Deal value (INR)",
        confirmLabel: "Mark as Booked"
      });
      const dealValue = input ? parseFloat(input.replace(/[^0-9.]/g, "")) : NaN;
      if (!input || isNaN(dealValue) || dealValue <= 0) {
        toast("A valid deal value is required to mark a lead as Booked.", "warning");
        return;
      }
      updateLeadStatus(leadId, status, dealValue);
      setServerLeads(prev => prev.map(l => (l.id === leadId ? { ...l, status, dealValue } : l)));
    } else {
      updateLeadStatus(leadId, status);
      setServerLeads(prev => prev.map(l => (l.id === leadId ? { ...l, status } : l)));
    }

    // Update local drawer state if active
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead(prev => prev ? { ...prev, status } : null);
    }

    setSuccessMsg(`Status updated to: ${status}`);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  // RNR/Call Back/Followup/Site Visit Scheduled are gated behind a
  // blocking popup (LeadScheduleModal below) before handleUpdateLeadStatus
  // actually runs — every other status still commits immediately.
  const statusScheduler = useLeadStatusScheduler(handleUpdateLeadStatus);

  // Per-row Status editor cell — the shared searchable single-select (the
  // full status list runs ~18 options deep). Shared by the main Leads table
  // and the Analytics drilldown table.
  // Clicking anywhere on a row opens the lead, except on the row's own controls
  // (checkbox, status dropdown, WhatsApp/Call/Delete) or while selecting text.
  // React events from portaled dropdown panels still bubble here, so anything
  // outside the row's own DOM is ignored too.
  const handleLeadRowClick = (e: React.MouseEvent<HTMLTableRowElement>, lead: Lead) => {
    const target = e.target as HTMLElement;
    if (!e.currentTarget.contains(target)) return;
    if (target.closest("button, a, input, select, textarea, label, [role='button'], [role='combobox'], [role='listbox']")) return;
    if (window.getSelection()?.toString()) return;
    setSelectedLead(lead);
  };

  const renderStatusCell = (l: Lead) => {
    // Owner, the owner's manager (their team's leads) or an admin — same
    // rule the server enforces; every change lands in Activity History.
    if (!canChangeLeadStatus(l, currentUser, users)) {
      return <span className={phoneLayout ? "inline-block rounded-xl bg-slate-100 px-2 py-1.5 text-[11px] font-semibold text-slate-600" : "inline-block max-w-[110px] text-[11px] text-slate-700"} title={STATUS_LOCKED_HINT}>{l.status}</span>;
    }
    const allOptions = PICKABLE_STATUS_OPTIONS.includes(l.status) ? PICKABLE_STATUS_OPTIONS : [l.status, ...PICKABLE_STATUS_OPTIONS];
    return (
      <SearchableSelect
        variant="inline"
        options={withDeadLeadGate(allOptions, l, isAdmin)}
        value={l.status}
        onChange={(v) => statusScheduler.requestChange(l, v as LeadStatus)}
        searchPlaceholder="Search status..."
        panelWidth={176}
        className={phoneLayout ? "max-w-full rounded-xl bg-blue-50 px-2 py-1.5 text-[11px] font-semibold text-blue-600 [&_svg]:h-3 [&_svg]:w-3" : "max-w-[110px] text-[11px] text-slate-700"}
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
      toast(`Ingestion failed: ${res.error}`, "error");
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
    toast("Bulk import isn't wired up to a real backend yet — please use Manual Ingestion Entry for now.", "info");
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
  // Opens on All Time so Total Leads shows every lead (narrow with the picker).
  const [adminDateRange, setAdminDateRange] = useState<"today" | "yesterday" | "week" | "month" | "all" | "custom">("all");
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
  // Property column-header filter (by name; sent to the server as ids).
  const [adminPropertyFilter, setAdminPropertyFilter] = useState<string[]>([]);
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
  // Bumped after a delete to re-run the list + stats fetch with unchanged filters.
  const [leadsRefreshKey, setLeadsRefreshKey] = useState(0);
  // Search fires on every keystroke locally but is debounced before it
  // becomes a real network request — otherwise every character typed would
  // fire its own full server round trip.
  const [debouncedAdminSearch, setDebouncedAdminSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAdminSearch(adminSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [adminSearch]);

  // Plain YYYY-MM-DD bounds for whichever date-range preset is active —
  // the server does the actual comparison, this just emits the dates.
  // Shared by the admin Leads tab's own date range and the Analytics tab's
  // (called directly with analyticsDateRange/analyticsCustomRange below) —
  // same preset semantics, different state.
  const dateRangeToServerBounds = (
    range: "today" | "yesterday" | "week" | "month" | "all" | "custom",
    customRange: { start: string; end: string } | null,
    refNow: Date
  ): { dateFrom?: string; dateTo?: string } => {
    const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (range === "all") return {};
    const startOfToday = new Date(refNow.getFullYear(), refNow.getMonth(), refNow.getDate());
    if (range === "today") return { dateFrom: toYMD(startOfToday), dateTo: toYMD(startOfToday) };
    if (range === "yesterday") {
      const y = new Date(startOfToday);
      y.setDate(y.getDate() - 1);
      return { dateFrom: toYMD(y), dateTo: toYMD(y) };
    }
    if (range === "week") {
      const weekAgo = new Date(startOfToday);
      weekAgo.setDate(weekAgo.getDate() - 6);
      return { dateFrom: toYMD(weekAgo), dateTo: toYMD(startOfToday) };
    }
    if (range === "custom") {
      if (!customRange) return {};
      return { dateFrom: customRange.start.split("T")[0], dateTo: customRange.end.split("T")[0] };
    }
    // month
    const monthStart = new Date(refNow.getFullYear(), refNow.getMonth(), 1);
    const monthEnd = new Date(refNow.getFullYear(), refNow.getMonth() + 1, 0);
    return { dateFrom: toYMD(monthStart), dateTo: toYMD(monthEnd) };
  };
  const adminServerDateBounds = (): { dateFrom?: string; dateTo?: string } =>
    dateRangeToServerBounds(adminDateRange, adminCustomRange, today);

  // Non-admin's stat-card quick-filter (adminMetric) maps onto the same
  // server status filter rather than a separate client-side predicate — see
  // adminMetricPredicate below for the equivalent labels.
  const ADMIN_METRIC_TO_STATUS: Record<string, LeadStatus> = {
    new: "New Lead", rnr: "RNR", callbacks: "Call Back", followups: "Followup",
    sitevisit_sched: "Site Visit Scheduled", sitevisit_done: "Site Visit Done"
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
    if (adminAssignedFilter.includes("Unassigned")) statusCodes.add("UNASSIGNED");
    const nameToId = new Map(users.map(u => [u.name, u.id] as const));
    const assignedAgentIds = adminAssignedFilter
      .map(name => nameToId.get(name))
      .filter((id): id is string => !!id);
    const propertyIds = properties.filter(p => adminPropertyFilter.includes(p.name)).map(p => p.id);
    return {
      status: statusCodes.size > 0 ? Array.from(statusCodes) : undefined,
      assignedAgentId: assignedAgentIds.length > 0 ? assignedAgentIds : undefined,
      campaign: adminCampaignFilter.length > 0 ? adminCampaignFilter : undefined,
      propertyId: propertyIds.length > 0 ? propertyIds : undefined,
      dateFrom,
      dateTo,
      search: debouncedAdminSearch || undefined,
      // Data Calling leads stay on the Data Calling page until qualified.
      excludeBulkUpload: true
    };
  };

  const adminServerFiltersKey = JSON.stringify(buildAdminServerFilters());

  useEffect(() => {
    if (adminTab !== "leads") return;
    let cancelled = false;
    setServerLeadsLoading(true);
    const filters = buildAdminServerFilters();
    // Wait a moment before loading, so ticking several campaigns/statuses in
    // a row sends one request pair for the final selection instead of a
    // burst (which on phones could trip the rate limit / drop the connection).
    const timer = setTimeout(() => {
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
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // adminServerFiltersKey captures every filter input in one stable string
    // so this effect re-fires exactly when a real filter value changes,
    // without needing every individual filter piece listed separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminTab, adminPage, adminRowsPerPage, adminServerFiltersKey, leadsRefreshKey, leadsChangedSignal]);

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
  // Real server rows for the clicked manager/agent's number (status codes +
  // the Analytics toolbar's own date/property/campaign/member filters) —
  // discrete page-by-page pagination (same pattern as LeadDrillDownPanel),
  // not the old continuous scroll-spy, which needed every row mounted at
  // once and risked undercounting a busy agent/team's real total.
  const [analyticsDrilldown, setAnalyticsDrilldown] = useState<{ title: string; baseFilters: LeadListFilters } | null>(null);
  const [drilldownSearchOpen, setDrilldownSearchOpen] = useState(false);

  const openAnalyticsDrilldown = (assignedNames: string[], statusScope: LeadStatus[] | null, title: string) => {
    const effectiveNames = analyticsMemberFilter.length > 0 ? assignedNames.filter(n => analyticsMemberFilter.includes(n)) : assignedNames;
    const assignedAgentId = users.filter(u => effectiveNames.includes(u.name)).map(u => u.id);
    const propertyId = properties.filter(p => analyticsPropertyFilter.includes(p.name)).map(p => p.id);
    const status = statusScope ? statusScope.map(s => frontendStatusToDbCode(s)).filter((c): c is string => !!c) : undefined;
    setAnalyticsDrilldown({
      title,
      baseFilters: {
        assignedAgentId,
        propertyId: propertyId.length > 0 ? propertyId : undefined,
        campaign: analyticsCampaignFilter.length > 0 ? analyticsCampaignFilter : undefined,
        status,
        ...dateRangeToServerBounds(analyticsDateRange, analyticsCustomRange, today)
      }
    });
    setDrilldownSearchOpen(false);
  };

  const {
    rows: analyticsDrilldownRows,
    totalCount: analyticsDrilldownTotal,
    loading: analyticsDrilldownLoading,
    search: drilldownSearch,
    setSearch: setDrilldownSearch,
    paginationProps: analyticsDrilldownPaginationProps
  } = useServerLeadList(analyticsDrilldown?.baseFilters ?? {}, 8);

  // Real next-scheduled-call date for the Analytics drill-down's current
  // page only, fetched by lead id — not the whole company's follow-up
  // table (same pattern as data-calling/page.tsx and LeadDrillDownPanel.tsx).
  const [analyticsDrillPageFollowups, setAnalyticsDrillPageFollowups] = useState<FollowupCall[]>([]);
  const analyticsDrillPageLeadIds = analyticsDrilldownRows.map(l => l.id).join(",");
  useEffect(() => {
    if (!analyticsDrillPageLeadIds) { setAnalyticsDrillPageFollowups([]); return; }
    let cancelled = false;
    apiListFollowupsPage(1, 500, { leadId: analyticsDrillPageLeadIds.split(",") })
      .then(({ rows }) => { if (!cancelled) setAnalyticsDrillPageFollowups(rows.map(mapApiFollowupToFrontend)); })
      .catch(() => { if (!cancelled) setAnalyticsDrillPageFollowups([]); });
    return () => { cancelled = true; };
  }, [analyticsDrillPageLeadIds]);

  const QUALIFIED_STATUS_OPTIONS = STATUS_OPTIONS.filter(s => !UNQUALIFIED_STATUSES.includes(s));

  // Manager/Member actually work this table by calling/WhatsApping leads
  // straight from the row, so the Actions column starts visible for them
  // instead of buried behind the Filter panel. Admin's default is
  // untouched. See project_crm_role_based_lead_scoping memory (2026-10-10).
  // Managers also start with the Source column on (logo only — see canSeeSource).
  // Phones / the app start with just Status, Actions and Notes beside the
  // lead name (in that order); the Filter panel turns the rest back on.
  const [adminVisibleColumns, setAdminVisibleColumns] = useState<Record<AdminColumnKey, boolean>>(() => {
    if (isPhoneLayout()) {
      const none = Object.fromEntries(ADMIN_COLUMNS.map(c => [c.key, false])) as Record<AdminColumnKey, boolean>;
      return { ...none, status: true, actions: true, notes: true };
    }
    return isAdmin ? ADMIN_DEFAULT_VISIBLE_COLUMNS : { ...ADMIN_DEFAULT_VISIBLE_COLUMNS, actions: true, source: isManager };
  });

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
  // Campaign/Source/Ad Set Name are Admin-only columns (ad-source
  // attribution) — never offered or rendered for Manager/Member, on this
  // list or in the header/cell checks below. See
  // project_crm_role_based_lead_scoping memory (2026-10-09).
  // Exception: managers get Source (the platform logo — Meta, Google, or the
  // Excel icon for Data Calling / bulk uploads), never the campaign name.
  const canSeeSource = isAdmin || isManager;
  const [phoneLayout] = useState(isPhoneLayout);
  // Bulk select is a laptop task; the phone table matches the 4-column design.
  const showBulkSelect = canBulkAssign && !phoneLayout;
  const adminVisibleColumnList = ADMIN_COLUMNS.filter(c => adminVisibleColumns[c.key] && (isAdmin || !["campaign", "adSetName"].includes(c.key)) && (c.key !== "source" || canSeeSource));

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

  const adminSortedLogs = (l: Lead) => [...(l.logs || [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const adminFormatDateTime = (iso: string | undefined): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  // Real counts from the server (same filters as the table itself), not a
  // computation over the full in-memory array — see the serverStats fetch
  // effect above. The admin drill-down panel below (adminDrillMetric) now
  // fetches its own rows from the server too (adminDrillBaseFilters).
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

  // Admin drill-down panel's own filters — same status codes/date-range/
  // campaign the server-side stats above are grouped from (ADMIN_METRIC_TO_
  // STATUS, already used for the non-admin quick-filter), so the panel
  // always matches whichever card was clicked.
  const adminDrillBaseFilters: LeadListFilters = {
    ...adminServerDateBounds(),
    status: adminDrillMetric && adminDrillMetric !== "total"
      ? (() => { const code = frontendStatusToDbCode(ADMIN_METRIC_TO_STATUS[adminDrillMetric]); return code ? [code] : undefined; })()
      : undefined,
    campaign: adminCampaignFilter.length > 0 ? adminCampaignFilter : undefined
  };

  // Real distinct campaign names (server-scoped the same way scopedLeads
  // was client-side) — shared by this tab's own Campaigns dropdown and the
  // Analytics tab's identical one below, fetched once instead of scanning
  // the bulk leads array twice.
  const [distinctCampaigns, setDistinctCampaigns] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiGetDistinctCampaigns({})
      .then(result => { if (!cancelled) setDistinctCampaigns(result); })
      .catch(() => { if (!cancelled) setDistinctCampaigns([]); });
    return () => { cancelled = true; };
  }, []);
  const adminCampaignsList = distinctCampaigns;
  // "Unassigned" (leads nobody owns yet) lives here, not under Status.
  const UNASSIGNED_OPTION = "Unassigned";
  // Unassigned leads are outside a manager's scope, so they don't get that option.
  const adminAssignedOptions = isManager ? agentsList : [UNASSIGNED_OPTION, ...agentsList];

  // Same ad-source keyword classification used by the Meta/Google sub-account
  // breakdown above (source="Meta Ads"/"Google Ads") — reused here to split
  // the real campaign list by platform for the grouped Campaigns dropdown.
  // Used to also check the matching lead's own `source` field for a second
  // signal, but that required scanning the bulk leads array for a lookup —
  // name-only keyword matching only, now that leads aren't loaded in bulk.
  const classifyCampaignPlatform = (campaign: string): "Meta" | "Google" | "Other" => {
    if (/meta|facebook|instagram/i.test(campaign)) return "Meta";
    if (/google/i.test(campaign)) return "Google";
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

  // Real next-scheduled-call date for just this table's current page, by
  // lead id — not the whole company's follow-up table (same pattern as
  // data-calling/page.tsx and LeadDrillDownPanel.tsx).
  const [adminPageFollowups, setAdminPageFollowups] = useState<FollowupCall[]>([]);
  const adminPageLeadIds = adminFilteredLeads.map(l => l.id).join(",");
  useEffect(() => {
    if (!adminPageLeadIds) { setAdminPageFollowups([]); return; }
    let cancelled = false;
    apiListFollowupsPage(1, 500, { leadId: adminPageLeadIds.split(",") })
      .then(({ rows }) => { if (!cancelled) setAdminPageFollowups(rows.map(mapApiFollowupToFrontend)); })
      .catch(() => { if (!cancelled) setAdminPageFollowups([]); });
    return () => { cancelled = true; };
  }, [adminPageLeadIds]);
  const adminNextCallDateFor = (leadId: string) => nextFollowupFor(leadId, adminPageFollowups);

  // ---- Bulk Assign / Reshuffle (Admin + Manager) ----
  // "Assign" appears once the selection holds an unassigned lead, "Reshuffle"
  // once it holds an already-assigned one — same split as Data Calling.
  // Keyed by id, holding the selected table rows themselves, so Assign/
  // Reshuffle work on exactly the leads that were ticked (on any page).
  const [selectedLeads, setSelectedLeads] = useState<Map<string, Lead>>(new Map());
  const toggleLeadSelection = (lead: Lead) => setSelectedLeads(prev => {
    const next = new Map(prev);
    if (next.has(lead.id)) next.delete(lead.id); else next.set(lead.id, lead);
    return next;
  });
  const clearSelected = (ids: string[]) => setSelectedLeads(prev => {
    const next = new Map(prev);
    ids.forEach(id => next.delete(id));
    return next;
  });
  // serverLeads already *is* the current page — no slicing needed anymore.
  const currentPageLeads = serverLeads;
  const allOnPageSelected = currentPageLeads.length > 0 && currentPageLeads.every(l => selectedLeads.has(l.id));
  const toggleSelectAllOnPage = () => setSelectedLeads(prev => {
    const next = new Map(prev);
    if (allOnPageSelected) currentPageLeads.forEach(l => next.delete(l.id));
    else currentPageLeads.forEach(l => next.set(l.id, l));
    return next;
  });
  const selectedLeadList = Array.from(selectedLeads.values());
  const selectedUnassignedLeads = selectedLeadList.filter(l => isUnassignedLead(l));
  const selectedAssignedLeads = selectedLeadList.filter(l => !isUnassignedLead(l));

  const [assignFlowMode, setAssignFlowMode] = useState<"assign" | "reshuffle" | null>(null);
  const [assignPropertyIds, setAssignPropertyIds] = useState<Set<string>>(new Set());
  const [assignAssigneeId, setAssignAssigneeId] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const flowTargetLeads = assignFlowMode === "reshuffle" ? selectedAssignedLeads : selectedUnassignedLeads;
  const assigneeOptions = eligibleAssignees({
    users,
    properties,
    selectedPropertyIds: assignPropertyIds,
    caller: currentUser,
    targetLeads: flowTargetLeads
  });
  const canConfirmAssign = assignPropertyIds.size > 0 && !!assignAssigneeId && assigneeOptions.some(u => u.id === assignAssigneeId) && assignNote.trim().length > 0;

  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignError, setAssignError] = useState("");

  // Notes column pencil saved a note: patch the table's own copy of the row.
  const handleNoteSaved = (leadId: string, note: string, updated: Lead | null) => {
    setServerLeads(prev => prev.map(r => (r.id === leadId ? (updated ? { ...r, ...updated } : { ...r, notes: note }) : r)));
  };

  const openAssignFlow = (mode: "assign" | "reshuffle") => {
    setAssignNote("");
    setAssignPropertyIds(new Set());
    setAssignAssigneeId("");
    setAssignError("");
    setAssignFlowMode(mode);
  };
  const closeAssignFlow = () => { if (!assignSubmitting) setAssignFlowMode(null); };
  // Queued server-side (POST /leads/bulk-reassign — see Taskezy-Server's
  // jobs/queue.ts bulk-reassign-leads worker) instead of a client-side
  // Promise.allSettled fan-out: that was still N concurrent requests for a
  // large selection, with no server-side record of how many went through.
  // "Already assigned to this agent" / UNASSIGNED->NEW_LEAD promotion are
  // both handled inside leads.service.ts's bulkReassignLeads now, so they
  // don't need their own pre-filter or second call here. Every moved lead
  // still broadcasts leads-changed same as before, picked up by AppContext's
  // existing per-lead refetch listener without an explicit refetch here.
  const confirmBulkAssign = async () => {
    const assignee = users.find(u => u.id === assignAssigneeId);
    if (!canConfirmAssign || !assignFlowMode || !assignee || assignSubmitting) return;
    const mode = assignFlowMode;
    const targetLeads = flowTargetLeads;

    setAssignSubmitting(true);
    setAssignError("");
    try {
      const result = await apiBulkReassignLeads(targetLeads.map(l => l.id), assignee.id, assignNote.trim());
      clearSelected(targetLeads.map(l => l.id));
      if (result.moved > 0) setLeadsRefreshKey(k => k + 1);

      if (result.failed.length > 0) {
        setAssignError(
          `${result.moved > 0 ? `${result.moved} lead${result.moved === 1 ? "" : "s"} moved, but ` : ""}` +
          `${result.failed.length} could not be ${mode === "reshuffle" ? "reshuffled" : "assigned"}: ${result.failed[0].reason}`
        );
        return;
      }
      setAssignFlowMode(null);
      setSuccessMsg(
        `${mode === "reshuffle" ? "Reshuffled" : "Assigned"} ${result.moved} lead${result.moved === 1 ? "" : "s"} to ${assignee.name}` +
        (result.skipped > 0 ? ` (${result.skipped} already with ${assignee.name}, skipped)` : "") + "."
      );
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : "Could not complete this action. Please try again.");
    } finally {
      setAssignSubmitting(false);
    }
  };

  // ---- Admin delete (single from row, bulk from toolbar) ----
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; names: string[] } | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const closeDeleteDialog = () => { if (!deleteSubmitting) { setDeleteTarget(null); setDeleteError(""); } };
  const openSingleDelete = (l: Lead) => { setDeleteError(""); setDeleteTarget({ ids: [l.id], names: [l.name] }); };
  const openBulkDelete = () => { setDeleteError(""); setDeleteTarget({ ids: Array.from(selectedLeads.keys()), names: [] }); };
  const confirmDelete = async () => {
    if (!deleteTarget || deleteSubmitting) return;
    setDeleteSubmitting(true);
    setDeleteError("");
    const ids = deleteTarget.ids;
    try {
      let removedIds = ids;
      if (ids.length === 1) {
        await apiDeleteLead(ids[0]);
        setSuccessMsg(`Deleted lead${deleteTarget.names[0] ? `: ${deleteTarget.names[0]}` : ""}.`);
      } else {
        const res = await apiBulkDeleteLeads(ids);
        removedIds = ids.filter(id => !res.blocked.some(b => b.id === id));
        const skippedMsg = res.blocked.length > 0
          ? ` ${res.blocked.length} skipped because they have invoices.`
          : "";
        setSuccessMsg(`Deleted ${res.deleted} lead${res.deleted === 1 ? "" : "s"}.${skippedMsg}`);
      }
      removeLeadsLocally(removedIds);
      setTimeout(() => setSuccessMsg(""), 4000);
      clearSelected(ids);
      if (selectedLead && ids.includes(selectedLead.id)) setSelectedLead(null);
      setDeleteTarget(null);
      setLeadsRefreshKey(k => k + 1);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the lead(s). Please try again.");
    } finally {
      setDeleteSubmitting(false);
    }
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
  // True once the table is scrolled sideways, so the sticky Lead Name column
  // shows an edge shadow over the columns passing under it.
  const [adminScrolledX, setAdminScrolledX] = useState(false);
  const handleAdminTableScroll = () => {
    const scrolled = (adminScrollRef.current?.scrollLeft ?? 0) > 0;
    setAdminScrolledX(prev => (prev === scrolled ? prev : scrolled));
  };

  const goToAdminPage = (page: number) => {
    const clamped = Math.max(1, Math.min(adminTotalPages, page));
    setAdminPage(clamped);
    adminScrollRef.current?.scrollTo(0, 0);
  };

  // Same already-loaded properties list used for Bulk Upload, and the same
  // distinctCampaigns fetch the Leads tab's own Campaigns dropdown uses —
  // minor semantic shift from "properties/campaigns with >=1 lead" to "all
  // properties"/"all known campaigns," acceptable for a filter dropdown.
  const analyticsPropertiesList = propertiesList;
  const analyticsCampaignsList = distinctCampaigns;
  // Same Meta/Google grouping as the Leads tab's own Campaigns dropdown
  // (groupCampaignOptions, defined above), reused here rather than
  // re-implemented.
  const analyticsCampaignOptions = groupCampaignOptions(analyticsCampaignsList);

  // Per-agent counts come from the server (GET /leads/analytics-stats —
  // see leads.service.ts's getLeadAnalyticsStats), not a scan over the bulk
  // leads array. Property/Campaign/Date filters are sent to the server;
  // Member stays a client-side pass over this small per-agent array.
  const [analyticsStats, setAnalyticsStats] = useState<AgentAnalyticsStats[]>([]);
  useEffect(() => {
    let cancelled = false;
    const propertyIds = properties.filter(p => analyticsPropertyFilter.includes(p.name)).map(p => p.id);
    apiGetLeadAnalyticsStats({
      propertyId: propertyIds.length > 0 ? propertyIds : undefined,
      campaign: analyticsCampaignFilter.length > 0 ? analyticsCampaignFilter : undefined,
      ...dateRangeToServerBounds(analyticsDateRange, analyticsCustomRange, today)
    })
      .then(result => { if (!cancelled) setAnalyticsStats(result); })
      .catch(() => { /* leave the previous numbers showing on a transient failure */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsPropertyFilter, analyticsCampaignFilter, analyticsDateRange, analyticsCustomRange, properties]);

  const statsByAgentId = new Map(analyticsStats.map(r => [r.assignedAgentId, r]));
  const userIdByName = new Map(users.map(u => [u.name, u.id]));

  const deriveRates = (total: number, qualified: number, siteVisits: number) => ({
    qlPct: total > 0 ? (qualified / total) * 100 : 0,
    ql2svPct: qualified > 0 ? (siteVisits / qualified) * 100 : 0
  });

  // One agent's stats, honoring the Member filter the same way it always
  // worked (narrows which agents are even considered, not a server param —
  // the grouped-by-agent result is already small enough that filtering it
  // here is cheap).
  const statsForAgentName = (agentName: string) => {
    if (analyticsMemberFilter.length > 0 && !analyticsMemberFilter.includes(agentName)) {
      return { total: 0, qualified: 0, unqualified: 0, siteVisits: 0, ...deriveRates(0, 0, 0) };
    }
    const agentId = userIdByName.get(agentName);
    const row = agentId ? statsByAgentId.get(agentId) : undefined;
    const total = row?.total ?? 0;
    const qualified = row?.qualified ?? 0;
    const siteVisits = row?.siteVisits ?? 0;
    return { total, qualified, unqualified: row?.unqualified ?? 0, siteVisits, ...deriveRates(total, qualified, siteVisits) };
  };

  // Real reporting-line data (User.role_type/managerId) — not a fabricated
  // hierarchy. Members who report to a Manager are matched to them by id,
  // then their own leads (matched by name, same as everywhere else in this
  // file) are aggregated the same way as the top-level rows.
  const salesTeamUsers = users.filter(u => u.department === "SALES" && u.status !== "INACTIVE");
  const NO_TEAM_LABEL = "No manager assigned";

  // Real per-agent lead-quality breakdown for the Leads Analytics tab — same
  // categorization the stat cards above use, just grouped per agent, plus
  // two real conversion rates derived from those same counts (no new data
  // needed): QL's %age = qualified/total, QL2SV %age = of the qualified
  // leads, what share also reached a site-visit status.
  const adminManagerRows = agentsList.map(agentName => {
    const stats = statsForAgentName(agentName);
    const salesUser = salesTeamUsers.find(u => u.name === agentName);
    const isManager = salesUser?.role_type === "Manager";
    const directReports = isManager && salesUser
      ? salesTeamUsers
          .filter(u => u.managerId === salesUser.id)
          .map(member => ({ name: member.name, ...statsForAgentName(member.name) }))
      : [];
    const teamTotal = stats.total + directReports.reduce((sum, d) => sum + d.total, 0);
    return { agentName, isManager, directReports, teamTotal, ...stats };
  }).filter(row => row.isManager && (row.total > 0 || row.directReports.some(d => d.total > 0)));

  // Leads held by anyone outside a manager's team (no manager set, or a
  // non-sales user) are grouped under one "No manager assigned" row so they
  // never silently disappear from this table. Leads parked on an Admin
  // account (e.g. an orphaned sheet-import's fallback holder, see
  // reassignUnassignedSheetLeads) are excluded entirely rather than shown
  // as a named row here — an Admin isn't a salesperson, and this table is a
  // per-agent *performance* breakdown, so listing "Admin" alongside real
  // agents misrepresents it as one (2026-10-09 fix).
  const adminNames = new Set(users.filter(u => u.role === "ADMIN").map(u => u.name));
  const teamCoveredNames = new Set(adminManagerRows.flatMap(r => [r.agentName, ...r.directReports.map(d => d.name)]));
  const nameByAgentId = new Map(users.map(u => [u.id, u.name]));
  const dataAgentNames = Array.from(statsByAgentId.keys()).map(id => nameByAgentId.get(id)).filter((n): n is string => !!n);
  const noTeamNames = Array.from(new Set(
    dataAgentNames.filter(n =>
      !teamCoveredNames.has(n) && !adminNames.has(n) &&
      (analyticsMemberFilter.length === 0 || analyticsMemberFilter.includes(n))
    )
  ));
  const noTeamReports = noTeamNames.map(name => ({ name, ...statsForAgentName(name) }));
  const noTeamTotals = noTeamReports.reduce((acc, d) => ({
    total: acc.total + d.total,
    qualified: acc.qualified + d.qualified,
    unqualified: acc.unqualified + d.unqualified,
    siteVisits: acc.siteVisits + d.siteVisits
  }), { total: 0, qualified: 0, unqualified: 0, siteVisits: 0 });
  const noTeamRow = noTeamReports.length > 0
    ? {
        agentName: NO_TEAM_LABEL,
        isManager: true,
        directReports: noTeamReports,
        teamTotal: noTeamTotals.total,
        ...noTeamTotals,
        ...deriveRates(noTeamTotals.total, noTeamTotals.qualified, noTeamTotals.siteVisits)
      }
    : null;

  const adminAgentBreakdown = [...adminManagerRows, ...(noTeamRow ? [noTeamRow] : [])].filter(row =>
    !analyticsManagerSearch || row.agentName.toLowerCase().includes(analyticsManagerSearch.toLowerCase())
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
    a.download = `leads-analytics-${todayIso()}.csv`;
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
              {/* Upload Leads: admins and managers only, not agents. */}
              {canUploadLeads(currentUser) && (
                <button
                  onClick={() => setIsAddOpen(true)}
                  className="inline-flex items-center justify-center gap-2 h-9 px-3.5 bg-[#0B1E6E] hover:bg-[#081650] text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Upload Leads
                </button>
              )}
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
                baseFilters={adminDrillBaseFilters}
                onClose={() => setAdminDrillMetric(null)}
              />
            )}

            {/* Date badge (opens the shared range calendar) + Filter row.
                Applying a range switches the Date Range select above to
                Custom (it shows the picked dates); the × on the badge
                reverts it to Today. */}
            <div className="flex flex-wrap justify-end items-center gap-3">
              <div className="flex flex-wrap justify-end items-center gap-3">
                {canBulkAssign && selectedUnassignedLeads.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openAssignFlow("assign")}
                    className="inline-flex items-center justify-center gap-2 h-9 px-3.5 border border-slate-200 bg-white rounded-xl text-xs text-slate-700 font-bold shadow-sm hover:bg-slate-50 transition-all"
                  >
                    <Users className="h-4 w-4 text-blue-600" />
                    Assign ({selectedUnassignedLeads.length})
                  </button>
                )}
                {canBulkAssign && selectedAssignedLeads.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openAssignFlow("reshuffle")}
                    className="inline-flex items-center justify-center gap-2 h-9 px-3.5 border border-slate-200 bg-white rounded-xl text-xs text-slate-700 font-bold shadow-sm hover:bg-slate-50 transition-all"
                  >
                    <Users className="h-4 w-4 text-blue-600" />
                    Reshuffle ({selectedAssignedLeads.length})
                  </button>
                )}
                {isAdmin && selectedLeads.size > 0 && (
                  <button
                    type="button"
                    onClick={openBulkDelete}
                    className="inline-flex items-center justify-center gap-2 h-9 px-3.5 border border-slate-200 bg-white rounded-xl text-xs text-red-600 font-bold shadow-sm hover:bg-red-50 transition-all"
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                    Delete ({selectedLeads.size})
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
                  className="inline-flex items-center justify-center gap-2 h-9 px-3.5 border border-slate-200 bg-white rounded-xl text-xs text-slate-700 font-bold shadow-sm hover:bg-slate-50 transition-all"
                >
                  <Sliders className="h-4 w-4 text-blue-600" />
                  Filter
                </button>
              </div>
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
              <div ref={adminScrollRef} onScroll={handleAdminTableScroll} className="overflow-x-auto">
                <table
                  className={`w-full text-left border-collapse table-fixed ${phoneLayout ? "[&_th]:px-2.5 [&_td]:px-2.5 [&_th]:py-3 [&_td]:py-4 [&_th]:whitespace-normal [&_th]:uppercase [&_th]:text-[10px] [&_th]:font-semibold [&_th]:tracking-wider [&_th]:text-slate-500 [&_th_button]:uppercase [&_th_button]:text-[10px] [&_th_button]:font-semibold [&_th_button]:tracking-wider [&_th_button]:text-slate-500 [&_th_svg]:hidden [&_th:not(:first-child)]:border-l [&_td:not(:first-child)]:border-l [&_th]:border-slate-100 [&_td]:border-slate-100 [&_td]:align-middle" : ""}`}
                  style={phoneLayout && adminVisibleColumnList.length <= 3 ? undefined : { minWidth: (showBulkSelect ? 44 : 0) + (adminVisibleColumns.actions ? 80 : 0) + (1 + adminVisibleColumnList.filter(c => c.key !== "actions").length) * (phoneLayout ? 110 : 150) }}
                >
                  <colgroup>
                    {/* Bulk-select checkbox (Admin/Manager) */}
                    {showBulkSelect && <col className={phoneLayout ? "w-[40px]" : "w-[44px]"} />}
                    {/* Lead Name is sticky left on all sizes */}
                    <col />
                    {/* Togglable, driven by the Filter panel. Data columns share
                        the remaining width equally; only the icon-only Actions
                        column gets a fixed width to fit its buttons. */}
                    {adminVisibleColumnList.map(c => (
                      c.key === "actions"
                        ? <col key={c.key} className={phoneLayout ? "w-[56px]" : "w-[80px]"} />
                        : phoneLayout && c.key === "status"
                          ? <col key={c.key} className="w-[118px]" />
                          : phoneLayout && c.key === "notes"
                            ? <col key={c.key} className="w-[80px]" />
                            : <col key={c.key} />
                    ))}
                  </colgroup>
                  {/* z-30: above the sticky first-column body cells (z-10), so
                      rows scrolling up pass under the header, never over it. */}
                  <thead className="sticky top-0 z-30 bg-white">
                    <tr className="border-b border-slate-200 text-xs font-bold text-slate-800">
                      {showBulkSelect && (
                        <th className="pl-4 pr-1 py-3 whitespace-nowrap sticky left-0 z-20 bg-white">
                          <input
                            type="checkbox"
                            checked={allOnPageSelected}
                            onChange={toggleSelectAllOnPage}
                            title="Select all leads on this page"
                            className="h-3.5 w-3.5 rounded border-slate-300 accent-[#0B1E6E]"
                          />
                        </th>
                      )}
                      <th className={`px-4 py-3 whitespace-nowrap sticky z-20 bg-white transition-shadow ${showBulkSelect ? "left-[44px]" : "left-0"} ${adminScrolledX ? "shadow-[6px_0_8px_-6px_rgba(15,23,42,0.18)]" : ""}`}>
                        {adminSearchOpen ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              value={adminSearch}
                              onChange={(e) => { setAdminSearch(e.target.value); setAdminPage(1); }}
                              // Only an empty box closes on blur — a typed search stays
                              // (and keeps filtering) while you click rows, pages or scroll;
                              // ✕ clears it.
                              onBlur={() => { if (!adminSearch.trim()) setAdminSearchOpen(false); }}
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
                            <button type="button" onClick={() => setAdminSearchOpen(true)} className="text-left">Lead Name</button>
                            <button onClick={() => setAdminSearchOpen(true)} className="text-slate-400 hover:text-brand-700" title="Search">
                              <Search className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </th>
                      {adminVisibleColumns.email && <th className="px-4 py-3 whitespace-nowrap">Email</th>}
                      {adminVisibleColumns.assignedTo && <th className="px-4 py-3 whitespace-nowrap">
                        <SearchableMultiSelect
                          variant="inline"
                          label="Assigned To"
                          options={adminAssignedOptions}
                          selected={adminAssignedFilter}
                          onChange={(next) => {
                            setAdminPage(1);
                            // "Unassigned" can't be combined with agents (an
                            // unassigned lead has no agent), so the latest pick wins.
                            const pickedUnassigned = next.includes(UNASSIGNED_OPTION) && !adminAssignedFilter.includes(UNASSIGNED_OPTION);
                            setAdminAssignedFilter(pickedUnassigned ? [UNASSIGNED_OPTION] : next.filter(n => n !== UNASSIGNED_OPTION || next.length === 1));
                          }}
                          searchPlaceholder="Search agents..."
                          panelWidth={208}
                        />
                      </th>}

                      {/* Togglable, in the same order as the Filter panel */}
                      {adminVisibleColumns.date && <th className="px-4 py-3 whitespace-nowrap">Date</th>}
                      {adminVisibleColumns.property && (
                        <th className="px-4 py-3 whitespace-nowrap">
                          <SearchableMultiSelect
                            variant="inline"
                            label="Property"
                            options={propertiesList}
                            selected={adminPropertyFilter}
                            onChange={(next) => { setAdminPage(1); setAdminPropertyFilter(next); }}
                            searchPlaceholder="Search properties..."
                            panelWidth={240}
                          />
                        </th>
                      )}
                      {adminVisibleColumns.reassignedTo && <th className="px-4 py-3 whitespace-nowrap">Reassign From</th>}
                      {canSeeSource && adminVisibleColumns.source && <th className="px-4 py-3 whitespace-nowrap">Source</th>}
                      {adminVisibleColumns.status && (
                        <th className="px-4 py-3 whitespace-nowrap">
                          <SearchableMultiSelect
                            variant="inline"
                            label="Status"
                            options={PICKABLE_STATUS_OPTIONS}
                            selected={adminStatusFilter}
                            onChange={(next) => { setAdminPage(1); setAdminStatusFilter(next); }}
                            searchPlaceholder="Search status..."
                            panelWidth={208}
                          />
                        </th>
                      )}
                      {adminVisibleColumns.nextCallDate && <th className="px-4 py-3 whitespace-nowrap">Next Call Date</th>}
                      {adminVisibleColumns.actions && <th className="px-4 py-3 whitespace-nowrap">{phoneLayout ? "Action" : "Actions"}</th>}
                      {isAdmin && adminVisibleColumns.adSetName && <th className="px-4 py-3 whitespace-nowrap">Ad Set Name</th>}
                      {isAdmin && adminVisibleColumns.campaign && (
                        <th className="px-4 py-3 whitespace-nowrap">
                          {/* Same filter as the "Campaigns" button above the table. */}
                          <SearchableMultiSelect
                            variant="inline"
                            label="Campaign"
                            options={adminCampaignOptions}
                            selected={adminCampaignFilter}
                            onChange={(next) => { setAdminPage(1); setAdminCampaignFilter(next); }}
                            searchPlaceholder="Search campaigns..."
                            renderLabel={(l) => <PlatformLabel text={l} />}
                            panelWidth={260}
                          />
                        </th>
                      )}
                      {adminVisibleColumns.notes && <th className="px-4 py-3 whitespace-nowrap">Notes</th>}
                      {adminVisibleColumns.propertyMatch && <th className="px-4 py-3 whitespace-nowrap">Property Match</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {serverLeadsLoading && adminFilteredLeads.length === 0 ? (
                      <TableRowsSkeleton rows={8} columns={(showBulkSelect ? 2 : 1) + adminVisibleColumnList.length} />
                    ) : adminFilteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={(showBulkSelect ? 2 : 1) + adminVisibleColumnList.length} className="px-4 py-8 text-center text-slate-400 font-semibold italic">
                          No leads match the current filters.
                        </td>
                      </tr>
                    ) : (
                      (adminPageRowRefs.current = [], adminFilteredLeads.map((l, idx) => (
                        <tr
                          key={l.id}
                          ref={idx % adminRowsPerPage === 0 ? (el) => { adminPageRowRefs.current[Math.floor(idx / adminRowsPerPage)] = el; } : undefined}
                          onClick={(e) => handleLeadRowClick(e, l)}
                          className={`group cursor-pointer transition-colors ${selectedLeads.has(l.id) ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                          {showBulkSelect && (
                            <td className={`pl-4 pr-1 py-3 align-top sticky left-0 z-10 transition-colors ${selectedLeads.has(l.id) ? "bg-blue-50" : "bg-white group-hover:bg-slate-50"}`}>
                              <input
                                type="checkbox"
                                checked={selectedLeads.has(l.id)}
                                onChange={() => toggleLeadSelection(l)}
                                aria-label={`Select ${l.name}`}
                                className="h-3.5 w-3.5 rounded border-slate-300 accent-[#0B1E6E]"
                              />
                            </td>
                          )}
                          <td className={`px-4 py-3 align-top overflow-hidden sticky z-10 transition-[background-color,box-shadow] ${selectedLeads.has(l.id) ? "bg-blue-50" : "bg-white group-hover:bg-slate-50"} ${showBulkSelect ? "left-[44px]" : "left-0"} ${adminScrolledX ? "shadow-[6px_0_8px_-6px_rgba(15,23,42,0.18)]" : ""}`}>
                            <button
                              onClick={() => setSelectedLead(l)}
                              className={phoneLayout ? "block max-w-full line-clamp-2 [overflow-wrap:anywhere] text-left text-[12px] font-bold leading-snug text-slate-900" : "font-bold text-[#0B1E6E] hover:underline text-left [overflow-wrap:anywhere] block max-w-full"}
                              title={l.name}
                            >
                              {l.name}
                            </button>
                            <p className={phoneLayout ? "mt-0.5 truncate font-mono text-[11px] text-slate-500" : "text-[11px] text-slate-500 font-mono mt-0.5 [overflow-wrap:anywhere]"}>{isAdmin ? l.phone : maskPhone(l.phone)}</p>
                          </td>
                          {adminVisibleColumns.email && <td className="px-4 py-3 text-slate-600 align-top [overflow-wrap:anywhere]" title={l.email ? (isAdmin ? l.email : maskEmail(l.email)) : "—"}>{l.email ? (isAdmin ? l.email : maskEmail(l.email)) : "—"}</td>}
                          {adminVisibleColumns.assignedTo && <td className="px-4 py-3 text-slate-700 font-medium align-top [overflow-wrap:anywhere]" title={l.assignedAgent || "Unassigned"}>{l.assignedAgent || "Unassigned"}</td>}

                          {adminVisibleColumns.date && (
                            <td className="px-4 py-3 text-slate-500 align-top"><DateTimeLines {...dateTimeParts(l.createdAtStr)} /></td>
                          )}
                          {adminVisibleColumns.property && (
                            <td className="px-4 py-3 text-slate-700 font-medium align-top [overflow-wrap:anywhere]">
                              <span className="flex items-center gap-1.5 flex-wrap" title={l.property || "Not set"}>
                                {l.property || "Not set"}
                                <span
                                  className={`shrink-0 border rounded-lg px-1.5 py-0.5 text-[10px] font-semibold ${l.property ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}
                                  title={l.property ? "This lead has a property linked" : "No property linked yet"}
                                >
                                  {l.property ? "Assigned" : "Unassigned"}
                                </span>
                              </span>
                            </td>
                          )}
                          {adminVisibleColumns.reassignedTo && (
                            <td className="px-4 py-3 text-slate-700 font-medium align-top [overflow-wrap:anywhere]">
                              {l.previousAgent ? (
                                <Tooltip text="Click to see activity log of this lead">
                                  <button type="button" onClick={() => setSelectedLead(l)} className="text-left hover:text-[#0B1E6E] hover:underline">
                                    <span className="block">{l.assignedAgent || "Unassigned"}</span>
                                    <span className="block text-[11px] text-slate-400 font-normal">from {l.previousAgent}</span>
                                  </button>
                                </Tooltip>
                              ) : "—"}
                            </td>
                          )}
                          {canSeeSource && adminVisibleColumns.source && (
                            <td className="px-4 py-3 text-slate-700 font-medium align-top [overflow-wrap:anywhere]" title={l.source || "—"}>
                              <PlatformLabel text={l.source || "—"} iconOnly />
                            </td>
                          )}
                          {adminVisibleColumns.status && (
                            <td className="px-4 py-3 align-top">
                              {renderStatusCell(l)}
                            </td>
                          )}
                          {adminVisibleColumns.nextCallDate && (
                            <td className="px-4 py-3 text-slate-500 align-top"><NextCallCell next={adminNextCallDateFor(l.id)} /></td>
                          )}
                          {adminVisibleColumns.actions && (
                            <td className="px-4 py-3 align-top">
                              <LeadRowActionsMenu
                                onWhatsApp={() => handleWhatsApp(l)}
                                onCall={() => handleCall(l)}
                                callAllowed={callAllowed}
                                onDelete={isAdmin ? () => openSingleDelete(l) : undefined}
                              />
                            </td>
                          )}
                          {isAdmin && adminVisibleColumns.adSetName && (
                            <td className="px-4 py-3 text-slate-400 align-top [overflow-wrap:anywhere] italic" title="Not tracked yet — no ad-set-level data ingested">—</td>
                          )}
                          {isAdmin && adminVisibleColumns.campaign && (
                            <td className="px-4 py-3 text-slate-700 font-medium align-top [overflow-wrap:anywhere]" title={l.campaign || "—"}>
                              {l.campaign ? <PlatformLabel text={l.campaign} classifyBy={l.source || l.campaign} wrap /> : "—"}
                            </td>
                          )}
                          {adminVisibleColumns.notes && (
                            <td className="px-4 py-3 text-slate-600 align-top"><LeadNoteCell lead={l} onSaved={handleNoteSaved} compact={phoneLayout} /></td>
                          )}
                          {adminVisibleColumns.propertyMatch && (
                            <td className="px-4 py-3 text-slate-400 align-top [overflow-wrap:anywhere] italic" title="Not tracked yet — no property-match scoring implemented">—</td>
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
                {/* CSV export is switched off for now (shown, not clickable);
                    drop `disabled` to bring it back — handleExportAnalytics is intact. */}
                <button
                  type="button"
                  onClick={handleExportAnalytics}
                  disabled
                  aria-disabled="true"
                  title="Export as CSV — coming soon"
                  className="h-9 w-9 shrink-0 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-[#0B1E6E] hover:bg-slate-50 shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsColumnsSettingsOpen(true)}
                  title="Filter"
                  className="h-9 w-9 shrink-0 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-[#0B1E6E] hover:bg-slate-50 shadow-sm transition-colors"
                >
                  <Sliders className="h-4 w-4" />
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

                {/* Campaigns — grouped by ad platform, same as the Leads tab's own
                    Campaigns dropdown — Admin-only, same tier as that one and the
                    Source/Ad Set Name columns. See
                    project_crm_role_based_lead_scoping memory (2026-10-09). */}
                {isAdmin && (
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
                )}
              </div>

              <>
                {isAdmin ? (
                  <>
                  <div className="overflow-x-auto">
                    <table
                      className="w-full text-left text-xs border-collapse table-fixed"
                      style={{ minWidth: (1 + ANALYTICS_COLUMNS.filter(c => analyticsVisibleColumns[c.key]).length) * 150 }}
                    >
                      <colgroup>
                        <col />
                        {analyticsVisibleColumns.teamTotal && <col />}
                        {analyticsVisibleColumns.total && <col />}
                        {analyticsVisibleColumns.qualified && <col />}
                        {analyticsVisibleColumns.unqualified && <col />}
                        {analyticsVisibleColumns.siteVisits && <col />}
                        {analyticsVisibleColumns.qlPct && <col />}
                        {analyticsVisibleColumns.ql2svPct && <col />}
                      </colgroup>
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-800">
                          <th className="px-4 py-3 whitespace-nowrap">
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
                        ) : analyticsPageRows.length === 0 ? (
                          <tr>
                            <td colSpan={1 + ANALYTICS_COLUMNS.filter(c => analyticsVisibleColumns[c.key]).length} className="px-4 py-10 text-center">
                              <p className="text-sm font-semibold text-slate-600">No leads in this date range</p>
                              <p className="text-[11px] text-slate-400 mt-1">Try a wider date range or clear the filters above.</p>
                            </td>
                          </tr>
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
                                            <table className="w-full text-left text-[11px] border-collapse table-fixed">
                                              <colgroup>
                                                <col />
                                                {analyticsVisibleColumns.total && <col />}
                                                {analyticsVisibleColumns.qualified && <col />}
                                                {analyticsVisibleColumns.unqualified && <col />}
                                                {analyticsVisibleColumns.siteVisits && <col />}
                                                {analyticsVisibleColumns.qlPct && <col />}
                                                {analyticsVisibleColumns.ql2svPct && <col />}
                                              </colgroup>
                                              <thead>
                                                <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-800">
                                                  <th className="px-4 py-3 whitespace-nowrap">Team Member</th>
                                                  {analyticsVisibleColumns.total && <th className="px-4 py-3 whitespace-nowrap">Total Leads Assigned</th>}
                                                  {analyticsVisibleColumns.qualified && <th className="px-4 py-3 whitespace-nowrap">Qualified Leads</th>}
                                                  {analyticsVisibleColumns.unqualified && <th className="px-4 py-3 whitespace-nowrap">Unqualified Leads</th>}
                                                  {analyticsVisibleColumns.siteVisits && <th className="px-4 py-3 whitespace-nowrap">Site Visit Leads</th>}
                                                  {analyticsVisibleColumns.qlPct && <th className="px-4 py-3 whitespace-nowrap">QL&apos;s %age</th>}
                                                  {analyticsVisibleColumns.ql2svPct && <th className="px-4 py-3 whitespace-nowrap">QL2SV %age</th>}
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-100 text-slate-700">
                                                {pageRows.map(member => (
                                                  <tr key={member.name}>
                                                    <td className="px-4 py-3 font-semibold">
                                                      <StatCell value={member.name} onClick={() => openAnalyticsDrilldown([member.name], null, `${member.name} — All Leads`)} />
                                                    </td>
                                                    {analyticsVisibleColumns.total && (
                                                      <td className="px-4 py-3">
                                                        <StatCell value={member.total} onClick={() => openAnalyticsDrilldown([member.name], null, `${member.name} — All Leads`)} />
                                                      </td>
                                                    )}
                                                    {analyticsVisibleColumns.qualified && (
                                                      <td className="px-4 py-3">
                                                        <StatCell value={member.qualified} onClick={() => openAnalyticsDrilldown([member.name], QUALIFIED_STATUS_OPTIONS, `${member.name} — Qualified Leads`)} />
                                                      </td>
                                                    )}
                                                    {analyticsVisibleColumns.unqualified && (
                                                      <td className="px-4 py-3">
                                                        <StatCell value={member.unqualified} onClick={() => openAnalyticsDrilldown([member.name], UNQUALIFIED_STATUSES, `${member.name} — Unqualified Leads`)} />
                                                      </td>
                                                    )}
                                                    {analyticsVisibleColumns.siteVisits && (
                                                      <td className="px-4 py-3">
                                                        <StatCell value={member.siteVisits} onClick={() => openAnalyticsDrilldown([member.name], SITE_VISIT_STATUSES, `${member.name} — Site Visit Leads`)} />
                                                      </td>
                                                    )}
                                                    {analyticsVisibleColumns.qlPct && (
                                                      <td className="px-4 py-3">
                                                        <StatCell value={`${member.qlPct.toFixed(2)}%`} onClick={() => openAnalyticsDrilldown([member.name], QUALIFIED_STATUS_OPTIONS, `${member.name} — Qualified Leads`)} />
                                                      </td>
                                                    )}
                                                    {analyticsVisibleColumns.ql2svPct && (
                                                      <td className="px-4 py-3">
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
                ) : (
                  // Manager viewer: scopeForCaller already restricts this tab
                  // to exactly one row (the manager's own) — a "Manager Name"
                  // table with one row and a click to expand it is a pointless
                  // extra layer, so skip straight to a flat list: the manager's
                  // own individual stats as the first row, then each direct
                  // report, using the same "Team Member" columns the nested
                  // view already used. See project_crm_role_based_lead_scoping
                  // memory (2026-10-10).
                  (() => {
                    const ownRow = adminAgentBreakdown[0];
                    const flatMembers = ownRow
                      ? [
                          {
                            name: ownRow.agentName,
                            total: ownRow.total,
                            qualified: ownRow.qualified,
                            unqualified: ownRow.unqualified,
                            siteVisits: ownRow.siteVisits,
                            qlPct: ownRow.qlPct,
                            ql2svPct: ownRow.ql2svPct
                          },
                          ...ownRow.directReports
                        ]
                      : [];
                    if (isDataLoading && flatMembers.length === 0) {
                      return <TableRowsSkeleton rows={6} columns={1 + ANALYTICS_COLUMNS.filter(c => c.key !== "teamTotal" && analyticsVisibleColumns[c.key]).length} />;
                    }
                    if (flatMembers.length === 0) {
                      return (
                        <div className="px-4 py-10 text-center">
                          <p className="text-sm font-semibold text-slate-600">No leads in this date range</p>
                          <p className="text-[11px] text-slate-400 mt-1">Try a wider date range or clear the filters above.</p>
                        </div>
                      );
                    }
                    return (
                      <div className="overflow-x-auto">
                        <PaginatedSubList items={flatMembers} rowLabel="Member">
                          {(pageRows) => (
                            <table className="w-full text-left text-xs border-collapse table-fixed">
                              <colgroup>
                                <col />
                                {analyticsVisibleColumns.total && <col />}
                                {analyticsVisibleColumns.qualified && <col />}
                                {analyticsVisibleColumns.unqualified && <col />}
                                {analyticsVisibleColumns.siteVisits && <col />}
                                {analyticsVisibleColumns.qlPct && <col />}
                                {analyticsVisibleColumns.ql2svPct && <col />}
                              </colgroup>
                              <thead>
                                <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-800">
                                  <th className="px-4 py-3 whitespace-nowrap">Team Member</th>
                                  {analyticsVisibleColumns.total && <th className="px-4 py-3 whitespace-nowrap">Total Leads Assigned</th>}
                                  {analyticsVisibleColumns.qualified && <th className="px-4 py-3 whitespace-nowrap">Qualified Leads</th>}
                                  {analyticsVisibleColumns.unqualified && <th className="px-4 py-3 whitespace-nowrap">Unqualified Leads</th>}
                                  {analyticsVisibleColumns.siteVisits && <th className="px-4 py-3 whitespace-nowrap">Site Visit Leads</th>}
                                  {analyticsVisibleColumns.qlPct && <th className="px-4 py-3 whitespace-nowrap">QL&apos;s %age</th>}
                                  {analyticsVisibleColumns.ql2svPct && <th className="px-4 py-3 whitespace-nowrap">QL2SV %age</th>}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-700">
                                {pageRows.map(member => (
                                  <tr key={member.name}>
                                    <td className="px-4 py-3 font-semibold">
                                      <StatCell value={member.name} onClick={() => openAnalyticsDrilldown([member.name], null, `${member.name} — All Leads`)} />
                                    </td>
                                    {analyticsVisibleColumns.total && (
                                      <td className="px-4 py-3">
                                        <StatCell value={member.total} onClick={() => openAnalyticsDrilldown([member.name], null, `${member.name} — All Leads`)} />
                                      </td>
                                    )}
                                    {analyticsVisibleColumns.qualified && (
                                      <td className="px-4 py-3">
                                        <StatCell value={member.qualified} onClick={() => openAnalyticsDrilldown([member.name], QUALIFIED_STATUS_OPTIONS, `${member.name} — Qualified Leads`)} />
                                      </td>
                                    )}
                                    {analyticsVisibleColumns.unqualified && (
                                      <td className="px-4 py-3">
                                        <StatCell value={member.unqualified} onClick={() => openAnalyticsDrilldown([member.name], UNQUALIFIED_STATUSES, `${member.name} — Unqualified Leads`)} />
                                      </td>
                                    )}
                                    {analyticsVisibleColumns.siteVisits && (
                                      <td className="px-4 py-3">
                                        <StatCell value={member.siteVisits} onClick={() => openAnalyticsDrilldown([member.name], SITE_VISIT_STATUSES, `${member.name} — Site Visit Leads`)} />
                                      </td>
                                    )}
                                    {analyticsVisibleColumns.qlPct && (
                                      <td className="px-4 py-3">
                                        <StatCell value={`${member.qlPct.toFixed(2)}%`} onClick={() => openAnalyticsDrilldown([member.name], QUALIFIED_STATUS_OPTIONS, `${member.name} — Qualified Leads`)} />
                                      </td>
                                    )}
                                    {analyticsVisibleColumns.ql2svPct && (
                                      <td className="px-4 py-3">
                                        <StatCell value={`${member.ql2svPct.toFixed(2)}%`} onClick={() => openAnalyticsDrilldown([member.name], SITE_VISIT_STATUSES, `${member.name} — Site Visit Leads`)} />
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </PaginatedSubList>
                      </div>
                    );
                  })()
                )}
              </>
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
                  {analyticsDrilldownTotal === 0 && !analyticsDrilldownLoading ? (
                    <p className="text-xs text-slate-400 italic p-6">No leads match this view.</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse table-fixed min-w-[1200px]">
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
                            <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-800">
                              <th className="px-4 py-3 whitespace-nowrap">
                                {drilldownSearchOpen ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      autoFocus
                                      value={drilldownSearch}
                                      onChange={(e) => setDrilldownSearch(e.target.value)}
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
                              <th className="px-4 py-3 whitespace-nowrap">Email</th>
                              <th className="px-4 py-3 whitespace-nowrap">Status</th>
                              <th className="px-4 py-3 whitespace-nowrap">Assigned To</th>
                              <th className="px-4 py-3 whitespace-nowrap">Date</th>
                              <th className="px-4 py-3 whitespace-nowrap">Notes</th>
                              <th className="px-4 py-3 whitespace-nowrap">Next Call Date</th>
                              <th className="px-4 py-3 whitespace-nowrap">Campaign</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {analyticsDrilldownLoading && analyticsDrilldownRows.length === 0 ? (
                              <TableRowsSkeleton rows={6} columns={8} />
                            ) : (
                              analyticsDrilldownRows.map((l) => (
                              <tr key={l.id} className="hover:bg-slate-50/60 transition-colors">
                                <td className="px-4 py-3 align-top overflow-hidden">
                                  <button
                                    onClick={() => setSelectedLead(l)}
                                    className="font-bold text-[#0B1E6E] hover:underline text-left [overflow-wrap:anywhere] block max-w-full"
                                    title={l.name}
                                  >
                                    {l.name}
                                  </button>
                                  <p className="text-[11px] text-slate-500 font-mono mt-0.5 [overflow-wrap:anywhere]">{isAdmin ? l.phone : maskPhone(l.phone)}</p>
                                </td>
                                <td className="px-4 py-3 text-slate-600 align-top [overflow-wrap:anywhere]" title={l.email ? (isAdmin ? l.email : maskEmail(l.email)) : "—"}>{l.email ? (isAdmin ? l.email : maskEmail(l.email)) : "—"}</td>
                                <td className="px-4 py-3 align-top">
                                  {renderStatusCell(l)}
                                </td>
                                <td className="px-4 py-3 text-slate-700 font-medium align-top [overflow-wrap:anywhere]" title={l.assignedAgent || "Unassigned"}>{l.assignedAgent || "Unassigned"}</td>
                                <td className="px-4 py-3 text-slate-500 align-top"><DateTimeLines {...dateTimeParts(l.createdAtStr)} /></td>
                                <td className="px-4 py-3 text-slate-600 align-top"><LeadNoteCell lead={l} onSaved={handleNoteSaved} /></td>
                                <td className="px-4 py-3 text-slate-500 align-top"><NextCallCell next={nextFollowupFor(l.id, analyticsDrillPageFollowups)} /></td>
                                <td className="px-4 py-3 text-slate-700 font-medium align-top [overflow-wrap:anywhere]" title={l.campaign || "—"}>
                              {l.campaign ? <PlatformLabel text={l.campaign} classifyBy={l.source || l.campaign} wrap /> : "—"}
                            </td>
                              </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      <TablePagination
                        {...analyticsDrilldownPaginationProps}
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
                <table className="w-full text-left text-xs border-collapse table-fixed min-w-[750px]">
                  <colgroup>
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-800">
                      <th className="px-4 py-3 whitespace-nowrap">Total Leads</th>
                      <th className="px-4 py-3 whitespace-nowrap">Avg Call Back Initiation<br />Per Lead / Day</th>
                      <th className="px-4 py-3 whitespace-nowrap">Avg Calling Per Lead<br />before dead</th>
                      <th className="px-4 py-3 whitespace-nowrap">Date</th>
                      <th className="px-4 py-3 whitespace-nowrap">AI Notes</th>
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
          agentsList={uploadAssignableUsers(users, currentUser).map(u => u.name)}
          propertiesList={propertiesList}
        />

        {/* Assign/Reshuffle Leads modal — same as Data Calling: Property must
            be picked before Assignee unlocks (it scopes who's eligible), and
            confirm stays disabled until both hold a value. The assignee list
            never includes the person reassigning, and a Manager only sees
            their own direct reports (lib/leadAssignment.ts). */}
        {canBulkAssign && assignFlowMode && createPortal(
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

                <div className="space-y-1.5">
                  <label htmlFor="assign-note" className="block text-sm font-bold text-slate-800">
                    Note <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    id="assign-note"
                    value={assignNote}
                    onChange={(e) => setAssignNote(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder={assignFlowMode === "reshuffle" ? "Why are these leads being reshuffled? e.g. Agent on leave this week" : "Anything the agent should know? e.g. Interested in 2BHK, call after 6 pm"}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 resize-y focus:outline-none focus:border-brand-500"
                  />
                  <p className="text-[11px] text-slate-400">Required. Saved as the lead&apos;s note and in its activity history.</p>
                </div>
              </div>
              {assignError && (
                <div className="mx-6 mb-4 p-2.5 bg-red-50 border border-red-100 text-[11px] text-red-700 rounded-xl font-bold flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{assignError}</span>
                </div>
              )}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={assignSubmitting}
                  onClick={closeAssignFlow}
                  className="px-5 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canConfirmAssign || assignSubmitting}
                  onClick={confirmBulkAssign}
                  className={`px-5 py-2 rounded-xl font-bold text-sm text-white transition-colors ${
                    canConfirmAssign && !assignSubmitting ? "bg-[#0B1E6E] hover:bg-[#081650]" : "bg-slate-300 cursor-not-allowed"
                  }`}
                >
                  {assignSubmitting ? "Saving..." : assignFlowMode === "reshuffle" ? "Reshuffle" : "Assign"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Delete confirmation — same modal shell as the Assign/Reshuffle flow. */}
        {isAdmin && deleteTarget && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-900/40" onClick={closeDeleteDialog} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
              <div className="px-6 pt-6 pb-4 border-b border-slate-100">
                <h3 className="text-xl font-extrabold text-slate-900">
                  {deleteTarget.ids.length === 1 ? "Delete Lead" : "Delete Leads"}
                </h3>
              </div>
              <div className="px-6 py-5 space-y-3">
                <p className="text-sm text-slate-700">
                  {deleteTarget.ids.length === 1
                    ? `Permanently delete ${deleteTarget.names[0] ? `"${deleteTarget.names[0]}"` : "this lead"}? This cannot be undone.`
                    : `Permanently delete ${deleteTarget.ids.length} selected lead${deleteTarget.ids.length === 1 ? "" : "s"}? This cannot be undone.`}
                </p>
                {deleteTarget.ids.length > 1 && (
                  <p className="text-[11px] text-slate-400">Leads with invoices cannot be deleted and will be skipped.</p>
                )}
                {deleteError && (
                  <div className="p-2.5 bg-red-50 border border-red-100 text-[11px] text-red-700 rounded-xl font-bold flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>{deleteError}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
                <button
                  type="button"
                  disabled={deleteSubmitting}
                  onClick={closeDeleteDialog}
                  className="px-5 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteSubmitting}
                  onClick={confirmDelete}
                  className="px-5 py-2 rounded-xl font-bold text-sm text-white bg-red-600 hover:bg-red-700 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  {deleteSubmitting ? "Deleting..." : "Delete"}
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
          onReassigned={() => setLeadsRefreshKey(k => k + 1)}
          onNoteSaved={handleNoteSaved}
        />

        {/* Scheduler popup for the main table's inline Status dropdown —
            LeadDetailDrawer has its own, separate instance for its own
            dropdown. */}
        {statusScheduler.pendingSchedule && (
          <LeadScheduleModal
            pending={statusScheduler.pendingSchedule}
            submitting={statusScheduler.submitting}
            error={statusScheduler.error}
            onCancel={statusScheduler.cancelSchedule}
            onConfirm={statusScheduler.confirmSchedule}
          />
        )}

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
                    {ADMIN_COLUMNS.filter(c => c.key !== "campaign" && c.key !== "adSetName" && (c.key !== "source" || canSeeSource)).map(c => {
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
