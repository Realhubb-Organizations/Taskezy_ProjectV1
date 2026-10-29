"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import LeadRowActionsMenu from "@/components/crm/LeadRowActionsMenu";
import { Search, Copy, Check, X } from "lucide-react";
import { TableRowsSkeleton } from "@/components/ui/Skeletons";
import { SearchableMultiSelect } from "@/components/ui/SearchableDropdown";
import TablePagination from "@/components/ui/TablePagination";
import { useApp } from "@/context/AppContext";
import { maskPhone } from "@/lib/maskPII";
import { canTriggerLeadCall, triggerLeadCall, triggerLeadWhatsApp, whatsAppNumber } from "@/lib/callTrigger";

export interface PendingRow {
  id: string;
  time: string;
  name: string;
  phone: string;
  assignedTo: string;
  feedback: string;
  property: string;
  leadId?: string; // present when this row can deep-link to a real lead in the CRM
}

export default function PendingLeadsTable({
  title,
  rows,
  onViewLead,
  isLoading = false
}: {
  title: string;
  rows: PendingRow[];
  onViewLead?: (leadId: string) => void;
  isLoading?: boolean;
}) {
  const { currentUser, activeRole, recordCallEnded, recordWhatsAppOpened } = useApp();
  const isAdmin = currentUser?.role === "ADMIN";
  // Masking decision must follow the Admin's "preview as role" selection,
  // not their real role — kept separate from isAdmin above, which still
  // gates real actions (Call/Copy) by the real logged-in role.
  const isAdminView = activeRole === "ADMIN";

  // A pending row without a real leadId isn't an actual CRM lead yet — there's
  // nothing to attach a call-feedback record to, so Manager/Member can't call
  // it from here at all (rather than silently placing an untracked call).
  // Admin is unaffected either way.
  const handleCall = (row: PendingRow) => {
    if (!row.leadId) {
      window.location.href = `tel:${row.phone}`;
      return;
    }
    triggerLeadCall({ id: row.leadId, phone: row.phone, name: row.name }, {
      isAdmin,
      userEmail: currentUser?.email,
      onCallEnded: (leadId, startedAt, durationSeconds) => {
        recordCallEnded(leadId, startedAt, durationSeconds).catch((err) => console.warn("Could not record call feedback gate:", err));
      }
    });
  };
  // Same "no leadId → nothing to track yet" fallback as handleCall above:
  // plain wa.me open, no feedback-gate watcher armed.
  const handleWhatsApp = (row: PendingRow) => {
    if (!row.leadId) {
      window.open(`https://wa.me/${whatsAppNumber(row.phone)}`, "_blank");
      return;
    }
    triggerLeadWhatsApp({ id: row.leadId, phone: row.phone, name: row.name, property: row.property }, {
      isAdmin,
      senderName: currentUser?.name,
      onReturn: (leadId) => {
        recordWhatsAppOpened(leadId).catch((err) => console.warn("Could not record WhatsApp feedback gate:", err));
      }
    });
  };
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [assignedFilter, setAssignedFilter] = useState<string[]>([]);
  const [propertyFilter, setPropertyFilter] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const assignedOptions = useMemo(() => Array.from(new Set(rows.map(r => r.assignedTo))).filter(Boolean), [rows]);
  const propertyOptions = useMemo(() => Array.from(new Set(rows.map(r => r.property))).filter(Boolean), [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      const matchesSearch = !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.phone.includes(search);
      const matchesAssigned = assignedFilter.length === 0 || assignedFilter.includes(r.assignedTo);
      const matchesProperty = propertyFilter.length === 0 || propertyFilter.includes(r.property);
      return matchesSearch && matchesAssigned && matchesProperty;
    });
  }, [rows, search, assignedFilter, propertyFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const currentPage = Math.min(page, totalPages);

  // Rows render continuously in one list instead of being sliced per page —
  // a scroll-spy tracks each page-boundary row's real DOM position to keep
  // the page number and pagination controls synced with wherever the user
  // has scrolled to, in both directions. Scrolls with the shared page
  // <main> now (one scroll plane per screen — see APP_UIUX_AUDIT.md), not
  // this table's own boxed container, so the listener attaches to <main>
  // directly rather than an onScroll prop here. scrollRef (still on this
  // div, now horizontal-scroll-only) is just how it locates <main> via
  // .closest(), same convention PullToRefresh.tsx uses.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const programmaticScroll = useRef(false);

  useEffect(() => {
    const main = scrollRef.current?.closest("main");
    if (!main) return;
    const handleScroll = () => {
      if (programmaticScroll.current) return;
      const mainTop = main.getBoundingClientRect().top;
      let current = 1;
      for (let i = 0; i < pageRowRefs.current.length; i++) {
        const row = pageRowRefs.current[i];
        if (row && row.getBoundingClientRect().top - mainTop <= 4) {
          current = i + 1;
        }
      }
      setPage(prev => (prev !== current ? current : prev));
    };
    main.addEventListener("scroll", handleScroll, { passive: true });
    return () => main.removeEventListener("scroll", handleScroll);
  }, []);

  const goToPage = (target: number) => {
    const clamped = Math.max(1, Math.min(totalPages, target));
    setPage(clamped);
    const row = pageRowRefs.current[clamped - 1];
    const main = scrollRef.current?.closest("main");
    if (!row || !main) return;
    programmaticScroll.current = true;
    const top = clamped === 1 ? 0 : main.scrollTop + row.getBoundingClientRect().top - main.getBoundingClientRect().top;
    main.scrollTo({ top });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { programmaticScroll.current = false; });
    });
  };

  // Any filter change starts back at page 1.
  const setFilter = (setList: (v: string[]) => void) => (next: string[]) => {
    setPage(1);
    setList(next);
  };

  const handleCopy = async (row: PendingRow) => {
    try {
      await navigator.clipboard.writeText(row.phone);
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard permission denied — silently skip the confirmation, not worth surfacing an error for.
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-md">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="ui-section-title">{title}</h3>
      </div>

      <div ref={scrollRef} className="overflow-x-auto">
        <table className="w-full text-left border-collapse table-fixed min-w-[860px]">
          <colgroup>
            <col />
            <col />
            <col />
            <col />
            <col />
            <col className="w-[110px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-bold text-slate-800">
              <th className="px-4 py-3 whitespace-nowrap">Time</th>
              <th className="px-4 py-3 whitespace-nowrap">
                {searchOpen ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                      onBlur={() => { setSearch(""); setSearchOpen(false); }}
                      placeholder="Search name or phone..."
                      className="min-w-0 flex-1 bg-white border border-brand-400 rounded-md px-1.5 py-1 text-[11px] font-normal focus:outline-none"
                    />
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setSearch(""); setSearchOpen(false); }}
                      className="text-slate-400 hover:text-slate-700 shrink-0"
                      title="Close search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    Lead Name
                    <button onClick={() => setSearchOpen(true)} className="text-slate-400 hover:text-brand-700" title="Search">
                      <Search className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </th>
              <th className="px-4 py-3 whitespace-nowrap">
                <SearchableMultiSelect
                  variant="inline"
                  label="Assigned To"
                  options={assignedOptions}
                  selected={assignedFilter}
                  onChange={setFilter(setAssignedFilter)}
                  panelWidth={224}
                />
              </th>
              <th className="px-4 py-3 whitespace-nowrap">Feedback</th>
              <th className="px-4 py-3 whitespace-nowrap">
                <SearchableMultiSelect
                  variant="inline"
                  label="Property"
                  options={propertyOptions}
                  selected={propertyFilter}
                  onChange={setFilter(setPropertyFilter)}
                  align="right"
                  panelWidth={224}
                />
              </th>
              <th className="px-4 py-3 text-right whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && filteredRows.length === 0 ? (
              <TableRowsSkeleton rows={5} columns={6} />
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400 font-semibold italic text-xs">
                  {rows.length === 0 ? "No records in this range." : "No records match the current search/filters."}
                </td>
              </tr>
            ) : (
              (pageRowRefs.current = [], filteredRows.map((row, idx) => (
                <tr
                  key={row.id}
                  ref={idx % rowsPerPage === 0 ? (el) => { pageRowRefs.current[Math.floor(idx / rowsPerPage)] = el; } : undefined}
                  onClick={row.leadId && onViewLead ? (e) => {
                    const target = e.target as HTMLElement;
                    if (!e.currentTarget.contains(target)) return;
                    if (target.closest("button, a, input, select, textarea, label, [role='button'], [role='combobox'], [role='listbox']")) return;
                    if (window.getSelection()?.toString()) return;
                    onViewLead!(row.leadId!);
                  } : undefined}
                  className={`hover:bg-slate-50/60 transition-colors text-xs ${row.leadId && onViewLead ? "cursor-pointer" : ""}`}
                >
                  <td className="px-4 py-3 font-mono text-slate-700 [overflow-wrap:anywhere] align-top">{row.time}</td>
                  <td className="px-4 py-3 align-top overflow-hidden">
                    {row.leadId && onViewLead ? (
                      <button
                        onClick={() => onViewLead(row.leadId!)}
                        className="font-bold text-[#0B1E6E] hover:underline text-xs text-left [overflow-wrap:anywhere] block max-w-full"
                        title={row.name}
                      >
                        {row.name}
                      </button>
                    ) : (
                      <p className="font-bold text-slate-900 text-xs [overflow-wrap:anywhere]">{row.name}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] text-slate-500 font-mono [overflow-wrap:anywhere]">{isAdminView ? row.phone : maskPhone(row.phone)}</span>
                      {isAdmin && (
                        <button onClick={() => handleCopy(row)} className="text-slate-350 hover:text-brand-700 shrink-0" title="Copy phone number">
                          {copiedId === row.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 font-medium align-top [overflow-wrap:anywhere]" title={row.assignedTo}>{row.assignedTo}</td>
                  <td className="px-4 py-3 text-slate-600 align-top"><div className="line-clamp-3 [overflow-wrap:anywhere]" title={row.feedback}>{row.feedback}</div></td>
                  <td className="px-4 py-3 text-slate-700 font-medium align-top [overflow-wrap:anywhere]" title={row.property}>{row.property}</td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center justify-end">
                      <LeadRowActionsMenu
                        onWhatsApp={() => handleWhatsApp(row)}
                        onCall={() => handleCall(row)}
                        callAllowed={canTriggerLeadCall(isAdmin, currentUser?.email) && (isAdmin || !!row.leadId)}
                      />
                    </div>
                  </td>
                </tr>
              )))
            )}
          </tbody>
        </table>
      </div>

      <TablePagination
        totalRows={filteredRows.length}
        page={currentPage}
        rowsPerPage={rowsPerPage}
        onPageChange={goToPage}
        onRowsPerPageChange={(n) => {
          programmaticScroll.current = true;
          setRowsPerPage(n);
          const main = scrollRef.current?.closest("main");
          const el = scrollRef.current;
          if (main && el) {
            main.scrollTo({ top: main.scrollTop + el.getBoundingClientRect().top - main.getBoundingClientRect().top });
          }
          requestAnimationFrame(() => {
            requestAnimationFrame(() => { programmaticScroll.current = false; });
          });
        }}
        rowLabel="Lead"
      />
    </div>
  );
}
