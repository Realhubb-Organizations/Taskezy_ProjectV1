import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Upload, FileSpreadsheet, Info, Download, Sparkles } from "lucide-react";

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
  const [mounted, setMounted] = useState(false);
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

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll when modal is active so background page is NOT scrollable
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) {
      alert("Name and Phone are required.");
      return;
    }
    onSubmitManual({ name, phone, email, agent, source, note });
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

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 overflow-hidden">
      {/* Full screen backdrop covering sidebar, header, and entire window */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" 
        onClick={onClose} 
      />

      {/* Modal Dialog Box — centered on 1 screen view */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden border border-slate-200/80 z-10 animate-fade-in">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/60 shrink-0">
          <div>
            <h3 className="text-sm font-extrabold text-slate-850 flex items-center gap-2">
              <Sparkles className="h-4.5 w-4.5 text-[#006AFF]" />
              Ingest CRM Leads Partition
            </h3>
            <p className="text-[10px] text-slate-450 mt-0.5 font-medium">Register new properties buyers manually or bulk import lists.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Tab Headers */}
        <div className="flex border-b border-slate-150 text-xs font-bold text-slate-500 bg-white shrink-0">
          <button
            onClick={() => setActiveTab("manual")}
            className={`flex-1 py-3 text-center border-b-2 transition-all ${
              activeTab === "manual" ? "border-[#006AFF] text-[#006AFF] font-extrabold bg-blue-50/20" : "border-transparent hover:bg-slate-50/50"
            }`}
          >
            Manual Ingestion Entry
          </button>
          <button
            onClick={() => setActiveTab("bulk")}
            className={`flex-1 py-3 text-center border-b-2 transition-all ${
              activeTab === "bulk" ? "border-[#006AFF] text-[#006AFF] font-extrabold bg-blue-50/20" : "border-transparent hover:bg-slate-50/50"
            }`}
          >
            Bulk Spreadsheet Upload
          </button>
        </div>

        {/* Form Body - fits inside single view */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === "manual" ? (
            /* MANUAL TAB */
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Buyer Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Priyanth Kumar"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-[#006AFF] focus:ring-2 focus:ring-[#006AFF]/10 transition-all shadow-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Contact Phone Number</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +91 9845012345"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-[#006AFF] focus:ring-2 focus:ring-[#006AFF]/10 transition-all shadow-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. buyer@example.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-[#006AFF] focus:ring-2 focus:ring-[#006AFF]/10 transition-all shadow-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Assigned Agent</label>
                  <select
                    value={agent}
                    onChange={(e) => setAgent(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-[#006AFF] transition-all"
                  >
                    {agentsList.map(ag => (
                      <option key={ag} value={ag}>{ag}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Lead Acquisition Channel</label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:bg-white focus:border-[#006AFF] transition-all"
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
                <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Internal Telemetry Notes</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Include potential requirements (budget, BHK configuration, preferred site visit date)..."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-[#006AFF] transition-all shadow-xs"
                />
              </div>

              <div className="pt-3 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#0b2545] hover:bg-[#081b33] text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all shadow-md shadow-[#0b2545]/20"
                >
                  Save Lead Profile
                </button>
              </div>
            </form>
          ) : (
            /* BULK UPLOAD TAB */
            <form onSubmit={handleBulkSubmit} className="space-y-4">
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
                        ? "bg-[#0b2545] border-[#0b2545] text-white shadow-xs"
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
                        ? "bg-[#0b2545] border-[#0b2545] text-white shadow-xs"
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
                </div>
              </div>

              {/* Excel Drag & Drop Dropzone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-2 ${
                  dragOver
                    ? "border-[#006AFF] bg-blue-50/20"
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
                      <p className="text-xs font-bold text-slate-800">File Loaded Successfully</p>
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
                  <Info className="h-3.5 w-3.5 text-[#006AFF]" />
                  <span>Sheet must contain: Name, Phone, Email</span>
                </div>
                <button
                  type="button"
                  onClick={triggerDownloadTemplate}
                  className="inline-flex items-center gap-1 text-[9px] font-extrabold text-[#006AFF] hover:underline"
                >
                  <Download className="h-3 w-3" />
                  Download Template
                </button>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#0b2545] hover:bg-[#081b33] text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all shadow-md shadow-[#0b2545]/20"
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

  return createPortal(modalContent, document.body);
}
