import React from "react";
import { AlertTriangle } from "lucide-react";
import { BulkImportPrecheckResult } from "@/lib/apiClient";

interface ArchiveRestoreConfirmProps {
  precheck: BulkImportPrecheckResult;
  onRestore: () => void;
  onSkip: () => void;
  onBack: () => void;
  submitting: boolean;
  error?: string | null;
}

/**
 * Shown in place of a bulk-upload modal's form, between "parse the file"
 * and "actually import," whenever the precheck finds rows whose phone
 * matches a previously-deleted lead (see apiPrecheckBulkImportLeads). One
 * batch-level choice — not per-row, a real upload can be thousands of
 * rows — shared by UploadLeadsModal.tsx (Data Calling) and
 * AddLeadModal.tsx's bulk tab (the Leads page), since both need the exact
 * same ask.
 */
export default function ArchiveRestoreConfirm({ precheck, onRestore, onSkip, onBack, submitting, error }: ArchiveRestoreConfirmProps) {
  const extra = precheck.archivedMatchCount - precheck.archivedMatchesPreview.length;
  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-8 w-8 text-amber-500 shrink-0" />
        <div>
          <p className="text-sm font-extrabold text-slate-900">
            {precheck.archivedMatchCount} row{precheck.archivedMatchCount === 1 ? "" : "s"} match previously-deleted leads
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Restore their old notes and call history onto the new leads, or skip restoring and import them fresh like any other row?
          </p>
        </div>
      </div>
      <div className="border border-amber-200 bg-amber-50/60 rounded-xl max-h-48 overflow-y-auto">
        {precheck.archivedMatchesPreview.map((m, i) => (
          <div key={i} className="px-3.5 py-2 text-xs text-amber-800 border-b border-amber-100 last:border-b-0">
            <span className="font-bold">{m.name || "(no name)"}</span> · {m.phone} — deleted {new Date(m.deletedAt).toLocaleDateString("en-IN")} by {m.deletedByName}
          </div>
        ))}
        {extra > 0 && (
          <div className="px-3.5 py-2 text-xs text-amber-600 font-bold">+{extra} more</div>
        )}
      </div>
      {error && <p className="text-[11px] text-red-600 font-semibold">{error}</p>}
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="sm:order-1 bg-slate-100 border border-slate-200 text-slate-750 font-bold px-4 py-2 rounded-xl text-sm hover:bg-slate-200 disabled:opacity-60 transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={submitting}
          className="sm:order-2 flex-1 bg-white border border-slate-300 text-slate-700 font-bold px-4 py-2 rounded-xl text-sm hover:bg-slate-50 disabled:opacity-60 transition-colors"
        >
          Skip — import as new leads
        </button>
        <button
          type="button"
          onClick={onRestore}
          disabled={submitting}
          className="sm:order-3 flex-1 bg-[#0B1E6E] hover:bg-[#081650] disabled:opacity-60 text-white font-bold px-4 py-2 rounded-xl text-sm transition-all shadow-md shadow-[#0B1E6E]/10"
        >
          {submitting ? "Importing…" : "Restore their history"}
        </button>
      </div>
    </div>
  );
}
