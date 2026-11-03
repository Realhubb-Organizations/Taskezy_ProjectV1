"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, Search, X } from "lucide-react";
import { useApp, Lead, LeadStatus, mapApiLeadToFrontendLead } from "@/context/AppContext";
import LeadDetailDrawer from "@/components/crm/LeadDetailDrawer";
import LeadScheduleModal from "@/components/crm/LeadScheduleModal";
import { useLeadStatusChange } from "@/components/crm/LeadDrillDownPanel";
import MissedCountBadge from "@/components/crm/MissedCountBadge";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/SearchableDropdown";
import TablePagination from "@/components/ui/TablePagination";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";
import { useServerLeadList } from "@/lib/useServerLeadList";
import { useLeadStatusScheduler } from "@/lib/leadScheduler";
import { canChangeLeadStatus, STATUS_LOCKED_HINT } from "@/lib/leadAssignment";
import { STATUS_OPTIONS, dbCodeToFrontendStatus, frontendStatusToDbCode, nextStatusOptions, withDeadLeadGate } from "@/lib/leadStatusMapping";
import { maskEmail, maskPhone } from "@/lib/maskPII";
import { downloadReportCsv } from "@/lib/csv";
import { useDialog } from "@/components/ui/DialogProvider";
import {
  apiGetLead,
  apiListLeadsPage,
  apiListTeamMissedTasks,
  type LeadListFilters,
  type TeamMissedTaskRow,
  type ReportExportFilters,
  type TeamReportFilters
} from "@/lib/apiClient";

// Reports → Team Reports → Salesperson Missed Task Report.
//   Missed Leads:     leads not responded to within the SLA after being
//                     assigned (GET /leads?missedOnly — same rule as the
//                     Leads page); Task Time = when the lead was assigned.
//   Missed Followups: follow-up tasks that went missed (GET
//                     /reports/team/missed-tasks — the Missed Tasks card's
//                     tasks); Task Time = when the task was due.
// Both use the page's filters; Status narrows by the lead's current status
// and each row's status can be changed in place (same rules and scheduling
// popup as the Leads tables).

type Tab = "leads" | "followups";

interface Row {
  key: string;
  taskTime: string | undefined;
  lead: Lead;
  feedback: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** "2026-07-15" and "08:34:04" (local time). */
const taskTimeParts = (iso: string | undefined): [string, string] => {
  if (!iso) return ["-", ""];
  const d = new Date(iso);
  if (isNaN(d.getTime())) return ["-", ""];
  return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`];
};

const latestLog = (l: Lead) => [...(l.logs || [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]?.message;
const feedbackOf = (notes: string | null | undefined, fallback?: string) => notes?.trim() || fallback || "-";

/** A follow-up task row as a (partial) Lead — enough for the status dropdown and drawer fallback. */
const taskLead = (r: TeamMissedTaskRow): Lead => ({
  id: r.lead_id,
  name: r.lead_name,
  phone: r.phone ?? "",
  email: r.email ?? "",
  status: dbCodeToFrontendStatus(r.lead_status),
  assignedAgentId: r.assigned_agent_id ?? undefined,
  assignedAgent: r.lead_agent_name ?? "",
  property: r.property_name ?? undefined,
  missedTaskCount: r.missed_task_count,
  notes: r.notes ?? undefined,
  logs: []
} as unknown as Lead);

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }).catch(() => {});
      }}
      className="text-slate-400 hover:text-brand-700 shrink-0"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export default function MissedTaskReport({ filters, baseDrill, refreshKey, exportFilters }: {
  /** The page's filters (for Missed Followups). */
  filters: TeamReportFilters;
  /** The same filters in GET /leads form (for Missed Leads). */
  baseDrill: LeadListFilters;
  /** Changes on live updates. */
  refreshKey: unknown;
  /** The page's filters as labels, saved with each download record. */
  exportFilters: ReportExportFilters;
}) {
  const { currentUser, users, activeRole } = useApp();
  const { toast } = useDialog();
  const isAdmin = activeRole === "ADMIN";
  const [tab, setTab] = useState<Tab>("leads");

  // ---- Header filters: lead name search + Status ----
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  const closeSearch = () => { setSearch(""); setSearchOpen(false); };
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const statusCodes = useMemo(
    () => statusFilter.map(s => frontendStatusToDbCode(s as LeadStatus)).filter((c): c is string => !!c),
    [statusFilter]
  );

  // ---- Missed Leads ----
  const leadFilters: LeadListFilters = useMemo(
    () => ({ ...baseDrill, missedOnly: true, status: statusCodes.length > 0 ? statusCodes : undefined }),
    [baseDrill, statusCodes]
  );
  const missedLeads = useServerLeadList(leadFilters, 10, tab === "leads");
  useEffect(() => { missedLeads.setSearch(search.trim()); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Missed Followups ----
  const [taskRows, setTaskRows] = useState<TeamMissedTaskRow[]>([]);
  const [taskTotal, setTaskTotal] = useState(0);
  const [taskPage, setTaskPage] = useState(1);
  const [taskRowsPerPage, setTaskRowsPerPage] = useState(10);
  const [taskLoading, setTaskLoading] = useState(false);
  const taskKey = JSON.stringify({ filters, debouncedSearch, statusCodes });
  useEffect(() => { setTaskPage(1); }, [taskKey]);
  useEffect(() => {
    if (tab !== "followups") return;
    let cancelled = false;
    setTaskLoading(true);
    apiListTeamMissedTasks(filters, taskPage, taskRowsPerPage, { search: debouncedSearch || undefined, leadStatus: statusCodes })
      .then(result => { if (!cancelled) { setTaskRows(result.rows); setTaskTotal(result.totalCount); } })
      .catch(() => { /* keep the previous page on a transient failure */ })
      .finally(() => { if (!cancelled) setTaskLoading(false); });
    return () => { cancelled = true; };
    // taskKey covers filters/search/status
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, taskKey, taskPage, taskRowsPerPage, refreshKey]);

  const rows: Row[] = tab === "leads"
    ? missedLeads.rows.map(l => ({ key: l.id, taskTime: l.assignedAt ?? l.createdAtStr, lead: l, feedback: feedbackOf(l.notes, latestLog(l)) }))
    : taskRows.map(r => ({ key: r.id, taskTime: r.scheduled_at, lead: taskLead(r), feedback: feedbackOf(r.notes) }));
  const loading = tab === "leads" ? missedLeads.loading : taskLoading;
  const paginationProps = tab === "leads"
    ? missedLeads.paginationProps
    : {
      totalRows: taskTotal,
      page: taskPage,
      rowsPerPage: taskRowsPerPage,
      onPageChange: setTaskPage,
      onRowsPerPageChange: (n: number) => { setTaskRowsPerPage(n); setTaskPage(1); }
    };

  // ---- Status change (same rules and scheduling popup as the Leads tables) ----
  const handleStatusChange = useLeadStatusChange();
  const statusScheduler = useLeadStatusScheduler(handleStatusChange);
  const renderStatus = (l: Lead) => !canChangeLeadStatus(l, currentUser, users) || currentUser?.role_type === "Manager" ? (
    <span className="text-xs font-semibold text-slate-800" title={STATUS_LOCKED_HINT}>{l.status}</span>
  ) : (
    <SearchableSelect
      variant="inline"
      options={withDeadLeadGate([l.status, ...nextStatusOptions(l.status).map(c => c.status)], l, isAdmin)}
      value={l.status}
      onChange={(v) => statusScheduler.requestChange(l, v as LeadStatus)}
      searchPlaceholder="Search status..."
      panelWidth={176}
      className="text-xs text-slate-800"
    />
  );

  // ---- Lead drawer ----
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const showLead = (l: Lead) => {
    setOpenLead(l);
    apiGetLead(l.id).then(row => setOpenLead(mapApiLeadToFrontendLead(row))).catch(() => {});
  };

  // ---- Download: every row of the current tab with the current filters ----
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const all: Row[] = [];
      for (let page = 1; page <= 40; page++) {
        if (tab === "leads") {
          const result = await apiListLeadsPage(page, 500, { ...leadFilters, search: debouncedSearch || undefined });
          result.rows.map(mapApiLeadToFrontendLead).forEach(l => all.push({ key: l.id, taskTime: l.assignedAt ?? l.createdAtStr, lead: l, feedback: feedbackOf(l.notes, latestLog(l)) }));
          if (all.length >= result.totalCount || result.rows.length === 0) break;
        } else {
          const result = await apiListTeamMissedTasks(filters, page, 100, { search: debouncedSearch || undefined, leadStatus: statusCodes });
          result.rows.forEach(r => all.push({ key: r.id, taskTime: r.scheduled_at, lead: taskLead(r), feedback: feedbackOf(r.notes) }));
          if (all.length >= result.totalCount || result.rows.length === 0) break;
        }
      }
      await downloadReportCsv(
        `Team Reports · Salesperson Missed Task Report · ${tab === "leads" ? "Missed Leads" : "Missed Followups"}`,
        {
          ...exportFilters,
          ...(debouncedSearch ? { "Lead Name": debouncedSearch } : {}),
          ...(statusFilter.length > 0 ? { Status: statusFilter } : {})
        },
        `${tab === "leads" ? "missed-leads" : "missed-followups"}_${filters.dateFrom ?? ""}_to_${filters.dateTo ?? ""}.csv`,
        ["Task Time", "Lead Name", "Phone", "Email", "Status", "Salesperson", "Feedback"],
        all.map(r => [
          taskTimeParts(r.taskTime).join(" "),
          r.lead.name,
          isAdmin ? r.lead.phone : maskPhone(r.lead.phone),
          r.lead.email ? (isAdmin ? r.lead.email : maskEmail(r.lead.email)) : "",
          r.lead.status,
          r.lead.assignedAgent ?? "",
          r.feedback
        ])
      );
    } catch {
      toast("Couldn't start the download. Please try again.", "error");
    } finally {
      setDownloading(false);
    }
  };

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    setTab(next);
  };

  return (
    <div className="border border-slate-300 rounded-3xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 pb-3">
        <h3 className="ui-section-title">Salesperson Missed Task Report</h3>
        <button type="button" onClick={download} disabled={downloading} className="ui-btn ui-btn-secondary border !px-2.5 disabled:opacity-60" title="Download CSV" aria-label="Download CSV">
          <Download className="h-4 w-4 text-blue-600" />
        </button>
      </div>

      {/* Tabs — same underlined style as the report tabs at the top */}
      <div className="flex items-center gap-6 sm:gap-8 px-5 sm:px-6 pt-2 pb-4">
        {([["leads", "Missed Leads"], ["followups", "Missed Followups"]] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => switchTab(key)}
            className={`pb-1.5 text-[13px] font-semibold border-b-2 transition-colors ${
              tab === key ? "border-[#1E3A8A] text-[#1E3A8A]" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto px-5 sm:px-6">
        <table className="w-full table-fixed text-left border-collapse min-w-[760px]">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-bold text-slate-800">
              <th className="py-3 pr-4 w-[16%]">Task Time</th>
              <th className="py-3 pr-4 w-[22%] whitespace-nowrap">
                {searchOpen ? (
                  <div className="flex items-center gap-1 max-w-[200px]">
                    <input
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onBlur={() => { if (!search.trim()) closeSearch(); }}
                      placeholder="Search lead..."
                      className="min-w-0 flex-1 bg-white border border-brand-400 rounded-md px-1.5 py-1 text-[11px] font-normal focus:outline-none"
                    />
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={closeSearch} className="text-slate-400 hover:text-slate-700 shrink-0" title="Close search">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    Lead Name
                    <button type="button" onClick={() => setSearchOpen(true)} className="text-slate-400 hover:text-brand-700" title="Search">
                      <Search className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </th>
              <th className="py-3 pr-4 w-[20%]">Email</th>
              <th className="py-3 pr-4 w-[18%]">
                <SearchableMultiSelect variant="inline"
                  label="Status"
                  options={STATUS_OPTIONS}
                  selected={statusFilter}
                  onChange={setStatusFilter}
                  searchPlaceholder="Search status..."
                  panelWidth={200}
                />
              </th>
              <th className="py-3 pr-4 w-[24%]">Feedback</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading && rows.length === 0 ? (
              <TableRowsSkeleton rows={4} columns={5} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-xs text-slate-400 italic">
                  {tab === "leads" ? "No missed leads for these filters." : "No missed follow-ups for these filters."}
                </td>
              </tr>
            ) : (
              rows.map(r => {
                const [day, time] = taskTimeParts(r.taskTime);
                const l = r.lead;
                return (
                  <tr key={r.key} className="text-xs text-slate-700 align-top">
                    <td className="py-4 pr-4 tabular-nums">
                      <p>{day}</p>
                      <p>{time}</p>
                    </td>
                    <td className="py-4 pr-4">
                      <button type="button" onClick={() => showLead(l)} className="font-bold text-slate-900 hover:text-[#0B1E6E] hover:underline text-left [overflow-wrap:anywhere]">
                        {l.name}
                      </button>
                      {l.phone && (
                        <p className="flex items-center gap-1 text-[10px] text-slate-500 font-mono mt-0.5">
                          <span className="truncate">{isAdmin ? l.phone : maskPhone(l.phone)}</span>
                          <CopyButton value={l.phone} label="phone" />
                        </p>
                      )}
                      <MissedCountBadge count={l.missedTaskCount} />
                    </td>
                    <td className="py-4 pr-4">
                      {l.email ? (
                        <p className="flex items-center gap-1 min-w-0">
                          <span className="truncate" title={isAdmin ? l.email : undefined}>{isAdmin ? l.email : maskEmail(l.email)}</span>
                          <CopyButton value={l.email} label="email" />
                        </p>
                      ) : "-"}
                    </td>
                    <td className="py-4 pr-4">{renderStatus(l)}</td>
                    <td className="py-4 pr-4">
                      <p className="line-clamp-3 [overflow-wrap:anywhere]" title={r.feedback}>{r.feedback}</p>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <TablePagination {...paginationProps} rowLabel="Row" />

      {openLead && (
        <LeadDetailDrawer lead={openLead} isOpen={!!openLead} onClose={() => setOpenLead(null)} onUpdateStatus={handleStatusChange} />
      )}
      {statusScheduler.pendingSchedule && (
        <LeadScheduleModal
          pending={statusScheduler.pendingSchedule}
          submitting={statusScheduler.submitting}
          error={statusScheduler.error}
          onCancel={statusScheduler.cancelSchedule}
          onConfirm={statusScheduler.confirmSchedule}
        />
      )}
    </div>
  );
}
