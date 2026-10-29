"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import RowActionsMenu from "@/components/ui/RowActionsMenu";
import { useApp, Lead, LeadStatus, FollowupCall, mapApiFollowupToFrontend, mapApiLeadToFrontendLead } from "@/context/AppContext";
import { isLeadAssignableUser } from "@/lib/leadAssignment";
import { useDialog } from "@/components/ui/DialogProvider";
import { maskPhone } from "@/lib/maskPII";
import { apiGetAgentReportStats, apiGetManagerReportStats, apiListFollowupsPage, apiGetLead, type AgentReportStats, type ManagerReportAgentStats, type LeadListFilters } from "@/lib/apiClient";
import { useServerLeadList } from "@/lib/useServerLeadList";
import { AlertTriangle, ArrowRight, CheckSquare, Clock, DollarSign, History, Info, MapPin, Phone, TrendingUp, Users, RefreshCw } from "lucide-react";
import { DateRange } from "./DateRangeFilter";
import MetricDetailModal, { MetricDetailRow } from "./MetricDetailModal";
import LeadDetailDrawer from "@/components/crm/LeadDetailDrawer";
import { statusBadgeClasses, FRONTEND_STATUS_TO_DB_CODE } from "@/lib/leadStatusMapping";
import {
  computeROIMultiple,
  getMissedInfo,
  formatCurrency,
  formatMinutes,
  SLA_MINUTES
} from "@/lib/reportMetrics";
import { LineSkeleton, TableRowsSkeleton, CardListSkeleton } from "@/components/ui/Skeletons";
import TablePagination, { usePagination } from "@/components/ui/TablePagination";
import { DateSortButton, sortByDate, type SortDir } from "@/components/ui/DateSortButton";
import { useLiveRefresh } from "@/lib/useLiveRefresh";

// Status-code buckets for the funnel KPI popups — must exactly match
// getAgentReportStats's own SQL bucket definitions (confirmed identical,
// code-for-code, during Phase 6e's exploration) so a drill-down's row
// count can never disagree with the headline number above it.
const ALL_DB_CODES = Object.values(FRONTEND_STATUS_TO_DB_CODE);
const CONTACTED_CODES = ALL_DB_CODES.filter(c => c !== "NEW_LEAD");
const QUALIFIED_CODES = ["CALL_BACK", "FOLLOWUP", "EOI", "SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE", "BOOKED"];
const SITE_VISIT_CODES = ["SITE_VISIT_SCHEDULED", "SITE_VISIT_DONE"];

export default function AgentReports({ dateRange, initialAgentId }: { dateRange: DateRange; initialAgentId?: string }) {
  const { users, currentUser, activeRole, reassignLead, updateLeadStatus, isDataLoading } = useApp();
  const { toast, prompt: promptDialog } = useDialog();

  // Roster + per-person lead counts come from one grouped-by-agent fetch
  // (one row per agent with >=1 lead in range) instead of scanning the
  // bulk leads array.
  const [managerReportStats, setManagerReportStats] = useState<ManagerReportAgentStats[]>([]);
  // Live: every report number below refreshes when leads or follow-ups change.
  const { liveVersion: reportsLive } = useLiveRefresh("leads", "followups");
  useEffect(() => {
    let cancelled = false;
    apiGetManagerReportStats(dateRange.from, dateRange.to)
      .then(result => { if (!cancelled) setManagerReportStats(result); })
      .catch(() => { /* leave the previous roster/counts showing on a transient failure */ });
    return () => { cancelled = true; };
  }, [dateRange.from, dateRange.to, reportsLive]);
  const managerStatsByAgentId = useMemo(() => new Map(managerReportStats.map(r => [r.assignedAgentId, r])), [managerReportStats]);

  // Real reporting-line lookup (see Settings → Manage Users → "Reports To"),
  // not the old hardcoded name-string SALES_HIERARCHY table.
  const managerNames = useMemo(() => new Set(users.filter(u => u.role_type === "Manager" && isLeadAssignableUser(u)).map(u => u.name)), [users]);
  const reportsToByName = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach(u => { if (u.managerName) map.set(u.name, u.managerName); });
    return map;
  }, [users]);

  // Role-scoped: ADMIN browses everyone; a Manager only ever sees their own
  // direct reports; a Member (sales agent) only ever sees their own report —
  // this used to list every agent in the company to every viewer regardless
  // of role, letting a Member browse other agents' names/reports.
  const agentNames = useMemo(() => {
    const statsAgentNames = managerReportStats
      .map(r => users.find(u => u.id === r.assignedAgentId)?.name)
      .filter((n): n is string => !!n);
    const allNames = new Set<string>([
      ...users.filter(u => u.role_type !== "Manager" && isLeadAssignableUser(u)).map(u => u.name),
      ...statsAgentNames
    ]);
    managerNames.forEach(m => allNames.delete(m));
    // Sales agents only: Finance/Admin users never appear here or as a
    // reassign target, even when one holds a lead (e.g. an unassigned lead).
    users.filter(u => !isLeadAssignableUser(u)).forEach(u => allNames.delete(u.name));
    const all = Array.from(allNames).sort();

    if (activeRole === "ADMIN") return all;
    if (!currentUser) return [];
    if (currentUser.role_type === "Manager") {
      return all.filter(name => users.find(u => u.name === name)?.managerId === currentUser.id);
    }
    return all.includes(currentUser.name) ? [currentUser.name] : [currentUser.name];
  }, [users, managerNames, managerReportStats, activeRole, currentUser]);

  const isScopedToSelf = activeRole !== "ADMIN" && currentUser?.role_type !== "Manager";

  const [selectedAgent, setSelectedAgent] = useState<string>(agentNames[0] || "");
  // Deep-linked from a notification naming one specific agent (?agentId= on
  // /dashboard/reports) — applied once, so the viewer can still freely pick
  // a different agent afterward without this overriding their choice again.
  const appliedInitialAgentId = useRef(false);
  useEffect(() => {
    if (appliedInitialAgentId.current || !initialAgentId || isScopedToSelf) return;
    const name = users.find(u => u.id === initialAgentId)?.name;
    if (name && agentNames.includes(name)) {
      setSelectedAgent(name);
      appliedInitialAgentId.current = true;
    }
  }, [initialAgentId, users, agentNames, isScopedToSelf]);
  const activeAgent = isScopedToSelf ? (currentUser?.name || "") : (agentNames.includes(selectedAgent) ? selectedAgent : agentNames[0] || "");

  const agentSalesTeamOptions = useMemo(() => {
    const names = new Set<string>([...agentNames, ...Array.from(managerNames)]);
    return Array.from(names).sort();
  }, [agentNames, managerNames]);

  const activeAgentId = users.find(u => u.name === activeAgent)?.id;

  // Missed Follow-ups' rows, fetched directly for this one agent + date
  // range instead of scanning the bulk followupCalls array — followup_calls
  // is a much smaller table than leads (a handful of open calls per agent,
  // not thousands), so one page is enough in practice.
  // ponytail: capped at 500 (the server's max page size) rather than real
  // pagination — revisit if a single agent's missed-follow-up count in one
  // range ever realistically approaches that.
  const [missedFollowups, setMissedFollowups] = useState<FollowupCall[]>([]);
  useEffect(() => {
    if (!activeAgentId) { setMissedFollowups([]); return; }
    let cancelled = false;
    apiListFollowupsPage(1, 500, { status: ["MISSED"], assignedToId: [activeAgentId], dateFrom: dateRange.from, dateTo: dateRange.to })
      .then(result => { if (!cancelled) setMissedFollowups(result.rows.map(mapApiFollowupToFrontend)); })
      .catch(() => { if (!cancelled) setMissedFollowups([]); });
    return () => { cancelled = true; };
  }, [activeAgentId, dateRange.from, dateRange.to, reportsLive]);

  const ZERO_REPORT_STATS: AgentReportStats = {
    assigned: 0, contacted: 0, qualified: 0, siteVisits: 0, bookingValue: 0, bookingCount: 0,
    allocatedSpend: 0, missedLeads: 0, missedFollowups: 0
  };
  const [reportStats, setReportStats] = useState<AgentReportStats>(ZERO_REPORT_STATS);
  useEffect(() => {
    if (!activeAgentId) { setReportStats(ZERO_REPORT_STATS); return; }
    let cancelled = false;
    apiGetAgentReportStats(activeAgentId, dateRange.from, dateRange.to)
      .then(result => { if (!cancelled) setReportStats(result); })
      .catch(() => { /* leave the previous numbers showing on a transient failure */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgentId, dateRange.from, dateRange.to, reportsLive]);
  const funnel = { assigned: reportStats.assigned, contacted: reportStats.contacted, qualified: reportStats.qualified, siteVisits: reportStats.siteVisits };
  const bookingValue = reportStats.bookingValue;
  const bookingCount = reportStats.bookingCount;
  const allocatedSpend = reportStats.allocatedSpend;
  const roi = computeROIMultiple(bookingValue, allocatedSpend);
  const pct = (n: number) => (funnel.assigned === 0 ? 0 : Math.round((n / funnel.assigned) * 100));
  const kpiCards = [
    { key: "assigned", label: "Total Leads Assigned", value: funnel.assigned, sub: "In selected range", icon: Users, iconBg: "bg-blue-50 text-blue-600", alert: false },
    { key: "contacted", label: "Leads Contacted", value: funnel.contacted, sub: `${pct(funnel.contacted)}% of assigned`, icon: Phone, iconBg: "bg-emerald-50 text-emerald-600", alert: false },
    { key: "qualified", label: "Qualified Leads", value: funnel.qualified, sub: `${pct(funnel.qualified)}% of assigned`, icon: CheckSquare, iconBg: "bg-violet-50 text-violet-600", alert: false },
    { key: "siteVisits", label: "Site Visits", value: funnel.siteVisits, sub: `${pct(funnel.siteVisits)}% of assigned`, icon: MapPin, iconBg: "bg-orange-50 text-orange-500", alert: false },
    { key: "missedLeads", label: "Missed Leads", value: reportStats.missedLeads, sub: `${SLA_MINUTES} min response window`, icon: AlertTriangle, iconBg: "bg-red-50 text-red-600", alert: reportStats.missedLeads > 0 },
    { key: "missedFollowups", label: "Missed Follow-ups", value: reportStats.missedFollowups, sub: "10 min after reminder", icon: Clock, iconBg: "bg-sky-50 text-sky-600", alert: false }
  ] as const;
  const funnelRows = [
    { label: "Assigned", value: funnel.assigned, bar: "bg-[#0B1E6E]" },
    { label: "Contacted", value: funnel.contacted, bar: "bg-blue-500" },
    { label: "Qualified", value: funnel.qualified, bar: "bg-blue-400" },
    { key: "siteVisits", label: "Site Visits", value: funnel.siteVisits, bar: "bg-blue-300" }
  ];
  const [missedTab, setMissedTab] = useState<"leads" | "followups">("leads");
  const missedDetailRef = useRef<HTMLDivElement>(null);
  const openMissedTab = (tab: "leads" | "followups") => {
    setMissedTab(tab);
    missedDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // KPI card popups — agent login only. Each lists the leads behind that
  // card's number; clicking a row opens the Lead Detail drawer on top.
  type KpiKey = (typeof kpiCards)[number]["key"];
  const [openKpi, setOpenKpi] = useState<KpiKey | null>(null);
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null);

  // Missed Leads — real rows from the server (missedOnly reuses
  // getAgentReportStats's own live-clock predicate), scoped to this one
  // agent + date range. Always enabled (not just while its KPI popup is
  // open): also feeds the always-visible Missed Leads tab table below.
  const missedLeadsFilters: LeadListFilters = { assignedAgentId: activeAgentId ? [activeAgentId] : [], dateFrom: dateRange.from, dateTo: dateRange.to, missedOnly: true, sortField: "assigned" };
  const missedLeadsList = useServerLeadList(missedLeadsFilters, 10, !!activeAgentId);

  // The other four KPI popups (Assigned/Contacted/Qualified/Site Visits)
  // share one hook instance — its filters switch to whichever tab is open,
  // and it only fetches while one of those four is actually open (openKpi
  // is agent-login-only to begin with, so this never runs for Admin/Manager
  // viewing someone else's report).
  const FUNNEL_STATUS_CODES: Partial<Record<string, string[]>> = { contacted: CONTACTED_CODES, qualified: QUALIFIED_CODES, siteVisits: SITE_VISIT_CODES };
  const isFunnelKpi = openKpi === "assigned" || openKpi === "contacted" || openKpi === "qualified" || openKpi === "siteVisits";
  const funnelKpiFilters: LeadListFilters = {
    assignedAgentId: activeAgentId ? [activeAgentId] : [],
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    status: openKpi ? FUNNEL_STATUS_CODES[openKpi] : undefined
  };
  const funnelKpiList = useServerLeadList(funnelKpiFilters, 10, isFunnelKpi && !!activeAgentId);

  // Missed Follow-ups' modal search/pagination — GET /followups has no
  // search param, so this stays a client-side filter over the already-
  // fetched (capped-at-500) missedFollowups array, same as before, just
  // now owned here instead of inside the modal itself.
  const [followupsModalSearch, setFollowupsModalSearch] = useState("");
  const followupsModalFiltered = useMemo(() => {
    const q = followupsModalSearch.trim().toLowerCase();
    return q ? missedFollowups.filter(f => `${f.leadName} ${f.phone} ${f.type}`.toLowerCase().includes(q)) : missedFollowups;
  }, [missedFollowups, followupsModalSearch]);
  const followupsModalPagination = usePagination(followupsModalFiltered, 10, `${openKpi}`);

  // Modal search resets whenever the open KPI tab changes — same as the
  // old MetricDetailModal's own internal reset-on-[open,title] behavior.
  useEffect(() => {
    missedLeadsList.setSearch("");
    funnelKpiList.setSearch("");
    setFollowupsModalSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKpi]);

  // Single lead, fetched by id for the drawer — not a scan of the bulk
  // leads array, same small pattern as Phase 6a.
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  useEffect(() => {
    if (!drawerLeadId) { setDrawerLead(null); return; }
    let cancelled = false;
    apiGetLead(drawerLeadId)
      .then(row => { if (!cancelled) setDrawerLead(mapApiLeadToFrontendLead(row)); })
      .catch(() => { if (!cancelled) setDrawerLead(null); });
    return () => { cancelled = true; };
  }, [drawerLeadId]);

  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  const leadCell = (name: string, phone: string) => (
    <>
      <p className="font-bold text-slate-800">{name}</p>
      <p className="text-[10px] text-slate-400 font-mono">{maskPhone(phone)}</p>
    </>
  );
  const statusPill = (status: LeadStatus) => (
    <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${statusBadgeClasses(status)}`}>{status}</span>
  );
  const kpiDetail = useMemo((): { columns: string[]; rows: MetricDetailRow[]; empty: string; rowLabel: string } | null => {
    if (!openKpi) return null;
    if (openKpi === "missedLeads") {
      return {
        columns: ["Lead", "Property", "Assigned At", "Wait Time"],
        rows: missedLeadsList.rows.map(lead => {
          const info = getMissedInfo(lead);
          return {
            key: lead.id,
            leadId: lead.id,
            cells: [
              leadCell(lead.name, lead.phone),
              lead.property || "—",
              <span key="a" className="font-mono">{fmtDate(lead.assignedAt)}</span>,
              info.responseMinutes === undefined
                ? <span key="w" className="font-bold text-red-600">Still waiting</span>
                : <span key="w" className="font-bold text-red-600">{formatMinutes(info.responseMinutes)}</span>
            ]
          };
        }),
        empty: "No missed leads in this date range.",
        rowLabel: "Lead"
      };
    }
    if (openKpi === "missedFollowups") {
      return {
        columns: ["Lead", "Type", "Scheduled", "Overdue By"],
        rows: followupsModalPagination.pageRows.map(f => {
          const missedAt = f.dueNotifiedAt ? new Date(f.dueNotifiedAt).getTime() + 10 * 60000 : new Date(`${f.date}T00:00:00`).getTime();
          const overdue = Math.round((Date.now() - missedAt) / 60000);
          return {
            key: f.id,
            leadId: f.leadId,
            cells: [
              leadCell(f.leadName, f.phone),
              f.type,
              <span key="s" className="font-mono">{f.date} • {f.time}</span>,
              overdue > 0 ? <span key="o" className="font-bold text-amber-700">{formatMinutes(overdue)}</span> : "—"
            ]
          };
        }),
        empty: "No missed follow-ups in this date range.",
        rowLabel: "Follow-up"
      };
    }
    const lastActivity = openKpi === "contacted";
    return {
      columns: ["Lead", "Property", "Status", lastActivity ? "Last Activity" : "Assigned At"],
      rows: funnelKpiList.rows.map(l => {
        const latest = l.logs.length > 0 ? l.logs[l.logs.length - 1] : undefined;
        return {
          key: l.id,
          leadId: l.id,
          cells: [
            leadCell(l.name, l.phone),
            l.property || "—",
            statusPill(l.status),
            <span key="d" className="font-mono">{fmtDate(lastActivity ? latest?.timestamp : l.assignedAt)}</span>
          ]
        };
      }),
      empty: "No leads here in this date range.",
      rowLabel: "Lead"
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKpi, missedLeadsList.rows, followupsModalPagination.pageRows, funnelKpiList.rows]);
  const openKpiCard = kpiCards.find(c => c.key === openKpi);

  // Same Booking guard as the Leads page: booking needs a real deal value.
  const handleDrawerStatusChange = async (leadId: string, status: LeadStatus) => {
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
    } else {
      updateLeadStatus(leadId, status);
    }
  };

  // Missed Follow-ups' always-visible tab table jumps back to page 1 when
  // the agent or date range changes (Missed Leads' tab table resets on its
  // own, via missedLeadsList's own filters-changed effect).
  const detailResetKey = JSON.stringify([activeAgent, dateRange]);
  const agentListPagination = usePagination(agentNames, 10, JSON.stringify(dateRange));
  // Scheduled column sort (DateSortButton); undefined = the normal order.
  const [followupsSortDir, setFollowupsSortDir] = useState<SortDir | undefined>(undefined);
  const sortedMissedFollowups = useMemo(() => sortByDate(missedFollowups, followupsSortDir, f => f.scheduledAt), [missedFollowups, followupsSortDir]);
  const missedFollowupsPagination = usePagination(sortedMissedFollowups, 10, `${detailResetKey}|${followupsSortDir}`);

  const handleReassign = async (leadId: string, leadName: string) => {
    const target = await promptDialog({
      title: "Reassign lead",
      message: `Reassign "${leadName}" to which team member?`,
      label: "Team member",
      defaultValue: agentSalesTeamOptions.find(n => n !== activeAgent) || "",
      options: agentSalesTeamOptions,
      confirmLabel: "Reassign"
    });
    if (!target) return;
    if (!agentSalesTeamOptions.includes(target)) {
      toast("Please enter a valid team member name from the roster.", "warning");
      return;
    }
    const note = await promptDialog({
      title: `Reassign to ${target}`,
      message: leadName,
      label: "Note (required)",
      placeholder: "Note for the new agent — e.g. Prefers WhatsApp, call after 6 pm",
      confirmLabel: "Reassign",
      multiline: true,
      validate: (v) => (!v ? "Please write a note." : null)
    });
    if (note === null) return;
    try {
      await reassignLead(leadId, target, note);
      toast(`${leadName} reassigned to ${target}.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not reassign this lead. Please try again.", "error");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Agent selector — hidden entirely for a sales agent viewing their
            own report; there's nothing to pick when they can only ever see
            themselves. Visible (scoped to their team) for Managers, and
            unrestricted for Admin. */}
        {!isScopedToSelf && (
          <div className="lg:col-span-3 bg-white border border-slate-100 rounded-2xl shadow-sm p-4 space-y-2">
            <h3 className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider px-1">Sales Agents</h3>
            <div className="space-y-1 max-h-[28rem] overflow-y-auto pr-1">
              {isDataLoading && agentNames.length === 0 ? (
                <CardListSkeleton count={4} />
              ) : agentNames.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic px-1">No agents with lead activity in range.</p>
              ) : (
                agentListPagination.pageRows.map(name => {
                  const agentId = users.find(u => u.name === name)?.id;
                  const count = agentId ? (managerStatsByAgentId.get(agentId)?.leadsCount ?? 0) : 0;
                  const isManagedBy = reportsToByName.get(name);
                  return (
                    <button
                      key={name}
                      onClick={() => setSelectedAgent(name)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-between ${
                        activeAgent === name ? "bg-[#0B1E6E] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span className="[overflow-wrap:anywhere]">
                        {name}
                        {isManagedBy && (
                          <span className={`block text-[9px] font-semibold ${activeAgent === name ? "text-brand-100" : "text-slate-400"}`}>
                            reports to {isManagedBy}
                          </span>
                        )}
                      </span>
                      <span className={`shrink-0 ml-2 ${activeAgent === name ? "text-brand-100" : "text-slate-400"}`}>{count}</span>
                    </button>
                  );
                })
              )}
            </div>
            {agentNames.length > 0 && (
              <TablePagination
                totalRows={agentListPagination.paginationProps.totalRows}
                page={agentListPagination.page}
                rowsPerPage={agentListPagination.rowsPerPage}
                onPageChange={agentListPagination.setPage}
                rowLabel="Agent"
                className="!px-1 !pb-0"
              />
            )}
          </div>
        )}

        {/* Agent detail */}
        <div className={isScopedToSelf ? "lg:col-span-12 space-y-6" : "lg:col-span-9 space-y-6"}>
          {!activeAgent ? (
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-8 text-center text-xs text-slate-400">
              <Users className="h-10 w-10 text-slate-350 mx-auto mb-2" />
              Select a sales agent to view their individual report.
            </div>
          ) : (
            <>
              {/* Agent header. Allocated Spend / Booking ROI are for admins and
                  managers only — an agent's own view is just name + manager. */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-5 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto sm:flex-1">
                  <div className="h-11 w-11 rounded-full bg-[#0B1E6E] text-white text-sm font-bold flex items-center justify-center shrink-0">
                    {activeAgent.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-slate-800 [overflow-wrap:anywhere]">{activeAgent}</p>
                    <p className="text-xs text-slate-400">
                      {reportsToByName.get(activeAgent) ? `Reports to ${reportsToByName.get(activeAgent)}` : "Sales Manager / TL"}
                    </p>
                  </div>
                </div>
                {!isScopedToSelf && <div className="flex items-center flex-wrap gap-6">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Allocated Spend</span>
                    {isDataLoading ? (
                      <LineSkeleton width={70} height={18} />
                    ) : (
                      <p className="text-sm font-black text-slate-800 flex items-center gap-0.5">
                        <DollarSign className="h-3.5 w-3.5 text-slate-400" />
                        {formatCurrency(allocatedSpend)}
                      </p>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Booking ROI</span>
                    {isDataLoading ? (
                      <LineSkeleton width={50} height={18} />
                    ) : (
                      <p className="text-sm font-black text-emerald-650 flex items-center gap-1">
                        <TrendingUp className="h-3.5 w-3.5" />
                        {roi.toFixed(1)}x
                        <span className="text-[9px] font-semibold text-slate-450">· {bookingCount} bookings • {formatCurrency(bookingValue)}</span>
                      </p>
                    )}
                  </div>
                </div>}
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                {kpiCards.map(c => {
                  const Card = isScopedToSelf ? "button" : "div";
                  return (
                  <Card
                    key={c.label}
                    {...(isScopedToSelf ? { type: "button" as const, onClick: () => setOpenKpi(c.key) } : {})}
                    className={`bg-white border border-slate-100 rounded-2xl shadow-sm p-4 min-w-0 text-left ${
                      isScopedToSelf ? "group cursor-pointer transition-colors hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1E6E]/30" : ""
                    }`}
                  >
                    <span className={`h-9 w-9 rounded-xl flex items-center justify-center ${c.iconBg}`}>
                      <c.icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="text-xs font-semibold text-slate-500 block mt-3">{c.label}</span>
                    {isDataLoading ? (
                      <LineSkeleton width={40} height={26} />
                    ) : (
                      <p className={`text-2xl font-black mt-0.5 ${c.alert ? "text-red-600" : "text-slate-800"}`}>{c.value}</p>
                    )}
                    <span className="text-[10px] text-slate-400 block mt-0.5">{c.sub}</span>
                    {isScopedToSelf && (
                      <span className="mt-2 inline-block text-[10px] font-semibold text-[#0B1E6E] group-hover:underline">View details</span>
                    )}
                  </Card>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Sales Funnel */}
                <div className="lg:col-span-7 bg-white border border-slate-100 rounded-2xl shadow-sm p-5 space-y-4 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="ui-section-title flex items-center gap-1.5">
                      Sales Funnel
                      <span
                        className="text-slate-400 cursor-help"
                        title={"Assigned: leads given to the agent in this date range\nContacted: status moved past New Lead\nQualified: Call Back, Followup, EOI, Site Visit or Booked\nSite Visits: Site Visit Scheduled or Done"}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </span>
                    </h3>
                    <p className="ui-desc">
                      Conversion Rate (Assigned → Site Visit) <span className="ml-1 text-sm font-black text-slate-800">{pct(funnel.siteVisits)}%</span>
                    </p>
                  </div>
                  <div className="space-y-3">
                    {funnelRows.map(r => (
                      <div key={r.label} className="grid grid-cols-[5.5rem_2rem_1fr_2.75rem] items-center gap-3">
                        <span className="text-xs text-slate-600">{r.label}</span>
                        <span className="text-xs font-bold text-slate-800 text-right">{r.value}</span>
                        <div className="h-6 rounded-md bg-slate-100 overflow-hidden">
                          <div className={`h-full rounded-md transition-all duration-500 ${r.bar}`} style={{ width: `${pct(r.value)}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 text-right">{funnel.assigned === 0 ? "—" : `${pct(r.value)}%`}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Required */}
                <div className="lg:col-span-5 bg-white border border-slate-100 rounded-2xl shadow-sm p-5 space-y-3 min-w-0">
                  <h3 className="ui-section-title">Action Required</h3>
                  {[
                    { key: "missedLeads", label: "Missed Leads", value: reportStats.missedLeads, sub: `Leads not contacted within ${SLA_MINUTES} min SLA`, icon: AlertTriangle, tone: "bg-red-50 border-red-100", iconTone: "bg-red-100 text-red-600", btn: "bg-red-100/70 text-red-700 hover:bg-red-100", cta: "View Leads", tab: "leads" as "leads" | "followups" | null },
                    { key: "missedFollowups", label: "Missed Follow-ups", value: reportStats.missedFollowups, sub: "Follow-ups past reminder due time", icon: Clock, tone: "bg-amber-50 border-amber-100", iconTone: "bg-amber-100 text-amber-600", btn: "bg-amber-100/70 text-amber-800 hover:bg-amber-100", cta: "View Follow-ups", tab: "followups" as "leads" | "followups" | null },
                    // Manager/Admin-only — undefined for a Member viewing their
                    // own report (reportStats.totalMissedTasks is stripped
                    // server-side there), so this card simply never renders
                    // for the agent themselves. Lifetime count (migration
                    // 047), not bounded to the selected date range, and has
                    // no drill-down list of its own — just a tally.
                    ...(reportStats.totalMissedTasks !== undefined ? [{
                      key: "totalMissedTasks", label: "Total Missed Tasks", value: reportStats.totalMissedTasks,
                      sub: "Times this agent's leads were marked missed (lifetime)", icon: History,
                      tone: "bg-slate-50 border-slate-200", iconTone: "bg-slate-200 text-slate-600",
                      btn: "", cta: "", tab: null
                    }] : [])
                  ].map(a => (
                    <div key={a.label} className={`flex items-center gap-3 rounded-xl border p-3.5 ${a.tone}`}>
                      <span className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${a.iconTone}`}>
                        <a.icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold text-slate-700">{a.label}</p>
                        <p className="text-xl font-black text-slate-800 leading-tight">{isDataLoading ? "—" : a.value}</p>
                        <p className="text-[10px] text-slate-500">{a.sub}</p>
                      </div>
                      {/* Agent login only: jumps to the matching tab of the card below. */}
                      {isScopedToSelf && a.tab && <button
                        type="button"
                        onClick={() => openMissedTab(a.tab!)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors shrink-0 ${a.btn}`}
                      >
                        {a.cta} <ArrowRight className="h-3.5 w-3.5" />
                      </button>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Missed Leads / Missed Follow-ups — one card, switched by tabs
                  (same underline tabs as Campaigns' Property / Status). */}
              <div ref={missedDetailRef} className="scroll-mt-4 bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-4 text-sm" role="tablist">
                  {([["leads", "Missed Leads"], ["followups", "Missed Follow-ups"]] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={missedTab === key}
                      onClick={() => setMissedTab(key)}
                      className={`font-bold pb-1 border-b-2 transition-colors ${missedTab === key ? "text-[#0B1E6E] border-[#0B1E6E]" : "text-slate-400 border-transparent hover:text-slate-600"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {missedTab === "leads" && (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  {/* Phones: one card per missed lead — same shape as MetricDetailModal's card list */}
                  <ul className="sm:hidden divide-y divide-slate-100">
                    {missedLeadsList.loading && missedLeadsList.rows.length === 0 ? (
                      <CardListSkeleton count={4} />
                    ) : missedLeadsList.totalCount === 0 ? (
                      <li className="p-6 text-center text-xs text-slate-400 italic font-semibold">No missed leads for {activeAgent} in this date range.</li>
                    ) : (
                      missedLeadsList.rows.map(lead => {
                        const info = getMissedInfo(lead);
                        const latestLog = lead.logs.length > 0 ? lead.logs[lead.logs.length - 1] : undefined;
                        const missedAtTime = lead.assignedAt ? new Date(lead.assignedAt).getTime() + SLA_MINUTES * 60000 : undefined;
                        const activityTime = latestLog ? new Date(latestLog.timestamp).getTime() : Date.now();
                        const overdueMinutes = missedAtTime !== undefined ? Math.round((activityTime - missedAtTime) / 60000) : undefined;
                        return (
                          <li
                            key={lead.id}
                            onClick={(e) => {
                              const target = e.target as HTMLElement;
                              if (!e.currentTarget.contains(target)) return;
                              if (target.closest("button, a, input, select, textarea, label, [role='button'], [role='combobox'], [role='listbox']")) return;
                              if (window.getSelection()?.toString()) return;
                              setDrawerLeadId(lead.id);
                            }}
                            className="p-4 space-y-3 text-xs cursor-pointer"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-bold text-slate-800">{lead.name}</p>
                                <p className="text-[10px] text-slate-450 font-mono">{activeRole === "ADMIN" ? lead.phone : maskPhone(lead.phone)}</p>
                              </div>
                              {activeRole === "ADMIN" && (
                                <button
                                  onClick={() => handleReassign(lead.id, lead.name)}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-600 shrink-0"
                                >
                                  <RefreshCw className="h-3 w-3" /> Reassign
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                              <div>
                                <span className="block text-[10px] font-semibold text-slate-400">Wait Time</span>
                                <span className="font-bold text-red-650">{formatMinutes(info.responseMinutes)}</span>
                                {info.responseMinutes === undefined && <span className="text-[9px] text-slate-400 block">still waiting</span>}
                              </div>
                              <div>
                                <span className="block text-[10px] font-semibold text-slate-400">Overdue By</span>
                                {overdueMinutes !== undefined && overdueMinutes > 0 ? (
                                  <span className="font-bold text-amber-700">{formatMinutes(overdueMinutes)}</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                                {!latestLog && <span className="text-[9px] text-slate-400 block">and counting</span>}
                              </div>
                              <div>
                                <span className="block text-[10px] font-semibold text-slate-400">Assigned At</span>
                                <span className="font-mono text-slate-600">
                                  {lead.assignedAt ? new Date(lead.assignedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                                </span>
                              </div>
                              <div>
                                <span className="block text-[10px] font-semibold text-slate-400">Reassigned At</span>
                                <span className="font-mono text-slate-600">
                                  {lead.reassignedAt
                                    ? new Date(lead.reassignedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                                    : "Not reassigned"}
                                </span>
                              </div>
                            </div>
                            <div>
                              <span className="block text-[10px] font-semibold text-slate-400">Notes</span>
                              <p className="text-slate-500 line-clamp-3 [overflow-wrap:anywhere]">{latestLog?.message || "No activity logged."}</p>
                            </div>
                          </li>
                        );
                      })
                    )}
                  </ul>
                  <div className="hidden sm:block overflow-x-auto">
                  <table className={`table-fixed w-full text-[11px] border-collapse ${activeRole === "ADMIN" ? "min-w-[1050px]" : "min-w-[900px]"}`}>
                    <colgroup>
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      {activeRole === "ADMIN" && <col />}
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Lead</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap"><DateSortButton label="Assigned At" dir={missedLeadsList.sortDir} onChange={missedLeadsList.setSortDir} /></th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Wait Time</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Overdue By</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Notes</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Reassigned At</th>
                        {activeRole === "ADMIN" && <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {missedLeadsList.loading && missedLeadsList.rows.length === 0 ? (
                        <TableRowsSkeleton rows={6} columns={activeRole === "ADMIN" ? 7 : 6} />
                      ) : missedLeadsList.totalCount === 0 ? (
                        <tr>
                          <td colSpan={activeRole === "ADMIN" ? 7 : 6} className="p-6 text-center text-slate-400 italic font-semibold">
                            No missed leads for {activeAgent} in this date range.
                          </td>
                        </tr>
                      ) : (
                        missedLeadsList.rows.map(lead => {
                          const info = getMissedInfo(lead);
                          const latestLog = lead.logs.length > 0 ? lead.logs[lead.logs.length - 1] : undefined;
                          // "Missed" fires SLA_MINUTES after assignment — this is how
                          // far past that deadline the logged activity (or "now", if
                          // still untouched) landed, i.e. the gap between the SLA
                          // breach and when the agent actually did something.
                          const missedAtTime = lead.assignedAt ? new Date(lead.assignedAt).getTime() + SLA_MINUTES * 60000 : undefined;
                          const activityTime = latestLog ? new Date(latestLog.timestamp).getTime() : Date.now();
                          const overdueMinutes = missedAtTime !== undefined ? Math.round((activityTime - missedAtTime) / 60000) : undefined;
                          return (
                            <tr
                              key={lead.id}
                              onClick={(e) => {
                                const target = e.target as HTMLElement;
                                if (!e.currentTarget.contains(target)) return;
                                if (target.closest("button, a, input, select, textarea, label, [role='button'], [role='combobox'], [role='listbox']")) return;
                                if (window.getSelection()?.toString()) return;
                                setDrawerLeadId(lead.id);
                              }}
                              className="cursor-pointer hover:bg-slate-50/50"
                            >
                              <td className="px-4 py-3">
                                <p className="font-bold text-slate-800">{lead.name}</p>
                                <p className="text-[9px] text-slate-450 font-mono">{activeRole === "ADMIN" ? lead.phone : maskPhone(lead.phone)}</p>
                              </td>
                              <td className="px-4 py-3 font-mono text-slate-600">
                                {lead.assignedAt ? new Date(lead.assignedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-bold text-red-650">{formatMinutes(info.responseMinutes)}</span>
                                {info.responseMinutes === undefined && <span className="text-[9px] text-slate-400 block">still waiting</span>}
                              </td>
                              <td className="px-4 py-3">
                                {overdueMinutes !== undefined && overdueMinutes > 0 ? (
                                  <span className="font-bold text-amber-700">{formatMinutes(overdueMinutes)}</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                                {!latestLog && <span className="text-[9px] text-slate-400 block">and counting</span>}
                              </td>
                              <td className="px-4 py-3 text-slate-500">
                                <p className="line-clamp-3 [overflow-wrap:anywhere]" title={latestLog?.message}>{latestLog?.message || "No activity logged."}</p>
                                {latestLog && (
                                  <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                                    {new Date(latestLog.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono text-slate-600">
                                {lead.reassignedAt
                                  ? new Date(lead.reassignedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                                  : "Not reassigned"}
                              </td>
                              {activeRole === "ADMIN" && (
                                <td className="px-4 py-3 text-right">
                                  <RowActionsMenu
                                    label="Lead actions"
                                    actions={[{ label: "Reassign", icon: <RefreshCw className="h-4 w-4 text-slate-500" />, onClick: () => handleReassign(lead.id, lead.name) }]}
                                  />
                                </td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                  </div>
                  <TablePagination {...missedLeadsList.paginationProps} rowLabel="Missed Lead" />
                </div>
                )}
                {missedTab === "followups" && (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  {/* Phones: one card per missed follow-up */}
                  <ul className="sm:hidden divide-y divide-slate-100">
                    {isDataLoading && missedFollowups.length === 0 ? (
                      <CardListSkeleton count={4} />
                    ) : missedFollowups.length === 0 ? (
                      <li className="p-6 text-center text-xs text-slate-400 italic font-semibold">No missed follow-ups for {activeAgent} in this date range.</li>
                    ) : (
                      missedFollowupsPagination.pageRows.map(f => {
                        const missedAtTime = f.dueNotifiedAt
                          ? new Date(f.dueNotifiedAt).getTime() + 10 * 60000
                          : new Date(`${f.date}T00:00:00`).getTime();
                        const overdueMinutes = Math.round((Date.now() - missedAtTime) / 60000);
                        return (
                          <li
                            key={f.id}
                            onClick={f.leadId ? (e) => {
                              const target = e.target as HTMLElement;
                              if (!e.currentTarget.contains(target)) return;
                              if (target.closest("button, a, input, select, textarea, label, [role='button'], [role='combobox'], [role='listbox']")) return;
                              if (window.getSelection()?.toString()) return;
                              setDrawerLeadId(f.leadId!);
                            } : undefined}
                            className={`p-4 space-y-3 text-xs ${f.leadId ? "cursor-pointer" : ""}`}
                          >
                            <div>
                              <p className="font-bold text-slate-800">{f.leadName}</p>
                              <p className="text-[10px] text-slate-450 font-mono">{activeRole === "ADMIN" ? f.phone : maskPhone(f.phone)}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                              <div>
                                <span className="block text-[10px] font-semibold text-slate-400">Type</span>
                                <span className="text-slate-600">{f.type}</span>
                              </div>
                              <div>
                                <span className="block text-[10px] font-semibold text-slate-400">Overdue By</span>
                                {overdueMinutes > 0 ? (
                                  <span className="font-bold text-amber-700">{formatMinutes(overdueMinutes)}</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </div>
                              <div className="col-span-2">
                                <span className="block text-[10px] font-semibold text-slate-400">Scheduled</span>
                                <span className="font-mono text-slate-600">{f.date} • {f.time}</span>
                              </div>
                            </div>
                          </li>
                        );
                      })
                    )}
                  </ul>
                  <div className="hidden sm:block overflow-x-auto">
                  <table className="table-fixed w-full min-w-[600px] text-[11px] border-collapse">
                    <colgroup>
                      <col />
                      <col />
                      <col />
                      <col />
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Lead</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap"><DateSortButton label="Scheduled" dir={followupsSortDir} onChange={setFollowupsSortDir} /></th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Overdue By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {isDataLoading && missedFollowups.length === 0 ? (
                        <TableRowsSkeleton rows={6} columns={4} />
                      ) : missedFollowups.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-6 text-center text-slate-400 italic font-semibold">
                            No missed follow-ups for {activeAgent} in this date range.
                          </td>
                        </tr>
                      ) : (
                        missedFollowupsPagination.pageRows.map(f => {
                          // Missed time = when it became due (falls back to the
                          // originally scheduled time for older rows from before
                          // the scheduler existed) + the 10-minute SLA. Overdue By
                          // is simply that deadline compared against right now.
                          const missedAtTime = f.dueNotifiedAt
                            ? new Date(f.dueNotifiedAt).getTime() + 10 * 60000
                            : new Date(`${f.date}T00:00:00`).getTime();
                          const overdueMinutes = Math.round((Date.now() - missedAtTime) / 60000);
                          return (
                            <tr
                              key={f.id}
                              onClick={f.leadId ? (e) => {
                                const target = e.target as HTMLElement;
                                if (!e.currentTarget.contains(target)) return;
                                if (target.closest("button, a, input, select, textarea, label, [role='button'], [role='combobox'], [role='listbox']")) return;
                                if (window.getSelection()?.toString()) return;
                                setDrawerLeadId(f.leadId!);
                              } : undefined}
                              className={`hover:bg-slate-50/50 ${f.leadId ? "cursor-pointer" : ""}`}
                            >
                              <td className="px-4 py-3">
                                <p className="font-bold text-slate-800">{f.leadName}</p>
                                <p className="text-[9px] text-slate-450 font-mono">{activeRole === "ADMIN" ? f.phone : maskPhone(f.phone)}</p>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{f.type}</td>
                              <td className="px-4 py-3 font-mono text-slate-600">{f.date} • {f.time}</td>
                              <td className="px-4 py-3">
                                {overdueMinutes > 0 ? (
                                  <span className="font-bold text-amber-700">{formatMinutes(overdueMinutes)}</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                  </div>
                  <TablePagination {...missedFollowupsPagination.paginationProps} rowLabel="Missed Follow-up" />
                </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {isScopedToSelf && openKpiCard && kpiDetail && (
        <MetricDetailModal
          open
          onClose={() => setOpenKpi(null)}
          title={openKpiCard.label}
          subtitle={`${activeAgent} · ${dateRange.from.split("-").reverse().join("-")} to ${dateRange.to.split("-").reverse().join("-")}`}
          columns={kpiDetail.columns}
          rows={kpiDetail.rows}
          loading={openKpi === "missedLeads" ? missedLeadsList.loading : openKpi === "missedFollowups" ? false : funnelKpiList.loading}
          search={openKpi === "missedLeads" ? missedLeadsList.search : openKpi === "missedFollowups" ? followupsModalSearch : funnelKpiList.search}
          onSearchChange={openKpi === "missedLeads" ? missedLeadsList.setSearch : openKpi === "missedFollowups" ? setFollowupsModalSearch : funnelKpiList.setSearch}
          paginationProps={openKpi === "missedLeads" ? missedLeadsList.paginationProps : openKpi === "missedFollowups" ? followupsModalPagination.paginationProps : funnelKpiList.paginationProps}
          emptyText={kpiDetail.empty}
          rowLabel={kpiDetail.rowLabel}
          onRowClick={setDrawerLeadId}
        />
      )}
      {isScopedToSelf && (
        <LeadDetailDrawer
          lead={drawerLead}
          isOpen={drawerLead !== null}
          onClose={() => setDrawerLeadId(null)}
          onUpdateStatus={handleDrawerStatusChange}
        />
      )}
    </div>
  );
}
