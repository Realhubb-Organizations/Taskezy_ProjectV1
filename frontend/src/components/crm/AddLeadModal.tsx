import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Upload, FileSpreadsheet, Info, Download, Plus, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { PlatformLabel } from "@/components/icons/ContactIcons";
import { SearchableSelect } from "@/components/ui/SearchableDropdown";
import { useDialog } from "@/components/ui/DialogProvider";
import FieldError, { fieldErrorClass } from "@/components/ui/FieldError";
import { collectErrors, normalizeLeadPhone, phoneInputProps, sanitizePhoneInput, validateEmail, validateLeadPhone, validatePersonName } from "@/lib/validation";
import ArchiveRestoreConfirm from "./ArchiveRestoreConfirm";
import { apiPrecheckBulkImportLeads, type BulkImportPrecheckResult } from "@/lib/apiClient";

const BASE_LEAD_SOURCES = ["Meta Ads", "Google Ads", "Referral Code", "Offline Event", "Direct Walkin"];
const CUSTOM_LEAD_SOURCES_KEY = "taskezy_custom_lead_sources";

// exceljs is a ~260KB dependency, dynamically imported so it's only fetched
// when an admin/manager actually opens this modal's bulk tab — same
// reasoning as Data Calling's own UploadLeadsModal.tsx, which this mirrors
// (deliberately NOT shared code: that modal's batch concept is a free-text
// "sub-source" with no Lead Source/Property, this one's is the opposite —
// see leads.service.ts's bulkImportLeads for how the two stay distinct on
// the backend too).
async function loadExcelJS() {
  const mod = await import("exceljs");
  return mod.default;
}

const BULK_TEMPLATE_HEADERS = ["Name", "Phone", "Email"];

async function downloadBulkLeadsTemplate() {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Leads");
  sheet.columns = [
    { header: BULK_TEMPLATE_HEADERS[0], key: "name", width: 28 },
    { header: BULK_TEMPLATE_HEADERS[1], key: "phone", width: 20 },
    { header: BULK_TEMPLATE_HEADERS[2], key: "email", width: 28 }
  ];
  sheet.addRow({ name: "Ravi Kumar", phone: "9876543210", email: "ravi@example.com" });
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

interface BulkParsedLeadRow {
  name: string;
  phone: string;
  email: string;
}

/** Column position matches the downloaded template (Name, Phone, Email) by
 * default, but the header row is checked for matching words first so a
 * re-ordered sheet still parses correctly. */
async function parseBulkLeadsFile(file: File): Promise<BulkParsedLeadRow[]> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  let nameCol = 1;
  let phoneCol = 2;
  let emailCol = 3;
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    const header = String(cell.value ?? "").trim().toLowerCase();
    if (header.includes("name")) nameCol = colNumber;
    if (header.includes("mobile") || header.includes("phone")) phoneCol = colNumber;
    if (header.includes("email")) emailCol = colNumber;
  });

  const rows: BulkParsedLeadRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const name = String(row.getCell(nameCol).value ?? "").trim();
    const phone = String(row.getCell(phoneCol).value ?? "").trim();
    const email = String(row.getCell(emailCol).value ?? "").trim();
    if (name || phone) rows.push({ name, phone, email });
  });
  return rows;
}

export interface BulkLeadUploadSubmitInput {
  assignmentMode: "PROPERTY" | "AGENT";
  propertyId: string;
  agentIds?: string[];
  source: string;
  leads: BulkParsedLeadRow[];
  // One batch-level choice from the archive-match precheck below — true
  // re-attaches a matched row's old notes/call history onto the new lead.
  restoreArchivedMatches?: boolean;
}

export interface BulkLeadUploadSubmitResult {
  created: number;
  duplicates: number;
  skipped: { row: number; reason: string }[];
  restored: number;
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
  onSubmitBulk: (input: BulkLeadUploadSubmitInput) => Promise<BulkLeadUploadSubmitResult>;
  agentsList: string[];
  propertiesList: string[];
  // Id-ful rosters for the bulk tab specifically — the real bulk-import
  // endpoint needs agent/property UUIDs, unlike the manual tab above which
  // has always operated on plain names (see addLead in AppContext.tsx).
  bulkAgentsList: { id: string; name: string }[];
  bulkPropertiesList: { id: string; name: string }[];
  // Admins always have it; a Manager needs the Access Control toggle
  // (Settings > Manage Users, Super Admin only) — the server enforces this
  // independently (leads.service.ts's assertBulkImportAllowed), this just
  // hides the tab so a blocked manager doesn't fill out a form that can
  // only end in a 403.
  canUseBulkTab: boolean;
}

export default function AddLeadModal({
  isOpen,
  onClose,
  onSubmitManual,
  onSubmitBulk,
  agentsList,
  propertiesList,
  bulkAgentsList,
  bulkPropertiesList,
  canUseBulkTab
}: AddLeadModalProps) {
  const { toast } = useDialog();
  const [activeTab, setActiveTab] = useState<"manual" | "bulk">("manual");

  // Tab 1 Form State
  const [name, setName] = useState("");
  // Per-field messages shown under the manual-entry inputs.
  const [manualErrors, setManualErrors] = useState<Partial<Record<"name" | "phone" | "email", string>>>({});
  const clearError = (field: "name" | "phone" | "email") =>
    setManualErrors(prev => (prev[field] ? { ...prev, [field]: undefined } : prev));
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
  // In "project" mode this id is both the round-robin target AND the
  // batch's Property; in "agent" mode it's the batch's Property alone
  // (bulkAgentId below is the actual assignment target), so there's no
  // redundant second property picker in either mode.
  const [bulkPropertyId, setBulkPropertyId] = useState(bulkPropertiesList[0]?.id || "");
  const [bulkAgentId, setBulkAgentId] = useState(bulkAgentsList[0]?.id || "");
  const [bulkSource, setBulkSource] = useState("Meta Ads");
  const [dragOver, setDragOver] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkErrorMsg, setBulkErrorMsg] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkLeadUploadSubmitResult | null>(null);
  // Set only when the precheck finds rows matching a previously-deleted
  // lead — holds the already-parsed rows so the chosen restore/skip button
  // doesn't need to re-read the file.
  const [bulkArchiveCheck, setBulkArchiveCheck] = useState<BulkImportPrecheckResult | null>(null);
  const [bulkParsedLeads, setBulkParsedLeads] = useState<BulkParsedLeadRow[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset the bulk tab's transient state on close, so reopening never shows
  // a stale "import successful" screen or a leftover file from last time.
  useEffect(() => {
    if (isOpen) return;
    setBulkFile(null);
    setBulkSubmitting(false);
    setBulkErrorMsg(null);
    setBulkResult(null);
    setBulkArchiveCheck(null);
    setBulkParsedLeads(null);
  }, [isOpen]);

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
    const errors = collectErrors({
      name: validatePersonName(name, { label: "Buyer name" }),
      phone: validateLeadPhone(phone, { required: true }),
      email: validateEmail(email)
    });
    setManualErrors(errors);
    if (Object.keys(errors).length > 0) return;
    // "+91 98450 12345" → "9845012345" and "+971 55 422 3805" → "+971554223805", the formats the server stores.
    onSubmitManual({ name: name.trim(), phone: normalizeLeadPhone(phone)!, email: email.trim(), agent, source, property, note });
    // Reset manual form fields
    setName("");
    setPhone("");
    setEmail("");
    setNote("");
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkErrorMsg(null);
    if (!bulkFile) {
      setBulkErrorMsg("Please upload a lead spreadsheet file first.");
      return;
    }
    if (!bulkSource.trim()) {
      setBulkErrorMsg("Please select a lead source for this batch.");
      return;
    }
    if (!bulkPropertyId) {
      setBulkErrorMsg("Please select a property for this batch.");
      return;
    }
    if (bulkMode === "agent" && !bulkAgentId) {
      setBulkErrorMsg("Please select an agent to assign these leads to.");
      return;
    }

    setBulkSubmitting(true);
    try {
      const leads = await parseBulkLeadsFile(bulkFile);
      if (leads.length === 0) {
        setBulkErrorMsg("No rows found in that file. Make sure it follows the downloaded template (Name, Phone, Email).");
        setBulkSubmitting(false);
        return;
      }
      // Ask once, batch-level, if any row matches a previously-deleted
      // lead — only when it actually finds one; a normal upload with no
      // archived matches goes straight to the real import below.
      const precheck = await apiPrecheckBulkImportLeads(leads);
      if (precheck.archivedMatchCount > 0) {
        setBulkParsedLeads(leads);
        setBulkArchiveCheck(precheck);
        setBulkSubmitting(false);
        return;
      }
      const result = await onSubmitBulk({
        assignmentMode: bulkMode === "project" ? "PROPERTY" : "AGENT",
        propertyId: bulkPropertyId,
        agentIds: bulkMode === "agent" ? [bulkAgentId] : undefined,
        source: bulkSource.trim(),
        leads,
        restoreArchivedMatches: false
      });
      setBulkResult(result);
    } catch (err) {
      setBulkErrorMsg(err instanceof Error ? err.message : "Could not read that file — make sure it's a valid .xlsx/.xls spreadsheet.");
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleBulkArchiveChoice = async (restoreArchivedMatches: boolean) => {
    if (!bulkParsedLeads) return;
    setBulkSubmitting(true);
    setBulkErrorMsg(null);
    try {
      const result = await onSubmitBulk({
        assignmentMode: bulkMode === "project" ? "PROPERTY" : "AGENT",
        propertyId: bulkPropertyId,
        agentIds: bulkMode === "agent" ? [bulkAgentId] : undefined,
        source: bulkSource.trim(),
        leads: bulkParsedLeads,
        restoreArchivedMatches
      });
      setBulkResult(result);
      setBulkArchiveCheck(null);
    } catch (err) {
      setBulkErrorMsg(err instanceof Error ? err.message : "Could not complete the import — please try again.");
    } finally {
      setBulkSubmitting(false);
    }
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
      setBulkFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setBulkFile(e.target.files[0]);
    }
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
        <div className="w-full sm:max-w-3xl h-[95vh] h-[95dvh] sm:h-auto sm:max-h-[90vh] my-0 sm:my-8 bg-white border-0 sm:border border-slate-200 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
            <h3 className="ui-title">
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
            {canUseBulkTab && (
              <button
                onClick={() => setActiveTab("bulk")}
                className={`flex-1 py-3 text-center border-b-2 transition-all ${
                  activeTab === "bulk" ? "border-[#0B1E6E] text-[#0B1E6E] font-black" : "border-transparent hover:bg-slate-50/50"
                }`}
              >
                Bulk Spreadsheet Upload
              </button>
            )}
          </div>

          {activeTab === "manual" ? (
            /* MANUAL TAB */
            <form onSubmit={handleManualSubmit} noValidate className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Horizontal 3-across grid on wide/PC screens, single column
                    (naturally vertical) on narrower/mobile viewports. */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">Buyer Full Name</label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      autoComplete="name"
                      value={name}
                      onChange={(e) => { setName(e.target.value); clearError("name"); }}
                      onBlur={() => name && setManualErrors(prev => ({ ...prev, name: validatePersonName(name, { label: "Buyer name" }) ?? undefined }))}
                      placeholder="e.g. Priyanth Kumar"
                      aria-invalid={!!manualErrors.name}
                      className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-[#0B1E6E] transition-all shadow-sm ${fieldErrorClass(!!manualErrors.name)}`}
                    />
                    <FieldError message={manualErrors.name} />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">Contact Phone Number</label>
                    <input
                      {...phoneInputProps}
                      required
                      value={phone}
                      onChange={(e) => { setPhone(sanitizePhoneInput(e.target.value)); clearError("phone"); }}
                      onBlur={() => phone && setManualErrors(prev => ({ ...prev, phone: validateLeadPhone(phone) ?? undefined }))}
                      placeholder="e.g. 9845012345 or +971 55 422 3805"
                      aria-invalid={!!manualErrors.phone}
                      className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-[#0B1E6E] transition-all shadow-sm ${fieldErrorClass(!!manualErrors.phone)}`}
                    />
                    <FieldError message={manualErrors.phone} />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">Email Address</label>
                    <input
                      type="email"
                      maxLength={254}
                      autoComplete="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                      onBlur={() => email && setManualErrors(prev => ({ ...prev, email: validateEmail(email) ?? undefined }))}
                      placeholder="e.g. buyer@example.com"
                      aria-invalid={!!manualErrors.email}
                      className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:bg-white focus:border-[#0B1E6E] transition-all shadow-sm ${fieldErrorClass(!!manualErrors.email)}`}
                    />
                    <FieldError message={manualErrors.email} />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">Assigned Agent</label>
                    <SearchableSelect
                      value={agent}
                      onChange={setAgent}
                      options={agentsList}
                      placeholder="Select agent"
                      searchPlaceholder="Search agents..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">Lead Source</label>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 min-w-0">
                        <SearchableSelect
                          value={source}
                          onChange={setSource}
                          options={sourceOptions}
                          renderLabel={(l) => <PlatformLabel text={l} className="truncate" />}
                          placeholder="Select source"
                          searchPlaceholder="Search sources..."
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
                    <SearchableSelect
                      value={property}
                      onChange={setProperty}
                      options={[{ value: "", label: "Unassigned Project" }, ...propertiesList.map(p => ({ value: p, label: p }))]}
                      searchPlaceholder="Search properties..."
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
                  className="ui-btn ui-btn-secondary flex-1 sm:flex-none border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ui-btn ui-btn-primary flex-1 sm:flex-none sm:ml-auto shadow-[#0B1E6E]/10"
                >
                  Save Lead Profile
                </button>
              </div>
            </form>
          ) : bulkResult ? (
            /* BULK UPLOAD RESULT */
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-extrabold text-slate-900">{bulkResult.created} lead{bulkResult.created === 1 ? "" : "s"} imported</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {bulkResult.duplicates > 0 && `${bulkResult.duplicates} duplicate phone number${bulkResult.duplicates === 1 ? "" : "s"} skipped. `}
                      {bulkResult.restored > 0 && `${bulkResult.restored} restored from previously-deleted leads. `}
                      {bulkResult.skipped.length > 0 && `${bulkResult.skipped.length} row${bulkResult.skipped.length === 1 ? "" : "s"} skipped — see below.`}
                      {bulkResult.duplicates === 0 && bulkResult.restored === 0 && bulkResult.skipped.length === 0 && "Every row imported cleanly."}
                    </p>
                  </div>
                </div>
                {bulkResult.skipped.length > 0 && (
                  <div className="border border-amber-200 bg-amber-50/60 rounded-xl max-h-40 overflow-y-auto">
                    {bulkResult.skipped.map((s, i) => (
                      <div key={i} className="flex items-start gap-2 px-3.5 py-2 text-xs text-amber-800 border-b border-amber-100 last:border-b-0">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span><span className="font-bold">Row {s.row}:</span> {s.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="shrink-0 flex gap-3 px-6 py-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="ui-btn ui-btn-primary flex-1 sm:flex-none sm:ml-auto shadow-[#0B1E6E]/10"
                >
                  Close
                </button>
              </div>
            </div>
          ) : bulkArchiveCheck ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <ArchiveRestoreConfirm
                precheck={bulkArchiveCheck}
                onRestore={() => handleBulkArchiveChoice(true)}
                onSkip={() => handleBulkArchiveChoice(false)}
                onBack={() => { setBulkArchiveCheck(null); setBulkErrorMsg(null); }}
                submitting={bulkSubmitting}
                error={bulkErrorMsg}
              />
            </div>
          ) : (
            /* BULK UPLOAD TAB */
            <form onSubmit={handleBulkSubmit} className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {/* Lead Source + Property — batch-level fields, same
                    concepts as the Manual tab's, required here so every
                    bulk-imported lead carries real attribution instead of
                    landing with none. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase">Lead Source</label>
                    <SearchableSelect
                      value={bulkSource}
                      onChange={setBulkSource}
                      options={sourceOptions}
                      renderLabel={(l) => <PlatformLabel text={l} className="truncate" />}
                      placeholder="Select source"
                      searchPlaceholder="Search sources..."
                    />
                  </div>
                  {bulkMode === "agent" && (
                    <div className="space-y-1">
                      <label className="block text-[9px] font-bold text-slate-400 uppercase">Property</label>
                      <SearchableSelect
                        value={bulkPropertyId}
                        onChange={setBulkPropertyId}
                        options={bulkPropertiesList.map(p => ({ value: p.id, label: p.name }))}
                        placeholder="Select property"
                        searchPlaceholder="Search properties..."
                      />
                    </div>
                  )}
                </div>

                {/* Assignment Logic Toggle UI */}
                <div className="space-y-2 p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <label className="block text-[9px] font-extrabold text-slate-450 uppercase tracking-wider">Assignment Router Logic</label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setBulkMode("project");
                        setBulkPropertyId(bulkPropertiesList[0]?.id || "");
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
                        setBulkAgentId(bulkAgentsList[0]?.id || "");
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
                    {bulkMode === "project" ? (
                      <SearchableSelect
                        value={bulkPropertyId}
                        onChange={setBulkPropertyId}
                        options={bulkPropertiesList.map(p => ({ value: p.id, label: `${p.name} Project Team` }))}
                        placeholder="Select property"
                        searchPlaceholder="Search properties..."
                      />
                    ) : (
                      <SearchableSelect
                        value={bulkAgentId}
                        onChange={setBulkAgentId}
                        options={bulkAgentsList.map(a => ({ value: a.id, label: `${a.name} (Dedicated Agent)` }))}
                        placeholder="Select agent"
                        searchPlaceholder="Search agents..."
                      />
                    )}
                    <p className="text-[8px] text-slate-400 italic font-medium leading-relaxed mt-1">
                      {bulkMode === "project"
                        ? "Round-robin distribution distributes imported leads evenly across active agents assigned to this property. This is also the batch's Property."
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
                      : bulkFile
                        ? "border-emerald-500 bg-emerald-50/25"
                        : "border-slate-300 hover:border-slate-400 bg-white"
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".xlsx,.xls"
                    className="hidden"
                  />
                  {bulkFile ? (
                    <>
                      <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                        <FileSpreadsheet className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-805">File Loaded Successfully</p>
                        <p className="text-[9px] font-mono text-emerald-600 font-bold mt-0.5">{bulkFile.name}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="h-10 w-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
                        <Upload className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-700">Drag &amp; drop an Excel sheet here</p>
                        <p className="text-[9px] text-slate-400 font-semibold mt-0.5">or click to browse local files (.xlsx/.xls)</p>
                      </div>
                    </>
                  )}
                </div>

                {bulkErrorMsg && <p className="text-[11px] text-red-600 font-semibold">{bulkErrorMsg}</p>}

                {/* Template Download & Instructions */}
                <div className="flex flex-wrap justify-between items-center gap-2 text-xs py-2 bg-slate-50 border border-slate-200 rounded-xl px-4">
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-bold">
                    <Info className="h-3.5 w-3.5 text-[#0B1E6E] shrink-0" />
                    <span>Sheet must contain: Name, Phone, Email</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { downloadBulkLeadsTemplate().catch(() => setBulkErrorMsg("Could not generate the template file — please try again.")); }}
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
                  className="ui-btn ui-btn-secondary flex-1 sm:flex-none border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkSubmitting}
                  className="ui-btn ui-btn-primary flex-1 sm:flex-none sm:ml-auto disabled:opacity-60 shadow-[#0B1E6E]/10"
                >
                  {bulkSubmitting ? "Importing…" : "Import Leads Database"}
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
