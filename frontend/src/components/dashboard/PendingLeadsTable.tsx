"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ChevronDown, ChevronLeft, ChevronRight, Copy, Check, Phone, Eye } from "lucide-react";

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

export default function PendingLeadsTable({ title, rows }: { title: string; rows: PendingRow[] }) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [assignedFilter, setAssignedFilter] = useState<string[]>([]);
  const [propertyFilter, setPropertyFilter] = useState<string[]>([]);
  const [assignedMenuOpen, setAssignedMenuOpen] = useState(false);
  const [propertyMenuOpen, setPropertyMenuOpen] = useState(false);
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
  const pageRows = filteredRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const rangeStart = filteredRows.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const rangeEnd = Math.min(currentPage * rowsPerPage, filteredRows.length);

  const toggleFilterValue = (list: string[], value: string, setList: (v: string[]) => void) => {
    setPage(1);
    setList(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
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
      <div className="px-6 py-5 border-b border-slate-100">
        <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900">{title}</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[760px]">
          <thead>
            <tr className="border-b border-slate-200 text-sm font-bold text-slate-800">
              <th className="px-6 py-4 whitespace-nowrap">Time</th>
              <th className="px-6 py-4">
                <div className="relative flex items-center gap-2">
                  Lead Name
                  <button onClick={() => setSearchOpen(o => !o)} className="text-slate-400 hover:text-brand-700" title="Search">
                    <Search className="h-4 w-4" />
                  </button>
                  {searchOpen && (
                    <input
                      autoFocus
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                      onBlur={() => { if (!search) setSearchOpen(false); }}
                      placeholder="Search name or phone..."
                      className="absolute left-0 top-9 z-20 w-52 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-normal shadow-lg focus:outline-none focus:border-brand-500"
                    />
                  )}
                </div>
              </th>
              <th className="px-6 py-4">
                <div className="relative">
                  <button onClick={() => setAssignedMenuOpen(o => !o)} className="flex items-center gap-1.5 hover:text-brand-700">
                    Assigned To
                    <ChevronDown className="h-3.5 w-3.5" />
                    {assignedFilter.length > 0 && (
                      <span className="text-[9px] bg-brand-50 text-brand-700 rounded-full px-1.5 py-0.5 font-bold">{assignedFilter.length}</span>
                    )}
                  </button>
                  {assignedMenuOpen && (
                    <div className="absolute left-0 top-9 z-20 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1.5 max-h-56 overflow-y-auto">
                      {assignedOptions.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-400 italic font-normal">No data yet</p>
                      ) : (
                        assignedOptions.map(opt => (
                          <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-xs font-normal text-slate-700 hover:bg-slate-50 cursor-pointer">
                            <input type="checkbox" checked={assignedFilter.includes(opt)} onChange={() => toggleFilterValue(assignedFilter, opt, setAssignedFilter)} />
                            {opt}
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </th>
              <th className="px-6 py-4">Feedback</th>
              <th className="px-6 py-4">
                <div className="relative">
                  <button onClick={() => setPropertyMenuOpen(o => !o)} className="flex items-center gap-1.5 hover:text-brand-700">
                    Property
                    <ChevronDown className="h-3.5 w-3.5" />
                    {propertyFilter.length > 0 && (
                      <span className="text-[9px] bg-brand-50 text-brand-700 rounded-full px-1.5 py-0.5 font-bold">{propertyFilter.length}</span>
                    )}
                  </button>
                  {propertyMenuOpen && (
                    <div className="absolute right-0 top-9 z-20 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1.5 max-h-56 overflow-y-auto">
                      {propertyOptions.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-400 italic font-normal">No data yet</p>
                      ) : (
                        propertyOptions.map(opt => (
                          <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-xs font-normal text-slate-700 hover:bg-slate-50 cursor-pointer">
                            <input type="checkbox" checked={propertyFilter.includes(opt)} onChange={() => toggleFilterValue(propertyFilter, opt, setPropertyFilter)} />
                            {opt}
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-semibold italic">
                  {rows.length === 0 ? "No records in this range." : "No records match the current search/filters."}
                </td>
              </tr>
            ) : (
              pageRows.map(row => (
                <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-6 py-5 font-mono text-slate-700 text-sm whitespace-nowrap align-top">{row.time}</td>
                  <td className="px-6 py-5 align-top">
                    <p className="font-bold text-slate-900 text-base">{row.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-slate-500 font-mono">{row.phone}</span>
                      <button onClick={() => handleCopy(row)} className="text-slate-350 hover:text-brand-700" title="Copy phone number">
                        {copiedId === row.id ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-slate-700 font-medium text-sm align-top">{row.assignedTo}</td>
                  <td className="px-6 py-5 text-slate-600 text-sm max-w-[220px] truncate align-top" title={row.feedback}>{row.feedback}</td>
                  <td className="px-6 py-5 text-slate-700 font-medium text-sm align-top">{row.property}</td>
                  <td className="px-6 py-5 align-top">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={`tel:${row.phone}`}
                        className="h-9 w-9 rounded-full bg-slate-900 hover:bg-brand-700 text-white flex items-center justify-center transition-colors shrink-0"
                        title="Call"
                      >
                        <Phone className="h-4 w-4" />
                      </a>
                      {row.leadId && (
                        <Link
                          href={`/dashboard/crm?openLead=${row.leadId}`}
                          className="h-9 w-9 rounded-full bg-slate-900 hover:bg-brand-700 text-white flex items-center justify-center transition-colors shrink-0"
                          title="View lead"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 flex flex-wrap justify-between items-center gap-3 border-t border-slate-100 text-xs text-slate-500 font-semibold">
        <span>{filteredRows.length} Row{filteredRows.length === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            Rows per page
            <select
              value={rowsPerPage}
              onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
              className="bg-slate-50 border border-slate-200 rounded px-1.5 py-1 font-bold text-slate-700 focus:outline-none"
            >
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </span>
          <span>{rangeStart}-{rangeEnd} of {filteredRows.length}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
