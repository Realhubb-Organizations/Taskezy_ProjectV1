import React, { useState, useRef } from "react";
import { X, Upload, FileSpreadsheet, Info, Download, Check, Sparkles } from "lucide-react";

interface AddLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitManual: (data: {
    name: string;
    phone: string;
    email: string;
    agent: string;
    source: string;
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
  const [note, setNote] = useState("");

  // Tab 2 Bulk Form State
  const [bulkMode, setBulkMode] = useState<"project" | "agent">("project");
  const [bulkTarget, setBulkTarget] = useState(propertiesList[0] || agentsList[0] || "");
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) {
      alert("Name and Phone are required.");
      return;
    }
    onSubmitManual({ name, phone, email, agent, source, note });
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Modal Box */}
      <div className="relative bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 z-55 animate-fade-in">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h3 className="text-sm font-extrabold text-slate-805 flex items-center gap-1.5">
              <Sparkles className="h-4.5 w-4.5 text-brand-600" />
              Ingest CRM Leads Partition
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">Register new properties buyers manually or bulk import lists.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Tab Headers */}
        <div className="flex border-b border-slate-150 text-xs font-bold text-slate-500 bg-white">
          <button
            onClick={() => setActiveTab("manual")}
            className={`flex-1 py-3 text-center border-b-2 transition-all ${
              activeTab === "manual" ? "border-brand-500 text-brand-700 font-black" : "border-transparent hover:bg-slate-50/50"
            }`}
          >
            Manual Ingestion Entry
          </button>
          <button
            onClick={() => setActiveTab("bulk")}
            className={`flex-1 py-3 text-center border-b-2 transition-all ${
              activeTab === "bulk" ? "border-brand-500 text-brand-700 font-black" : "border-transparent hover:bg-slate-50/50"
            }`}
          >
            Bulk Spreadsheet Upload
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {activeTab === "manual" ? (
            /* MANUAL TAB */
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase">Buyer Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Priyanth Kumar"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-brand-500 transition-all shadow-sm"
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-brand-500 transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[9px] font-bold text-slate-400 uppercase">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. buyer@example.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-brand-500 transition-all shadow-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase">Assigned Agent</label>
                  <select
                    value={agent}
                    onChange={(e) => setAgent(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-brand-500 transition-all"
                  >
                    {agentsList.map(ag => (
                      <option key={ag} value={ag}>{ag}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase">Lead Acquisition Channel</label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-brand-500 transition-all"
                  >
                    <option value="Meta Ads">Meta Ads</option>
                    <option value="Google Ads">Google Ads</option>
                    <option value="Referral Code">Referral Code</option>
                    <option value="Offline Event">Offline Event</option>
                    <option value="Direct Walkin">Direct Walkin</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[9px] font-bold text-slate-400 uppercase">Internal Telemetry Notes</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Include potential requirements (budget, BHK configuration, preferred site visit date)..."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-brand-500 transition-all shadow-sm"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-slate-100 border border-slate-200 text-slate-750 font-bold px-4 py-2.5 rounded-xl text-xs hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-brand-700 hover:bg-brand-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all shadow-md shadow-brand-700/10"
                >
                  Save Lead Profile
                </button>
              </div>
            </form>
          ) : (
            /* BULK UPLOAD TAB */
            <form onSubmit={handleBulkSubmit} className="space-y-4">
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
                        ? "bg-brand-700 border-brand-700 text-white shadow-sm"
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
                        ? "bg-brand-700 border-brand-700 text-white shadow-sm"
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
                  <select
                    value={bulkTarget}
                    onChange={(e) => setBulkTarget(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none"
                  >
                    {bulkMode === "project"
                      ? propertiesList.map(p => (
                          <option key={p} value={p}>{p} Project Team</option>
                        ))
                      : agentsList.map(a => (
                          <option key={a} value={a}>{a} (Dedicated Agent)</option>
                        ))}
                  </select>
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
                    ? "border-brand-500 bg-brand-50/20"
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
              <div className="flex justify-between items-center text-xs py-2 bg-slate-50 border border-slate-200 rounded-xl px-4">
                <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-bold">
                  <Info className="h-3.5 w-3.5 text-brand-650" />
                  <span>Sheet must contain: Name, Phone, Email</span>
                </div>
                <button
                  type="button"
                  onClick={triggerDownloadTemplate}
                  className="inline-flex items-center gap-1 text-[9px] font-extrabold text-brand-700 hover:underline"
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

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-slate-100 border border-slate-200 text-slate-750 font-bold px-4 py-2.5 rounded-xl text-xs hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-brand-700 hover:bg-brand-600 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all shadow-md shadow-brand-700/10"
                >
                  Import Leads Database
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
