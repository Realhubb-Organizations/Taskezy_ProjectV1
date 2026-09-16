"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, UploadCloud, Download, ChevronDown, CheckCircle2, AlertTriangle } from "lucide-react";

// exceljs is a ~260KB dependency used only by this modal (template
// generation + file parsing) — dynamically imported so it's fetched when an
// admin actually opens Upload Bulk Leads, not bundled into every visit to
// the Data Calling page.
async function loadExcelJS() {
  const mod = await import("exceljs");
  return mod.default;
}

function UploadLeadsIllustration({ className }: { className?: string }) {
  return <img src="/upload-leads-illustration.png" alt="" className={className} />;
}

const SOURCE_HISTORY_KEY = "taskezy_data_calling_source_history";
const DEFAULT_SOURCE_HISTORY = ["Kashmiri Data", "Amazon Data", "Real2gro Data", "Top prior Data"];

// A text input that doubles as a "recent sub-sources" picker — typing filters
// nothing (the history list below is short enough to just scan), but an
// unmatched query surfaces a "+Add" row so a brand-new sub-source can be typed
// straight in without leaving the field. Chosen/typed sub-sources are
// persisted to localStorage so the history keeps growing across sessions,
// same pattern as AddLeadModal's custom lead sources.
function SourceSearchSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [history, setHistory] = useState<string[]>(DEFAULT_SOURCE_HISTORY);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SOURCE_HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch {
      // Corrupt/inaccessible storage — fall back to the seeded history only.
    }
  }, []);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const persistHistory = (next: string[]) => {
    setHistory(next);
    try {
      window.localStorage.setItem(SOURCE_HISTORY_KEY, JSON.stringify(next));
    } catch {
      // Storage full/unavailable — the change still works for this session.
    }
  };

  const trimmedQuery = query.trim();
  const queryExists = trimmedQuery.length > 0 && history.some(h => h.toLowerCase() === trimmedQuery.toLowerCase());

  const commitValue = (v: string) => {
    onChange(v);
    setQuery(v);
    setOpen(false);
  };

  const handleAddNew = () => {
    if (!trimmedQuery) return;
    if (!queryExists) persistHistory([trimmedQuery, ...history]);
    commitValue(trimmedQuery);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="text"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        placeholder="e.g. Kashmiri Data"
        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3.5 pr-8 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-[#0B1E6E] transition-all"
      />
      <ChevronDown className={`h-3.5 w-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none transition-transform ${open ? "rotate-180" : ""}`} />

      {open && (
        <div className="absolute z-20 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 max-h-56 overflow-y-auto">
          {trimmedQuery && !queryExists && (
            <button
              type="button"
              onClick={handleAddNew}
              className="w-full text-left px-3.5 py-2 text-xs font-extrabold text-[#0B1E6E] hover:bg-slate-50 border-b border-slate-100"
            >
              +Add &ldquo;{trimmedQuery}&rdquo;
            </button>
          )}
          {history.length === 0 ? (
            <p className="px-3.5 py-2 text-xs text-slate-400 italic font-normal">No prior sub-sources yet</p>
          ) : (
            history.map(h => (
              <label
                key={h}
                className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={value === h}
                  onChange={() => commitValue(h)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-[#0B1E6E] focus:ring-0"
                />
                {h}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Checkbox multi-select for Agent mode's assignees — rows get round-robined
// evenly across whichever agents are checked (see leads.service.ts's
// bulkImportLeads), so more than one agent is a normal, expected choice
// here, not an edge case.
function AgentMultiSelect({
  agents,
  selectedIds,
  onChange
}: {
  agents: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  };

  const label =
    selectedIds.length === 0
      ? "Select agent(s)"
      : selectedIds.length === 1
        ? agents.find(a => a.id === selectedIds[0])?.name || "1 agent selected"
        : `${selectedIds.length} agents selected`;

  const q = query.trim().toLowerCase();
  const filtered = agents.filter(a => !q || a.name.toLowerCase().includes(q));

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-[#0B1E6E] transition-all"
      >
        <span className={`truncate ${selectedIds.length === 0 ? "text-slate-400 font-semibold" : ""}`}>{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 max-h-56 overflow-y-auto">
          <div className="px-2 pb-1.5 sticky top-0 bg-white">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="px-3.5 py-2 text-xs text-slate-400 italic font-normal">No agents found</p>
          ) : (
            filtered.map(a => (
              <label key={a.id} className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(a.id)}
                  onChange={() => toggle(a.id)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-[#0B1E6E] focus:ring-0"
                />
                {a.name}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export interface ParsedLeadRow {
  name: string;
  phone: string;
}

export interface BulkImportSkippedRow {
  row: number;
  reason: string;
}

export interface BulkImportSubmitResult {
  created: number;
  duplicates: number;
  skipped: BulkImportSkippedRow[];
}

export interface BulkImportSubmitInput {
  subSource: string;
  assignmentMode: "PROPERTY" | "AGENT";
  propertyId?: string;
  agentIds?: string[];
  leads: ParsedLeadRow[];
}

interface UploadLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: BulkImportSubmitInput) => Promise<BulkImportSubmitResult>;
  propertiesList: { id: string; name: string }[];
  agentsList: { id: string; name: string }[];
}

const TEMPLATE_HEADERS = ["Name", "Mobile Number"];

async function downloadTemplate() {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Leads");
  sheet.columns = [
    { header: TEMPLATE_HEADERS[0], key: "name", width: 28 },
    { header: TEMPLATE_HEADERS[1], key: "phone", width: 20 }
  ];
  sheet.addRow({ name: "Ravi Kumar", phone: "9876543210" });
  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "taskezy_bulk_leads_template.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Reads the uploaded workbook's first sheet. Column position matches our own
 * template (Name, Mobile Number) by default, but the header row is checked
 * for "name"/"mobile"/"phone" (case-insensitive) first so a re-ordered sheet
 * still parses correctly instead of silently reading the wrong columns. */
async function parseLeadsFile(file: File): Promise<ParsedLeadRow[]> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  let nameCol = 1;
  let phoneCol = 2;
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    const header = String(cell.value ?? "").trim().toLowerCase();
    if (header.includes("name")) nameCol = colNumber;
    if (header.includes("mobile") || header.includes("phone")) phoneCol = colNumber;
  });

  const rows: ParsedLeadRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const name = String(row.getCell(nameCol).value ?? "").trim();
    const phone = String(row.getCell(phoneCol).value ?? "").trim();
    if (name || phone) rows.push({ name, phone });
  });
  return rows;
}

export default function UploadLeadsModal({ isOpen, onClose, onSubmit, propertiesList, agentsList }: UploadLeadsModalProps) {
  const [assignmentMode, setAssignmentMode] = useState<"PROPERTY" | "AGENT">("PROPERTY");
  const [propertyId, setPropertyId] = useState("");
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [subSource, setSubSource] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportSubmitResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) return;
    setAssignmentMode("PROPERTY");
    setPropertyId("");
    setAgentIds([]);
    setSubSource("");
    setFile(null);
    setIsSubmitting(false);
    setErrorMsg(null);
    setResult(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    setErrorMsg(null);
    if (!file) {
      setErrorMsg("Please upload a lead spreadsheet file first.");
      return;
    }
    if (!subSource.trim()) {
      setErrorMsg("Please enter a sub-source for this batch — it's how these leads can be filtered, reassigned, and reshuffled together later.");
      return;
    }
    if (assignmentMode === "PROPERTY" && !propertyId) {
      setErrorMsg("Please select a property to assign these leads by.");
      return;
    }
    if (assignmentMode === "AGENT" && agentIds.length === 0) {
      setErrorMsg("Please select at least one agent to assign these leads to.");
      return;
    }

    setIsSubmitting(true);
    try {
      const leads = await parseLeadsFile(file);
      if (leads.length === 0) {
        setErrorMsg("No rows found in that file. Make sure it follows the downloaded template (Name, Mobile Number).");
        setIsSubmitting(false);
        return;
      }
      const submitResult = await onSubmit({
        subSource: subSource.trim(),
        assignmentMode,
        propertyId: assignmentMode === "PROPERTY" ? propertyId : undefined,
        agentIds: assignmentMode === "AGENT" ? agentIds : undefined,
        leads
      });
      setResult(submitResult);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not read that file — make sure it's a valid .xlsx spreadsheet.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 bg-slate-900/60 z-50 transition-opacity" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center overflow-y-auto p-0 sm:p-4">
        <div className="w-full sm:max-w-2xl bg-white border-0 sm:border border-slate-200 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
          <div className="flex justify-between items-start px-6 pt-6 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Upload Bulk Leads</h3>
              <p className="text-xs text-slate-500 mt-1">Upload multiple leads using an Excel file upload template.</p>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
          <div className="border-t border-slate-100" />

          {result ? (
            <div className="px-6 py-6 space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-extrabold text-slate-900">{result.created} lead{result.created === 1 ? "" : "s"} imported</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {result.duplicates > 0 && `${result.duplicates} duplicate phone number${result.duplicates === 1 ? "" : "s"} skipped. `}
                    {result.skipped.length > 0 && `${result.skipped.length} row${result.skipped.length === 1 ? "" : "s"} skipped — see below.`}
                    {result.duplicates === 0 && result.skipped.length === 0 && "Every row imported cleanly."}
                  </p>
                </div>
              </div>
              {result.skipped.length > 0 && (
                <div className="border border-amber-200 bg-amber-50/60 rounded-xl max-h-40 overflow-y-auto">
                  {result.skipped.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 px-3.5 py-2 text-xs text-amber-800 border-b border-amber-100 last:border-b-0">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span><span className="font-bold">Row {s.row}:</span> {s.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-[1fr_150px] gap-6">
              <div className="space-y-4">
                {/* Assignment mode — Property-wise runs each row through that
                    property's configured Round Robin/Percentage team; Agent
                    puts the whole batch directly on one chosen person. */}
                <div className="flex bg-slate-100 rounded-xl p-1 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setAssignmentMode("PROPERTY")}
                    className={`flex-1 py-2 rounded-lg transition-all ${assignmentMode === "PROPERTY" ? "bg-white text-[#0B1E6E] shadow-sm" : "text-slate-500"}`}
                  >
                    Assign by Property
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignmentMode("AGENT")}
                    className={`flex-1 py-2 rounded-lg transition-all ${assignmentMode === "AGENT" ? "bg-white text-[#0B1E6E] shadow-sm" : "text-slate-500"}`}
                  >
                    Assign to Agent
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">
                      {assignmentMode === "PROPERTY" ? "Select Property" : "Select Agent(s)"}
                    </label>
                    {assignmentMode === "PROPERTY" ? (
                      <select
                        value={propertyId}
                        onChange={(e) => setPropertyId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-[#0B1E6E] transition-all"
                      >
                        <option value="">Select property</option>
                        {propertiesList.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    ) : (
                      <AgentMultiSelect agents={agentsList} selectedIds={agentIds} onChange={setAgentIds} />
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">Sub-source</label>
                    <SourceSearchSelect value={subSource} onChange={setSubSource} />
                  </div>
                </div>

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl py-8 px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                    dragOver
                      ? "border-[#0B1E6E] bg-[#0B1E6E]/5"
                      : file
                        ? "border-emerald-400 bg-emerald-50/40"
                        : "border-slate-200 bg-blue-50/40 hover:border-[#0B1E6E]/40"
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".xlsx,.xls"
                    className="hidden"
                  />
                  <UploadCloud className={`h-7 w-7 mb-2 ${file ? "text-emerald-600" : "text-[#0B1E6E]"}`} />
                  {file ? (
                    <>
                      <p className="text-xs font-bold text-slate-800">{file.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Click to replace file</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-extrabold text-[#0B1E6E]">Upload a file</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                        Click to browse, or<br />drag &amp; drop files here
                      </p>
                    </>
                  )}
                </div>

                {errorMsg && <p className="text-[11px] text-red-600 font-semibold">{errorMsg}</p>}

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => { downloadTemplate().catch(() => setErrorMsg("Could not generate the template file — please try again.")); }}
                    className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[#0B1E6E] hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download Template
                  </button>
                </div>
              </div>

              {/* Decorative illustration — purely visual, hidden on narrow screens */}
              <div className="hidden sm:flex items-center justify-center">
                <UploadLeadsIllustration className="h-40 w-40 object-contain" />
              </div>
            </div>
          )}

          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-100">
            <p className="text-[11px] text-slate-400">
              Still facing issues?{" "}
              <button type="button" className="text-[#0B1E6E] font-bold hover:underline" onClick={() => alert("Support request sent — our team will reach out shortly.")}>
                Contact support
              </button>
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="bg-slate-100 border border-slate-200 text-slate-750 font-bold px-5 py-2.5 rounded-xl text-xs hover:bg-slate-200 transition-colors"
              >
                {result ? "Close" : "Cancel"}
              </button>
              {!result && (
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={isSubmitting}
                  className="bg-[#0B1E6E] hover:bg-[#081650] disabled:opacity-60 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-all shadow-md shadow-[#0B1E6E]/10"
                >
                  {isSubmitting ? "Uploading…" : "Upload"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
