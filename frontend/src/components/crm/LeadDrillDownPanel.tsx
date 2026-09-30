"use client";

import React, { useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useApp, Lead, LeadStatus } from "@/context/AppContext";
import { deriveActivityTimeline, STATUS_OPTIONS, statusBadgeClasses } from "@/lib/leadStatusMapping";
import { WhatsAppIcon, CallIcon } from "@/components/icons/ContactIcons";
import { Phone, Mail, X, Copy, Check, User, Search, ArrowRight } from "lucide-react";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/SearchableDropdown";
import TablePagination, { usePagination } from "@/components/ui/TablePagination";

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
  return (leadId: string, status: LeadStatus) => {
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
}

// Lead quick-view — a right-side drawer. Scoped to these pages only (the
// shared LeadDetailDrawer used elsewhere is untouched); portaled to <body>
// since the pages' root wrappers carry animate-fade-in, which would
// otherwise become the containing block for a fixed-position overlay.
// Render it only while a lead is open.
export function LeadQuickViewDrawer({ lead, onLeadChange, onClose }: {
  lead: Lead;
  onLeadChange: (lead: Lead) => void;
  onClose: () => void;
}) {
  const handleStatusChange = useLeadStatusChange();
  const [copiedField, setCopiedField] = useState<string | null>(null);

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
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <a href={`tel:${lead.phone}`} className="hover:text-brand-700">{lead.phone}</a>
              <button onClick={() => copyToClipboard("phone", lead.phone)} className="text-slate-350 hover:text-brand-700" title="Copy phone">
                {copiedField === "phone" ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            {lead.email && (
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <a href={`mailto:${lead.email}`} className="hover:text-brand-700 truncate">{lead.email}</a>
                <button onClick={() => copyToClipboard("email", lead.email!)} className="text-slate-350 hover:text-brand-700 shrink-0" title="Copy email">
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
            <SearchableSelect
              variant="pill"
              align="right"
              options={STATUS_OPTIONS.includes(lead.status) ? STATUS_OPTIONS : [lead.status, ...STATUS_OPTIONS]}
              value={lead.status}
              onChange={(v) => {
                const st = v as LeadStatus;
                handleStatusChange(lead.id, st);
                onLeadChange({ ...lead, status: st });
              }}
              searchPlaceholder="Search status..."
              panelWidth={192}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
            <span>Last Updated : {lastActivityTime(lead)}</span>
            <span>Source : {lead.source || lead.campaign || "Direct / Manual Entry"}</span>
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
            <span className="text-slate-800 font-semibold">{lead.property || "Not set"}</span>
          </div>
          <div>
            <span className="text-slate-400 font-bold text-[10px] block mb-0.5">Reassigned To :</span>
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

export default function LeadDrillDownPanel({ title, leads, onClose }: {
  // Selected stat card's label; null hides the panel.
  title: string | null;
  // That card's full, unfiltered lead list.
  leads: Lead[];
  onClose: () => void;
}) {
  const { followupCalls, isDataLoading } = useApp();
  const handleDrillStatusChange = useLeadStatusChange();

  const [drillPage, setDrillPage] = useState(1);
  const [drillRowsPerPage, setDrillRowsPerPage] = useState(10);
  const [quickViewLead, setQuickViewLead] = useState<Lead | null>(null);
  const [drillSearch, setDrillSearch] = useState("");
  const [drillSearchOpen, setDrillSearchOpen] = useState(false);
  const [drillStatusFilter, setDrillStatusFilter] = useState<string[]>([]);
  const [drillAssignedFilter, setDrillAssignedFilter] = useState<string[]>([]);
  const [drillCampaignFilter, setDrillCampaignFilter] = useState<string[]>([]);

  // Switching (or re-opening) a card starts its drill-down fresh — page,
  // search and column filters reset, rows-per-page is kept.
  const [prevTitle, setPrevTitle] = useState(title);
  if (title !== prevTitle) {
    setPrevTitle(title);
    setDrillPage(1);
    setDrillSearch("");
    setDrillStatusFilter([]);
    setDrillAssignedFilter([]);
    setDrillCampaignFilter([]);
  }

  // Any filter change starts back at page 1.
  const setDrillFilter = (setList: (v: string[]) => void) => (next: string[]) => {
    setDrillPage(1);
    setList(next);
  };

  // Filter option lists are built from the full, unfiltered set so they
  // don't shrink as filters are applied.
  const drillStatusOptions = Array.from(new Set(leads.map(l => l.status)));
  const drillAssignedOptions = Array.from(new Set(leads.map(l => l.assignedAgent).filter(Boolean)));
  const drillCampaignOptions = Array.from(new Set(leads.map(l => l.campaign || l.source).filter(Boolean))) as string[];

  const drillLeads = leads.filter(l => {
    const matchesSearch = !drillSearch || l.name.toLowerCase().includes(drillSearch.toLowerCase()) || l.phone.includes(drillSearch);
    const matchesStatus = drillStatusFilter.length === 0 || drillStatusFilter.includes(l.status);
    const matchesAssigned = drillAssignedFilter.length === 0 || drillAssignedFilter.includes(l.assignedAgent);
    const campaignVal = l.campaign || l.source || "";
    const matchesCampaign = drillCampaignFilter.length === 0 || drillCampaignFilter.includes(campaignVal);
    return matchesSearch && matchesStatus && matchesAssigned && matchesCampaign;
  });
  const drillTotalPages = Math.max(1, Math.ceil(drillLeads.length / drillRowsPerPage));
  const drillCurrentPage = Math.min(drillPage, drillTotalPages);
  // Rows render continuously in one scrollable container instead of being
  // sliced per page — a scroll-spy below tracks each page-boundary row's
  // real DOM position to keep the page number and pagination controls in
  // sync with wherever the user has scrolled to.
  const drillScrollRef = useRef<HTMLDivElement>(null);
  const drillPageRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const drillProgrammaticScroll = useRef(false);

  const handleDrillTableScroll = () => {
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

  const goToDrillPage = (page: number) => {
    const clamped = Math.max(1, Math.min(drillTotalPages, page));
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

  // Real next-scheduled-call date, from the actual followup_calls queue —
  // "—" when no reminder was ever set for this lead, rather than a
  // fabricated createdAt+1day placeholder.
  const nextCallDateFor = (leadId: string): string => {
    const upcoming = followupCalls
      .filter(c => c.leadId === leadId && c.status === "Upcoming")
      .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());
    return upcoming.length > 0 ? `${upcoming[0].date} ${upcoming[0].time}` : "—";
  };

  // Drill-down table's per-row Status cell — the shared searchable dropdown,
  // in place of a plain native <select> (whose OS-default popup, e.g. dark
  // on macOS/Chrome, clashed with the rest of the app).
  const renderRowStatusCell = (l: Lead) => (
    <SearchableSelect
      variant="inline"
      options={STATUS_OPTIONS.includes(l.status) ? STATUS_OPTIONS : [l.status, ...STATUS_OPTIONS]}
      value={l.status}
      onChange={(v) => handleDrillStatusChange(l.id, v as LeadStatus)}
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
            <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
            <button onClick={onClose} className="text-[11px] font-bold text-slate-400 hover:text-slate-700">
              Close ✕
            </button>
          </div>

          <div ref={drillScrollRef} onScroll={handleDrillTableScroll} className="overflow-auto max-h-[70vh]">
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
                    {drillSearchOpen ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          value={drillSearch}
                          onChange={(e) => { setDrillSearch(e.target.value); setDrillPage(1); }}
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
                  <th className="px-4 py-2.5 whitespace-nowrap">Email</th>
                  <th className="px-4 py-2.5">
                    <SearchableMultiSelect
                      variant="inline"
                      label="Status"
                      options={drillStatusOptions}
                      selected={drillStatusFilter}
                      onChange={setDrillFilter(setDrillStatusFilter)}
                      panelWidth={208}
                    />
                  </th>
                  <th className="px-4 py-2.5">
                    <SearchableMultiSelect
                      variant="inline"
                      label="Assigned To"
                      options={drillAssignedOptions}
                      selected={drillAssignedFilter}
                      onChange={setDrillFilter(setDrillAssignedFilter)}
                      panelWidth={208}
                    />
                  </th>
                  <th className="px-4 py-2.5 whitespace-nowrap">Date</th>
                  <th className="px-4 py-2.5 whitespace-nowrap">Feedback</th>
                  <th className="px-4 py-2.5 whitespace-nowrap">Next Call Date</th>
                  <th className="px-4 py-2.5">
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
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {isDataLoading && drillLeads.length === 0 ? (
                  <TableRowsSkeleton rows={6} columns={9} />
                ) : drillLeads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400 font-semibold italic">
                      No leads in this category for the selected date range.
                    </td>
                  </tr>
                ) : (
                  (drillPageRowRefs.current = [], drillLeads.map((l, idx) => (
                    <tr
                      key={l.id}
                      ref={idx % drillRowsPerPage === 0 ? (el) => { drillPageRowRefs.current[Math.floor(idx / drillRowsPerPage)] = el; } : undefined}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
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
                        {renderRowStatusCell(l)}
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
                    </tr>
                  )))
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            totalRows={drillLeads.length}
            page={drillCurrentPage}
            rowsPerPage={drillRowsPerPage}
            onPageChange={goToDrillPage}
            onRowsPerPageChange={(n) => {
              drillProgrammaticScroll.current = true;
              setDrillRowsPerPage(n);
              drillScrollRef.current?.scrollTo(0, 0);
              requestAnimationFrame(() => {
                requestAnimationFrame(() => { drillProgrammaticScroll.current = false; });
              });
            }}
            rowLabel="Lead"
          />
        </div>
      )}

      {/* Lead quick-view — opened by clicking a lead's name in the table above */}
      {quickViewLead && (
        <LeadQuickViewDrawer lead={quickViewLead} onLeadChange={setQuickViewLead} onClose={() => setQuickViewLead(null)} />
      )}
    </>
  );
}
