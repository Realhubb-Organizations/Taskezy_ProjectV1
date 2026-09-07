import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Upload, FileSpreadsheet, Info, Download, Plus, Trash2, ChevronDown } from "lucide-react";

const BASE_LEAD_SOURCES = ["Meta Ads", "Google Ads", "Referral Code", "Offline Event", "Direct Walkin"];
const CUSTOM_LEAD_SOURCES_KEY = "taskezy_custom_lead_sources";

// A themed dropdown matching the rest of the app's portaled menus (see
// LeadDashboard.tsx's openPositionedMenu) — the browser's native <select>
// popup can't be restyled, so this trigger button + a body-portaled options
// panel replaces it wherever the form needs to look like the rest of the site.
function CustomSelect({
  value,
  onChange,
  options
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggleOpen = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    setOpen(o => !o);
  };

  const selectedLabel = options.find(o => o.value === value)?.label ?? value;

  return (
    <div className="relative">
      <button
        type="button"
        ref={btnRef}
        onClick={toggleOpen}
        className="w-full flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-[#0B1E6E] transition-all"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[90] bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 max-h-56 overflow-y-auto"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            {options.length === 0 ? (
              <p className="px-3.5 py-2 text-xs text-slate-400 italic font-normal">No options yet</p>
            ) : (
              options.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`w-full text-left px-3.5 py-2 text-xs font-bold transition-colors ${
                    opt.value === value ? "bg-[#0B1E6E] text-white" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

interface AddLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitManual: (data: {
    name: string;
    phone: string;
    email: string;
    agent: string;
    source: string;
    property: string;
    note: string;
  }) => void;
  onSubmitBulk: (data: {
    assignmentMode: "project" | "agent";
    target: string;
    fileName: string;
  }) => void;
  agentsList: string[];
  propertiesList: string[];
}

export default function AddLeadModal({
  isOpen,
  onClose,
  onSubmitManual,
  onSubmitBulk,
  agentsList,
  propertiesList
}: AddLeadModalProps) {
  const [activeTab, setActiveTab] = useState<"manual" | "bulk">("manual");

  // Tab 1 Form State
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [agent, setAgent] = useState(agentsList[0] || "");
  const [source, setSource] = useState("Meta Ads");
  const [customSources, setCustomSources] = useState<string[]>([]);
  const [showAddSourceInput, setShowAddSourceInput] = useState(false);
  const [newSourceInput, setNewSourceInput] = useState("");
  const [property, setProperty] = useState(propertiesList[0] || "");
  const [note, setNote] = useState("");

  // Tab 2 Bulk Form State
  const [bulkMode, setBulkMode] = useState<"project" | "agent">("project");
  const [bulkTarget, setBulkTarget] = useState(propertiesList[0] || agentsList[0] || "");
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lock background scroll while the modal is open — without this the page
  // behind stayed scrollable, which combined with the modal's own overflow
  // made the whole thing feel broken rather than like a real dialog.
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Read from localStorage only after mount — avoids an SSR/client mismatch
  // on first render. Custom lead sources an admin adds via the "+" button
  // below aren't backed by any server-side lead-sources table, so they're
  // kept here, real and functional, rather than pretending to sync anywhere.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CUSTOM_LEAD_SOURCES_KEY);
      if (stored) setCustomSources(JSON.parse(stored));
    } catch {
      // Corrupt/inaccessible storage — fall back to the base source list only.
    }
  }, []);

  const sourceOptions = [...BASE_LEAD_SOURCES, ...customSources.filter(s => !BASE_LEAD_SOURCES.includes(s))];

  const persistCustomSources = (next: string[]) => {
    setCustomSources(next);
    try {
      window.localStorage.setItem(CUSTOM_LEAD_SOURCES_KEY, JSON.stringify(next));
    } catch {
      // Storage full/unavailable — the change still works for this session.
    }
  };

  const commitAddSource = () => {
    const trimmed = newSourceInput.trim();
    setNewSourceInput("");
    setShowAddSourceInput(false);
    if (!trimmed) return;
    const existing = sourceOptions.find(s => s.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      setSource(existing);
      return;
    }
    persistCustomSources([...customSources, trimmed]);
    setSource(trimmed);
  };

  // Only sources an admin added are removable — the base channel list stays fixed.
  const handleDeleteSource = () => {
    if (!customSources.includes(source)) return;
    persistCustomSources(customSources.filter(s => s !== source));
    setSource(BASE_LEAD_SOURCES[0]);
  };

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) {
      alert("Name and Phone are required.");
      return;
    }
    onSubmitManual({ name, phone, email, agent, source, property, note });
    // Reset manual form fields
    setName("");
    setPhone("");
    setEmail("");
    setNote("");
  };

  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadedFile) {
      alert("Please upload a lead spreadsheet file first.");
      return;
    }
    onSubmitBulk({ assignmentMode: bulkMode, target: bulkTarget, fileName: uploadedFile });
    // Reset bulk form fields
    setUploadedFile(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

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

  // Rendered via a portal straight into <body>: this component's caller
  // (the Dashboard page) wraps its whole page in a div with the
  // `animate-fade-in` utility, whose keyframes end on `transform: translateY(0)`
  // with `animation-fill-mode: both` — that lingering non-"none" transform
  // makes the page wrapper the containing block for any `position: fixed`
  // descendant, so this modal's "fixed to the viewport" positioning was
  // actually scoped to that page div's box (below the header, clipped to its
  // content height) instead of the real screen. A portal sidesteps the whole
  // class of bug by escaping that ancestor entirely.
  return createPortal(
    <>
      {/* Backdrop — plain dim, no blur, so the dialog reads as clearly on top
          rather than the page behind looking like it half-rendered. */}
      <div className="fixed inset-0 bg-slate-900/60 z-50 transition-opacity" onClick={onClose} />

      {/* Modal Box — bottom sheet on mobile, centered dialog from sm: up.
          The wrapper itself scrolls (overflow-y-auto) as a safety net on very
          short viewports; the card's own max-h + internal flex-1 scroll (see
          below) is what normally keeps the header/tabs/footer pinned while
          only the form fields scroll. */}
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center overflow-y-auto p-0 sm:p-4">
        <div className="w-full sm:max-w-3xl h-[95vh] sm:h-auto sm:max-h-[90vh] my-0 sm:my-8 bg-white border-0 sm:border border-slate-200 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
            <h3 className="text-sm font-extrabold text-slate-805">
              {activeTab === "manual" ? "Upload Single Lead" : "Upload Bulk Leads"}
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Tab Headers */}
          <div className="flex border-b border-slate-150 text-xs font-bold text-slate-500 bg-white shrink-0">
            <button
              onClick={() => setActiveTab("manual")}
              className={`flex-1 py-3 text-center border-b-2 transition-all ${
                activeTab === "manual" ? "border-[#0B1E6E] text-[#0B1E6E] font-black" : "border-transparent hover:bg-slate-50/50"
              }`}
            >
              Manual Single Entry
            </button>
            <button
              onClick={() => setActiveTab("bulk")}
              className={`flex-1 py-3 text-center border-b-2 transition-all ${
                activeTab === "bulk" ? "border-[#0B1E6E] text-[#0B1E6E] font-black" : "border-transparent hover:bg-slate-50/50"
              }`}
            >
              Bulk Spreadsheet Upload
            </button>
          </div>

          {activeTab === "manual" ? (
            /* MANUAL TAB */
            <form onSubmit={handleManualSubmit} className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Horizontal 3-across grid on wide/PC screens, single column
                    (naturally vertical) on narrower/mobile viewports. */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">Buyer Full Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Priyanth Kumar"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-[#0B1E6E] transition-all shadow-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">Contact Phone Number</label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +91 9845012345"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-[#0B1E6E] transition-all shadow-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">Email Address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. buyer@example.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-[#0B1E6E] transition-all shadow-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">Assigned Agent</label>
                    <CustomSelect
                      value={agent}
                      onChange={setAgent}
                      options={agentsList.map(ag => ({ value: ag, label: ag }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">Lead Source</label>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 min-w-0">
                        <CustomSelect
                          value={source}
                          onChange={setSource}
                          options={sourceOptions.map(opt => ({ value: opt, label: opt }))}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleDeleteSource}
                        disabled={!customSources.includes(source)}
                        title={customSources.includes(source) ? "Delete this source" : "Built-in sources can't be deleted"}
                        className="shrink-0 h-[34px] w-[34px] flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl text-red-500 hover:bg-red-50 hover:border-red-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-slate-50 disabled:hover:border-slate-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Add-source affordance sits under the dropdown row itself
                        rather than beside it — a small trigger that swaps for
                        an inline input, saved on Enter, no popup dialog. */}
                    {showAddSourceInput ? (
                      <input
                        autoFocus
                        type="text"
                        value={newSourceInput}
                        onChange={(e) => setNewSourceInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); commitAddSource(); }
                          if (e.key === "Escape") { setNewSourceInput(""); setShowAddSourceInput(false); }
                        }}
                        onBlur={() => { if (!newSourceInput.trim()) setShowAddSourceInput(false); }}
                        placeholder="New source name — press Enter to save"
                        className="mt-1.5 w-full bg-white border border-[#0B1E6E] rounded-xl px-3 py-1.5 text-[11px] font-bold text-slate-700 focus:outline-none animate-fade-in"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowAddSourceInput(true)}
                        className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-[#0B1E6E] hover:underline"
                      >
                        <Plus className="h-3 w-3" />
                        Add source
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">Property</label>
                    <CustomSelect
                      value={property}
                      onChange={setProperty}
                      options={[{ value: "", label: "Unassigned Project" }, ...propertiesList.map(p => ({ value: p, label: p }))]}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-3">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">Internal Telemetry Notes</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Include potential requirements (budget, BHK configuration, preferred site visit date)..."
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#0B1E6E] transition-all shadow-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="shrink-0 flex gap-3 px-6 py-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-none sm:px-8 bg-slate-100 border border-slate-200 text-slate-750 font-bold px-4 py-2.5 rounded-xl text-xs hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 sm:flex-none sm:px-8 sm:ml-auto bg-[#0B1E6E] hover:bg-[#081650] text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all shadow-md shadow-[#0B1E6E]/10"
                >
                  Save Lead Profile
                </button>
              </div>
            </form>
          ) : (
            /* BULK UPLOAD TAB */
            <form onSubmit={handleBulkSubmit} className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Assignment Logic Toggle UI */}
                <div className="space-y-2 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <label className="block text-[9px] font-extrabold text-slate-450 uppercase tracking-wider">Assignment Router Logic</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setBulkMode("project");
                        setBulkTarget(propertiesList[0] || "");
                      }}
                      className={`py-2 text-[10px] font-extrabold border rounded-xl transition-all ${
                        bulkMode === "project"
                          ? "bg-[#0B1E6E] border-[#0B1E6E] text-white shadow-sm"
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      Select Project (Round-Robin)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBulkMode("agent");
                        setBulkTarget(agentsList[0] || "");
                      }}
                      className={`py-2 text-[10px] font-extrabold border rounded-xl transition-all ${
                        bulkMode === "agent"
                          ? "bg-[#0B1E6E] border-[#0B1E6E] text-white shadow-sm"
                          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      Select Individual Agent
                    </button>
                  </div>

                  <div className="space-y-1 mt-3">
                    <label className="block text-[8px] font-bold text-slate-400 uppercase">
                      {bulkMode === "project" ? "Target Property Project" : "Target Sales Rep"}
                    </label>
                    <CustomSelect
                      value={bulkTarget}
                      onChange={setBulkTarget}
                      options={
                        bulkMode === "project"
                          ? propertiesList.map(p => ({ value: p, label: `${p} Project Team` }))
                          : agentsList.map(a => ({ value: a, label: `${a} (Dedicated Agent)` }))
                      }
                    />
                    <p className="text-[8px] text-slate-400 italic font-medium leading-relaxed mt-1">
                      {bulkMode === "project"
                        ? "Round-robin distribution distributes imported leads evenly across active agents assigned to this property."
                        : "All imported leads in the spreadsheet will be assigned strictly to the selected agent."}
                    </p>
                  </div>
                </div>

                {/* Excel Drag & Drop Dropzone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-2 ${
                    dragOver
                      ? "border-[#0B1E6E] bg-[#0B1E6E]/5"
                      : uploadedFile
                        ? "border-emerald-500 bg-emerald-50/25"
                        : "border-slate-300 hover:border-slate-400 bg-white"
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                  />
                  {uploadedFile ? (
                    <>
                      <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                        <FileSpreadsheet className="h-5 w-5 animate-pulse" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-805">File Loaded Successfully</p>
                        <p className="text-[9px] font-mono text-emerald-600 font-bold mt-0.5">{uploadedFile}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="h-10 w-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
                        <Upload className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700">Drag &amp; drop Excel/CSV sheet here</p>
                        <p className="text-[9px] text-slate-400 font-semibold mt-0.5">or click to browse local files (max 10MB)</p>
                      </div>
                    </>
                  )}
                </div>

                {/* Template Download & Instructions */}
                <div className="flex flex-wrap justify-between items-center gap-2 text-xs py-2 bg-slate-50 border border-slate-200 rounded-xl px-4">
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-bold">
                    <Info className="h-3.5 w-3.5 text-[#0B1E6E] shrink-0" />
                    <span>Sheet must contain: Name, Phone, Email</span>
                  </div>
                  <button
                    type="button"
                    onClick={triggerDownloadTemplate}
                    className="inline-flex items-center gap-1 text-[9px] font-extrabold text-[#0B1E6E] hover:underline shrink-0"
                  >
                    <Download className="h-3 w-3" />
                    Download Template
                  </button>
                </div>

                {/* Guidelines Box */}
                <div className="bg-amber-50/50 border border-amber-200/80 rounded-xl p-3 text-[9px] text-amber-850 leading-relaxed font-semibold">
                  <p className="font-extrabold flex items-center gap-1 mb-0.5">
                    <Info className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    Import Guidelines:
                  </p>
                  - Numbers must include country code (e.g. +91).<br />
                  - Duplicates matching existing phone numbers in database will be skipped.<br />
                  - Column headers must match the downloaded Excel template exactly.
                </div>
              </div>

              <div className="shrink-0 flex gap-3 px-6 py-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-none sm:px-8 bg-slate-100 border border-slate-200 text-slate-750 font-bold px-4 py-2.5 rounded-xl text-xs hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 sm:flex-none sm:px-8 sm:ml-auto bg-[#0B1E6E] hover:bg-[#081650] text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all shadow-md shadow-[#0B1E6E]/10"
                >
                  Import Leads Database
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
