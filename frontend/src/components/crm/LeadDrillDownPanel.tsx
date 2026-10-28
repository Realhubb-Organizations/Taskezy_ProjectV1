"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import LeadRowActionsMenu from "./LeadRowActionsMenu";
import { createPortal } from "react-dom";
import { useApp, Lead, LeadStatus, FollowupCall, mapApiFollowupToFrontend, mapApiLeadToFrontendLead } from "@/context/AppContext";
import { apiListFollowupsPage, apiGetDistinctCampaigns, apiGetLead, LeadListFilters } from "@/lib/apiClient";
import LeadDetailDrawer from "./LeadDetailDrawer";
import { openOnRowClick, LEAD_ROW_CLASS } from "@/lib/rowClick";
import { useServerLeadList } from "@/lib/useServerLeadList";
import { useDialog } from "@/components/ui/DialogProvider";
import { deriveActivityTimeline, PICKABLE_STATUS_OPTIONS, statusBadgeClasses, frontendStatusToDbCode, withDeadLeadGate, nextStatusOptions } from "@/lib/leadStatusMapping";
import { WhatsAppIcon, CallIcon } from "@/components/icons/ContactIcons";
import { Phone, Mail, X, Copy, Check, User, Search, ArrowRight } from "lucide-react";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/SearchableDropdown";
import TablePagination, { usePagination } from "@/components/ui/TablePagination";
import { DateTimeLines, dateTimeParts } from "@/components/ui/DateTimeLines";
import { canChangeLeadStatus, STATUS_LOCKED_HINT, isLeadAssignableUser } from "@/lib/leadAssignment";
import { nextFollowupFor } from "@/lib/followups";
import { maskPhone, maskEmail } from "@/lib/maskPII";
import { canTriggerLeadCall, triggerLeadCall, triggerLeadWhatsApp } from "@/lib/callTrigger";
import NextCallCell from "./NextCallCell";
import { callSubStatusOf } from "@/lib/callSubStatus";
import { useLeadStatusScheduler } from "@/lib/leadScheduler";
import LeadScheduleModal from "./LeadScheduleModal";

// Drill-down table + lead quick-view drawer behind the 7 lead stat cards
// (Total Leads … Site Visit Done). Shared by the CRM Dashboard and the admin
// Leads page so clicking a same-named card opens the exact same panel on both.

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

// Booking a lead auto-generates a real invoice using this deal value as
// the base amount (see AppContext's updateLeadStatus) — a real value is
// required here, not invented, matching the same guard used everywhere
// else in the app a status dropdown can reach a Booking status.
export function useLeadStatusChange() {
  const { updateLeadStatus } = useApp();
  const { toast, prompt: promptDialog } = useDialog();
  return async (leadId: string, status: LeadStatus) => {
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
}

// Lead quick-view — a right-side drawer. Scoped to these pages only (the
// shared LeadDetailDrawer used elsewhere is untouched); portaled to <body>
// since the pages' root wrappers carry animate-fade-in, which would
// otherwise become the containing block for a fixed-position overlay.
// Render it only while a lead is open.
export function LeadQuickViewDrawer({ lead, onClose }: {
  lead: Lead;
  onClose: () => void;
}) {
  const { currentUser, activeRole, recordCallEnded } = useApp();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const callAllowed = canTriggerLeadCall(activeRole === "ADMIN", currentUser?.email);
  const handleCall = () => {
    triggerLeadCall(lead, {
      isAdmin: activeRole === "ADMIN",
      userEmail: currentUser?.email,
      onCallEnded: (leadId, startedAt, durationSeconds) => {
        recordCallEnded(leadId, startedAt, durationSeconds).catch((err) =>
          console.warn("Could not record call feedback gate:", err)
        );
      }
    });
  };

  // Activity History is paged (10 entries a page) — a long-lived lead can
  // carry an unbounded number of logs. The timeline is derived from the full
  // log list first, so from → to transitions stay correct across page breaks.
  const timeline = useMemo(() => deriveActivityTimeline(lead.logs), [lead.logs]);
  const timelinePager = usePagination(timeline, 10, lead.id);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const goToTimelinePage = (p: number) => {
    timelinePager.setPage(p);
    timelineScrollRef.current?.scrollTo(0, 0);
  };

  const copyToClipboard = (field: string, value: string) => {
    navigator.clipboard.writeText(value).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1500);
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* Invisible click-outside-to-close catcher — no dark backdrop, the rest of the page stays fully visible */}
      <div className="fixed inset-0" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-slide-in">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start justify-between">
            <p className="text-base font-extrabold text-slate-900">{lead.name}</p>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 -mt-1">
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
          {/* Masked for Manager/sales agent, real for Admin — display-only,
              the tel:/mailto: hrefs always use the real value. Copy buttons
              removed entirely for non-admin (would otherwise leak the real
              value despite the masked text). See
              project_crm_role_based_lead_scoping memory (2026-10-10). */}
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <button
                type="button"
                onClick={() => callAllowed && handleCall()}
                disabled={!callAllowed}
                className="hover:text-brand-700 disabled:opacity-30 disabled:hover:text-slate-600"
                title={callAllowed ? undefined : "Calling is only available on the mobile app for your role"}
              >
                {activeRole === "ADMIN" ? lead.phone : maskPhone(lead.phone)}
              </button>
              {activeRole === "ADMIN" && (
                <button onClick={() => copyToClipboard("phone", lead.phone)} className="text-slate-350 hover:text-brand-700" title="Copy phone">
                  {copiedField === "phone" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                </button>
              )}
            </div>
            {lead.email && (
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <a href={`mailto:${lead.email}`} className="hover:text-brand-700 truncate">{activeRole === "ADMIN" ? lead.email : maskEmail(lead.email)}</a>
                {activeRole === "ADMIN" && (
                  <button onClick={() => copyToClipboard("email", lead.email!)} className="text-slate-350 hover:text-brand-700 shrink-0" title="Copy email">
                    {copiedField === "email" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Status + meta */}
        <div className="px-5 py-3 border-b border-slate-100 shrink-0 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500">Current Status :</span>
            {/* Read-only here (every role): the dashboard quick view only shows
                the status; it's changed from the Leads table or lead drawer. */}
            <div className="flex items-center gap-1.5">
              {callSubStatusOf(lead) && (
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-lg border ${
                    callSubStatusOf(lead) === "Qualified" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-600 bg-red-50 border-red-200"
                  }`}
                  title="Sub-status, set from Data Calling when the call is Connected"
                >
                  {callSubStatusOf(lead)}
                </span>
              )}
              <span className={`border rounded-lg px-2 py-0.5 text-[11px] font-semibold ${statusBadgeClasses(lead.status)}`}>
                {lead.status}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
            <span>Last Updated : {lastActivityTime(lead)}</span>
            {/* Ad-source attribution — Admin-only, same tier as the shared
                LeadDetailDrawer's Source/Campaign/Meta Page/Lead Form ID.
                See project_crm_role_based_lead_scoping memory (2026-10-10). */}
            {activeRole === "ADMIN" && <span>Source : {lead.source || lead.campaign || "Direct / Manual Entry"}</span>}
          </div>
        </div>

        {/* Assigned / Property / Reassigned / Captured */}
        <div className="px-5 py-3 border-b border-slate-100 shrink-0 grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
          <div>
            <span className="text-slate-400 font-bold text-[10px] block mb-0.5">Assigned To :</span>
            <span className="flex items-center gap-1 text-slate-800 font-semibold">
              <User className="h-3 w-3 text-slate-400" /> {lead.assignedAgent || "Unassigned"}
            </span>
          </div>
          <div>
            <span className="text-slate-400 font-bold text-[10px] block mb-0.5">Property :</span>
            <span className="flex items-center gap-1.5 flex-wrap text-slate-800 font-semibold">
              {lead.property || "Not set"}
              <span
                className={`shrink-0 border rounded-lg px-1.5 py-0.5 text-[10px] font-semibold ${lead.property ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}
                title={lead.property ? "This lead has a property linked" : "No property linked yet"}
              >
                {lead.property ? "Assigned" : "Unassigned"}
              </span>
            </span>
          </div>
          <div>
            <span className="text-slate-400 font-bold text-[10px] block mb-0.5">Reassign From :</span>
            <span className="flex items-center gap-1 text-slate-800 font-semibold">
              {lead.previousAgent && <User className="h-3 w-3 text-slate-400" />} {lead.previousAgent || "—"}
            </span>
          </div>
          <div>
            <span className="text-slate-400 font-bold text-[10px] block mb-0.5">Captured at :</span>
            <span className="text-slate-800 font-semibold">{formatDateTime(lead.createdAtStr)}</span>
          </div>
        </div>

        {/* Activity History — a real vertical timeline (connecting line +
            node per entry, newest first) inside its own bordered,
            independently-scrollable card. Transition labels (e.g.
            "Call Back → Follow Up") are parsed from the lead's real log
            messages via deriveActivityTimeline — never invented; see
            that function's comment for exactly which formats it reads
            and how it falls back when a message doesn't match one. */}
        <div className="px-5 py-3 flex-1 min-h-0 flex flex-col">
          <span className="text-[11px] font-bold text-slate-500 block mb-2 shrink-0">Activity History :</span>
          <div ref={timelineScrollRef} className="bg-[#F5F9FF] border border-slate-200 rounded-2xl shadow-sm flex-1 min-h-0 overflow-y-auto p-4">
            {lead.logs.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">No activity recorded yet.</p>
            ) : (
              <div className="relative pl-5">
                <div className="absolute left-[5px] top-2 bottom-2 w-0.5 bg-blue-400" />
                {timelinePager.pageRows.map((entry, idx) => (
                  <div key={idx} className="relative pb-4 last:pb-0">
                    <span className="absolute -left-5 top-1.5 h-3 w-3 rounded-full bg-blue-100 border-2 border-blue-500 z-10" />
                    <div className="inline-block bg-[#0B1E6E] text-white text-[10px] font-bold px-2.5 py-1 rounded-lg mb-1.5">
                      {formatDateTime(entry.log.timestamp)}
                    </div>
                    <div className="bg-[#EAF3FF] rounded-xl px-3 py-2.5">
                      <p className="text-[11px] text-slate-700 leading-snug">{entry.log.message}</p>
                      {entry.toLabel || entry.fromLabel ? (
                        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-blue-100 text-[9px]">
                          <span className="text-slate-500 font-bold flex items-center gap-1">
                            {entry.fromLabel && entry.toLabel && entry.fromLabel !== entry.toLabel ? (
                              <>{entry.fromLabel} <ArrowRight className="h-2.5 w-2.5 shrink-0" /> {entry.toLabel}</>
                            ) : (
                              entry.toLabel || entry.fromLabel
                            )}
                          </span>
                          <span className="text-slate-400 font-semibold shrink-0">{entry.log.user}</span>
                        </div>
                      ) : (
                        <p className="text-[9px] text-slate-400 font-semibold mt-1.5 pt-1.5 border-t border-blue-100 text-right">by {entry.log.user}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {timeline.length > 0 && (
          <TablePagination
            totalRows={timeline.length}
            page={timelinePager.page}
            rowsPerPage={timelinePager.rowsPerPage}
            onPageChange={goToTimelinePage}
            rowLabel="Activity Log"
            className="shrink-0"
          />
        )}
      </div>
    </div>,
    document.body
  );
}

export default function LeadDrillDownPanel({ title, baseFilters, onClose }: {
  // Selected stat card's label; null hides the panel.
  title: string | null;
  // That card's own filters (status codes + date range, etc.) — the
  // server applies the caller's own role-scope on top automatically, same
  // boundary every other leads endpoint already enforces.
  baseFilters: LeadListFilters;
  onClose: () => void;
}) {
  const { currentUser, users, activeRole, recordCallEnded, recordWhatsAppOpened } = useApp();
  const handleDrillStatusChange = useLeadStatusChange();
  // RNR/Call Back/Followup/Site Visit Scheduled are gated behind a
  // blocking popup (LeadScheduleModal below) before handleDrillStatusChange
  // (which already handles the Booked deal-value prompt) actually runs.
  const statusScheduler = useLeadStatusScheduler(handleDrillStatusChange);
  const callAllowed = canTriggerLeadCall(activeRole === "ADMIN", currentUser?.email);
  const handleCall = (lead: Lead) => {
    triggerLeadCall(lead, {
      isAdmin: activeRole === "ADMIN",
      userEmail: currentUser?.email,
      onCallEnded: (leadId, startedAt, durationSeconds) => {
        recordCallEnded(leadId, startedAt, durationSeconds).catch((err) =>
          console.warn("Could not record call feedback gate:", err)
        );
      }
    });
  };
  const handleWhatsApp = (lead: Lead) => {
    triggerLeadWhatsApp(lead, {
      isAdmin: activeRole === "ADMIN",
      senderName: currentUser?.name,
      onReturn: (leadId) => {
        recordWhatsAppOpened(leadId).catch((err) => console.warn("Could not record WhatsApp feedback gate:", err));
      }
    });
  };

  const [quickViewLead, setQuickViewLead] = useState<Lead | null>(null);
  const [drillSearchOpen, setDrillSearchOpen] = useState(false);
  const [drillStatusFilter, setDrillStatusFilter] = useState<string[]>([]);
  const [drillAssignedFilter, setDrillAssignedFilter] = useState<string[]>([]);
  const [drillCampaignFilter, setDrillCampaignFilter] = useState<string[]>([]);

  // Switching (or re-opening) a card starts its drill-down fresh — search
  // and the three column filters reset (the server fetch below resets its
  // own page whenever the resulting filters change); rows-per-page is kept.
  const [prevTitle, setPrevTitle] = useState(title);
  if (title !== prevTitle) {
    setPrevTitle(title);
    setDrillSearchOpen(false);
    setDrillStatusFilter([]);
    setDrillAssignedFilter([]);
    setDrillCampaignFilter([]);
  }

  const setDrillFilter = (setList: (v: string[]) => void) => (next: string[]) => setList(next);

  // The secondary Status filter narrows (ANDs with) the category's own
  // base status codes — e.g. opening "New Leads" then picking "RNR" here
  // always yields nothing, same as the old client-side filter's AND
  // behavior, not a silent override of the category.
  const effectiveStatus = useMemo(() => {
    const secondaryCodes = drillStatusFilter.map(s => frontendStatusToDbCode(s as LeadStatus)).filter((c): c is string => !!c);
    if (secondaryCodes.length === 0) return baseFilters.status;
    if (!baseFilters.status || baseFilters.status.length === 0) return secondaryCodes;
    const baseSet = new Set(baseFilters.status);
    return secondaryCodes.filter(c => baseSet.has(c));
  }, [drillStatusFilter, baseFilters.status]);

  const assignedAgentId = useMemo(
    () => (drillAssignedFilter.length > 0 ? users.filter(u => drillAssignedFilter.includes(u.name)).map(u => u.id) : baseFilters.assignedAgentId),
    [drillAssignedFilter, users, baseFilters.assignedAgentId]
  );
  const campaign = drillCampaignFilter.length > 0 ? drillCampaignFilter : baseFilters.campaign;

  const filters: LeadListFilters = useMemo(
    () => ({ ...baseFilters, status: effectiveStatus, assignedAgentId, campaign }),
    [baseFilters, effectiveStatus, assignedAgentId, campaign]
  );

  // One page at a time (10 rows by default), so opening a card never turns
  // the dashboard into one endless list — the graphs and task tables stay
  // right below. Real server pagination — totalCount is the true count,
  // never silently capped at whatever one page happens to return.
  const {
    rows: drillPageLeads,
    totalCount,
    loading: drillLoading,
    search: drillSearch,
    setSearch: setDrillSearch,
    paginationProps
  } = useServerLeadList(filters, 10);

  // Assigned-To dropdown options — the active sales roster, same as the
  // reassign-lead picker (can't derive from an in-memory full list anymore).
  const drillAssignedOptions = useMemo(
    () => Array.from(new Set(users.filter(isLeadAssignableUser).map(u => u.name))).sort(),
    [users]
  );

  // Campaign dropdown options — real distinct values for this category's
  // own scope, fetched from the server (same reason as Assigned above).
  const [drillCampaignOptions, setDrillCampaignOptions] = useState<string[]>([]);
  const baseFiltersKey = JSON.stringify(baseFilters);
  useEffect(() => {
    if (!title) return;
    let cancelled = false;
    apiGetDistinctCampaigns(baseFilters)
      .then(result => { if (!cancelled) setDrillCampaignOptions(result); })
      .catch(() => { if (!cancelled) setDrillCampaignOptions([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFiltersKey, title]);

  const drillScrollRef = useRef<HTMLDivElement>(null);
  const keepDrillTableInView = () => {
    const el = drillScrollRef.current;
    const main = el?.closest("main");
    if (!el || !main) return;
    const offset = el.getBoundingClientRect().top - main.getBoundingClientRect().top;
    if (offset < 0) main.scrollTo({ top: main.scrollTop + offset - 80, behavior: "smooth" });
  };

  // Real next-scheduled-call date, from the actual followup_calls queue —
  // "—" when no reminder was ever set for this lead, rather than a
  // fabricated createdAt+1day placeholder. Fetched just for the leads on
  // the current drill-down page (10 at a time), not the whole company's
  // follow-up table.
  const [pageFollowups, setPageFollowups] = useState<FollowupCall[]>([]);
  const pageLeadIds = drillPageLeads.map(l => l.id).join(",");
  // Re-fetch Next Call Dates when a call is scheduled anywhere (addFollowupCall
  // updates this list), not only when the rows change.
  const { followupCalls: liveFollowups } = useApp();
  useEffect(() => {
    if (!pageLeadIds) { setPageFollowups([]); return; }
    let cancelled = false;
    apiListFollowupsPage(1, 500, { leadId: pageLeadIds.split(",") })
      .then(({ rows }) => { if (!cancelled) setPageFollowups(rows.map(mapApiFollowupToFrontend)); })
      .catch(() => { if (!cancelled) setPageFollowups([]); });
    return () => { cancelled = true; };
  }, [pageLeadIds, liveFollowups]);
  const nextCallDateFor = (leadId: string) => nextFollowupFor(leadId, pageFollowups);

  // Drill-down table's per-row Status cell — the shared searchable dropdown,
  // in place of a plain native <select> (whose OS-default popup, e.g. dark
  // on macOS/Chrome, clashed with the rest of the app).
  // Manager can see but never change a lead's status directly — only an
  // Admin can; this was already true for the Data Calling drawer and is
  // now extended here too (this panel backs both the CRM Dashboard's and
  // the Leads page's stat-card drilldowns, so leaving it open would be a
  // loophole around the lock already applied to the main table row).
  // See project_crm_role_based_lead_scoping memory (2026-10-10).
  const renderRowStatusCell = (l: Lead) => !canChangeLeadStatus(l, currentUser, users) || currentUser?.role_type === "Manager" ? (
    <span className="inline-block max-w-[110px] text-[11px] text-slate-700" title={STATUS_LOCKED_HINT}>{l.status}</span>
  ) : (
    <SearchableSelect
      variant="inline"
      // Only statuses the transition matrix allows from this lead's current
      // one are offered — e.g. Site Visit Done only shows once the lead is
      // on Site Visit Scheduled (or Different Location), not from every
      // status. Same gate as LeadDashboard.tsx's inline status cell.
      options={withDeadLeadGate([l.status, ...nextStatusOptions(l.status).map(c => c.status)], l, activeRole === "ADMIN")}
      value={l.status}
      onChange={(v) => statusScheduler.requestChange(l, v as LeadStatus)}
      searchPlaceholder="Search status..."
      panelWidth={176}
      className="max-w-[110px] text-[11px] text-slate-700"
    />
  );

  return (
    <>
      {/* Drill-down table — the real leads behind whichever stat column is selected */}
      {title && (
        <div className="bg-white rounded-2xl shadow-md animate-fade-in">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="ui-title">{title}</h3>
            <button onClick={onClose} className="text-[11px] font-bold text-slate-400 hover:text-slate-700">
              Close ✕
            </button>
          </div>

          <div ref={drillScrollRef} className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed min-w-[1310px]">
              <colgroup>
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col className="w-[110px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-800">
                  <th className="px-4 py-3 whitespace-nowrap">
                    {drillSearchOpen ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={drillSearch}
                          onChange={(e) => setDrillSearch(e.target.value)}
                          onBlur={() => { setDrillSearch(""); setDrillSearchOpen(false); }}
                          placeholder="Search name or phone..."
                          className="min-w-0 flex-1 bg-white border border-brand-400 rounded-md px-1.5 py-1 text-[11px] font-normal focus:outline-none"
                        />
                        <button
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setDrillSearch(""); setDrillSearchOpen(false); }}
                          className="text-slate-400 hover:text-slate-700 shrink-0"
                          title="Close search"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        Lead Name
                        <button onClick={() => setDrillSearchOpen(true)} className="text-slate-400 hover:text-brand-700" title="Search">
                          <Search className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap">Email</th>
                  <th className="px-4 py-3 whitespace-nowrap">
                    <SearchableMultiSelect
                      variant="inline"
                      label="Status"
                      options={PICKABLE_STATUS_OPTIONS}
                      selected={drillStatusFilter}
                      onChange={setDrillFilter(setDrillStatusFilter)}
                      panelWidth={208}
                    />
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap">
                    <SearchableMultiSelect
                      variant="inline"
                      label="Assigned To"
                      options={drillAssignedOptions}
                      selected={drillAssignedFilter}
                      onChange={setDrillFilter(setDrillAssignedFilter)}
                      panelWidth={208}
                    />
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 whitespace-nowrap">Feedback</th>
                  <th className="px-4 py-3 whitespace-nowrap">Next Call Date</th>
                  <th className="px-4 py-3 whitespace-nowrap">
                    <SearchableMultiSelect
                      variant="inline"
                      label="Campaign"
                      options={drillCampaignOptions}
                      selected={drillCampaignFilter}
                      onChange={setDrillFilter(setDrillCampaignFilter)}
                      align="right"
                      panelWidth={224}
                    />
                  </th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {drillLoading && drillPageLeads.length === 0 ? (
                  <TableRowsSkeleton rows={6} columns={9} />
                ) : totalCount === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400 font-semibold italic">
                      No leads in this category for the selected date range.
                    </td>
                  </tr>
                ) : (
                  drillPageLeads.map((l) => (
                    <tr
                      key={l.id}
                      onClick={openOnRowClick(() => {
                        setQuickViewLead(l);
                        apiGetLead(l.id).then(row => setQuickViewLead(mapApiLeadToFrontendLead(row))).catch(() => {});
                      })}
                      className={LEAD_ROW_CLASS}
                    >
                      <td className="px-4 py-3 align-top overflow-hidden">
                        <button
                          onClick={() => {
                            // Full record (with Activity History) for the lead panel; the row is the fallback.
                            setQuickViewLead(l);
                            apiGetLead(l.id).then(row => setQuickViewLead(mapApiLeadToFrontendLead(row))).catch(() => {});
                          }}
                          className="font-bold text-[#0B1E6E] hover:underline text-left [overflow-wrap:anywhere] block max-w-full"
                          title={l.name}
                        >
                          {l.name}
                        </button>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5 [overflow-wrap:anywhere]">{activeRole === "ADMIN" ? l.phone : maskPhone(l.phone)}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 align-top [overflow-wrap:anywhere]" title={activeRole === "ADMIN" ? (l.email || "—") : "—"}>{l.email ? (activeRole === "ADMIN" ? l.email : maskEmail(l.email)) : "—"}</td>
                      <td className="px-4 py-3 align-top">
                        {renderRowStatusCell(l)}
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium align-top [overflow-wrap:anywhere]" title={l.assignedAgent || "Unassigned"}>{l.assignedAgent || "Unassigned"}</td>
                      <td className="px-4 py-3 text-slate-500 align-top"><DateTimeLines {...dateTimeParts(l.createdAtStr)} /></td>
                      <td className="px-4 py-3 text-slate-600 align-top"><div className="line-clamp-3 [overflow-wrap:anywhere]" title={latestLogMessage(l)}>{latestLogMessage(l)}</div></td>
                      <td className="px-4 py-3 text-slate-500 align-top"><NextCallCell next={nextCallDateFor(l.id)} /></td>
                      <td className="px-4 py-3 text-slate-700 font-medium align-top [overflow-wrap:anywhere]" title={l.campaign || l.source || "—"}>{l.campaign || l.source || "—"}</td>
                      <td className="px-4 py-3 align-top text-right">
                        <LeadRowActionsMenu onWhatsApp={() => handleWhatsApp(l)} onCall={() => handleCall(l)} callAllowed={callAllowed} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            {...paginationProps}
            onPageChange={(p) => { paginationProps.onPageChange(p); keepDrillTableInView(); }}
            onRowsPerPageChange={(n) => { paginationProps.onRowsPerPageChange(n); keepDrillTableInView(); }}
            rowLabel="Lead"
          />
        </div>
      )}

      {/* Lead quick-view — opened by clicking a lead's name in the table above */}
      {quickViewLead && (
        <LeadDetailDrawer
          lead={quickViewLead}
          isOpen={quickViewLead !== null}
          onClose={() => setQuickViewLead(null)}
          onUpdateStatus={handleDrillStatusChange}
        />
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
    </>
  );
}
