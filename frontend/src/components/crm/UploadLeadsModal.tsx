"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, UploadCloud, Download, ChevronDown, Users, PackageOpen } from "lucide-react";

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

              <button
                type="button"
                onClick={triggerDownloadTemplate}
                className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[#0B1E6E] hover:underline"
              >
                <Download className="h-3.5 w-3.5" />
                Download Template
              </button>
            </div>

            {/* Decorative illustration — purely visual, hidden on narrow screens */}
            <div className="hidden sm:flex items-center justify-center">
              <div className="relative h-28 w-28 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-blue-50" />
                <UploadCloud className="h-12 w-12 text-blue-300 absolute -top-1" />
                <PackageOpen className="h-9 w-9 text-indigo-400 absolute bottom-2 left-2" />
                <Users className="h-7 w-7 text-pink-400 absolute bottom-3 right-2" />
              </div>
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
