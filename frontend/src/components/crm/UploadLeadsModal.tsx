"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, UploadCloud, Download, ChevronDown } from "lucide-react";

// Flat-illustration graphic (cloud upload + two people packing a box) —
// purely decorative, hand-drawn to match the reference mockup's composition
// and palette rather than pulled from an icon set, since no matching asset
// existed in this codebase.
function UploadLeadsIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 200" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M72 58c0-13 10.5-23 23-23 9 0 16.5 5 20.5 12.5 3.5-2.5 8-4 12.5-4 13 0 23.5 10.5 23.5 23.5S141 90.5 128 90.5H94c-13 0-22-10-22-22.5z"
        fill="#7EB2F5"
      />
      <path d="M110 49v27M99.5 60l10.5-11 10.5 11" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      <path d="M53 125l32-16 32 16" stroke="#4472D6" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="53" y="125" width="64" height="44" rx="4" fill="#5B8CE8" />
      <rect x="53" y="125" width="64" height="11" fill="#4472D6" />

      <rect x="60" y="103" width="10" height="24" rx="2" fill="#3E9B5C" transform="rotate(-10 65 115)" />
      <rect x="99" y="106" width="9" height="20" rx="2" fill="#2E3A66" transform="rotate(12 103 116)" />

      <path d="M88 95l14-18 14 18-14 14z" fill="#EE5586" />
      <circle cx="102" cy="95" r="4" fill="#C23A63" />
      <path d="M102 109l-3 10 5-3 4 6" stroke="#EE5586" strokeWidth="2" strokeLinecap="round" fill="none" />

      <circle cx="41" cy="83" r="9.5" fill="#D99A73" />
      <path d="M31.5 95c0-6.5 4.5-11.5 9.5-11.5s9.5 5 9.5 11.5v20c0 4-3 7-7 7h-5c-4 0-7-3-7-7z" fill="#3E9B5C" />
      <path d="M48 92l16-8" stroke="#3E9B5C" strokeWidth="7" strokeLinecap="round" />
      <rect x="30" y="120" width="8" height="24" rx="3.5" fill="#F06AA0" />
      <rect x="43" y="120" width="8" height="24" rx="3.5" fill="#F06AA0" />
      <ellipse cx="34" cy="146" rx="5" ry="3" fill="#2E3A45" />
      <ellipse cx="47" cy="146" rx="5" ry="3" fill="#2E3A45" />

      <circle cx="152" cy="88" r="9.5" fill="#D99A73" />
      <path d="M142.5 100c0-6.5 4.5-11.5 9.5-11.5s9.5 5 9.5 11.5v18c0 4-3 7-7 7h-5c-4 0-7-3-7-7z" fill="#E8447A" />
      <path d="M144 106l-16 6" stroke="#E8447A" strokeWidth="7" strokeLinecap="round" />
      <rect x="141" y="122" width="8" height="24" rx="3.5" fill="#6A3FA0" />
      <rect x="154" y="122" width="8" height="24" rx="3.5" fill="#6A3FA0" />
      <ellipse cx="145" cy="148" rx="5" ry="3" fill="#2E3A45" />
      <ellipse cx="158" cy="148" rx="5" ry="3" fill="#2E3A45" />
    </svg>
  );
}

const SOURCE_HISTORY_KEY = "taskezy_data_calling_source_history";
const DEFAULT_SOURCE_HISTORY = ["Kashmiri Data", "Amazon Data", "Real2gro Data", "Top prior Data"];

// A text input that doubles as a "recent sources" picker — typing filters
// nothing (the history list below is short enough to just scan), but an
// unmatched query surfaces a "+Add" row so a brand-new source can be typed
// straight in without leaving the field. Chosen/typed sources are persisted
// to localStorage so the history keeps growing across sessions, same
// pattern as AddLeadModal's custom lead sources.
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
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        placeholder="Select source"
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
            <p className="px-3.5 py-2 text-xs text-slate-400 italic font-normal">No prior sources yet</p>
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

interface UploadLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (data: { property: string; source: string; fileName: string }) => void;
  propertiesList: string[];
}

export default function UploadLeadsModal({ isOpen, onClose, onUpload, propertiesList }: UploadLeadsModalProps) {
  const [property, setProperty] = useState("");
  const [source, setSource] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
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
    setProperty("");
    setSource("");
    setUploadedFile(null);
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
      setUploadedFile(e.dataTransfer.files[0].name);
    }
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadedFile(e.target.files[0].name);
    }
  };

  const triggerDownloadTemplate = () => {
    alert("Downloading Excel spreadsheet template sheet: taskezy_bulk_leads_v2.xlsx...");
  };

  const handleUpload = () => {
    if (!uploadedFile) {
      alert("Please upload a lead spreadsheet file first.");
      return;
    }
    onUpload({ property, source, fileName: uploadedFile });
    onClose();
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

          <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-[1fr_150px] gap-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Select Property</label>
                  <select
                    value={property}
                    onChange={(e) => setProperty(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-[#0B1E6E] transition-all"
                  >
                    <option value="">Select property</option>
                    {propertiesList.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-700">Source</label>
                  <SourceSearchSelect value={source} onChange={setSource} />
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
                    : uploadedFile
                      ? "border-emerald-400 bg-emerald-50/40"
                      : "border-slate-200 bg-blue-50/40 hover:border-[#0B1E6E]/40"
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                />
                <UploadCloud className={`h-7 w-7 mb-2 ${uploadedFile ? "text-emerald-600" : "text-[#0B1E6E]"}`} />
                {uploadedFile ? (
                  <>
                    <p className="text-xs font-bold text-slate-800">{uploadedFile}</p>
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

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={triggerDownloadTemplate}
                  className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[#0B1E6E] hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Template
                </button>
              </div>
            </div>

            {/* Decorative illustration — purely visual, hidden on narrow screens */}
            <div className="hidden sm:flex items-center justify-center">
              <UploadLeadsIllustration className="h-36 w-36" />
            </div>
          </div>

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
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpload}
                className="bg-[#0B1E6E] hover:bg-[#081650] text-white font-bold px-6 py-2.5 rounded-xl text-xs transition-all shadow-md shadow-[#0B1E6E]/10"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
