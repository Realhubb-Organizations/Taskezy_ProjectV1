"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { LinkerHandle, sameList } from "./linkerHandle";
import { FileSpreadsheet, X, Loader2, Plus } from "lucide-react";
import {
  apiGetSheetSourceSuggestions,
  apiGetPropertySheetSources,
  apiSetPropertySheetSources,
  ApiRequestError
} from "@/lib/apiClient";
import { SearchableSelect } from "@/components/ui/SearchableDropdown";
import FieldError, { fieldErrorClass } from "@/components/ui/FieldError";
import { validateText } from "@/lib/validation";

interface SheetSourceLinkerProps {
  propertyId: string;
  isAdmin: boolean;
  /** Fires when the list differs from what's saved (the popup's Save button). */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Mirrors GoogleCampaignLinker.tsx, but for the Google Ads lead-form sheet
 * import (see modules/sheet-import) — a lead's sheet source name (the sheet's
 * per-project tab, e.g. "Neopolis") is matched against what's linked here to
 * pick the property it belongs to, replacing the fragile exact-name-match
 * against the property's own display name the importer originally used.
 * Suggestions come from every sheet source name actually seen on an incoming
 * lead (recordSheetSourceSeen) rather than a synced-campaign cache, since
 * there's no equivalent sync job for sheet sources.
 */
// Add / remove only change the list on screen; the property popup's Save
// button calls save() through the ref to persist it (one call per linker).
const SheetSourceLinker = forwardRef<LinkerHandle, SheetSourceLinkerProps>(function SheetSourceLinker({ propertyId, isAdmin, onDirtyChange }, ref) {
  const [sources, setSources] = useState<string[]>([]);
  const [savedSources, setSavedSources] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customNameError, setCustomNameError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiGetPropertySheetSources(propertyId),
      isAdmin ? apiGetSheetSourceSuggestions() : Promise.resolve<string[]>([])
    ])
      .then(([linked, suggested]) => {
        if (cancelled) return;
        setSources(linked);
        setSavedSources(linked);
        setSuggestions(suggested);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load connected lead-form sheets.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId, isAdmin]);

  const dirty = !sameList(sources, savedSources);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useImperativeHandle(ref, () => ({
    save: async () => {
      if (!dirty) return true;
      setSaving(true);
      setError("");
      try {
        const confirmed = await apiSetPropertySheetSources(propertyId, sources);
        setSources(confirmed);
        setSavedSources(confirmed);
        return true;
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Could not save — please try again.");
        return false;
      } finally {
        setSaving(false);
      }
    }
  }), [dirty, propertyId, sources]);

  const save = (next: string[]) => setSources(next); // staged until the popup's Save

  const availableSuggestions = useMemo(
    () => suggestions.filter(s => !sources.includes(s)),
    [suggestions, sources]
  );

  const handleAddSelected = () => {
    const name = selected.trim();
    setSelected("");
    if (!name || sources.includes(name)) return;
    save([...sources, name]);
  };

  const handleAddCustom = () => {
    const name = customInput.trim();
    const validationError = validateText(name, { label: "Sheet source name" });
    if (validationError) {
      setCustomNameError(validationError);
      return;
    }
    if (sources.includes(name)) {
      setCustomInput("");
      setCustomNameError("");
      return;
    }
    setCustomInput("");
    setCustomNameError("");
    setShowCustomInput(false);
    save([...sources, name]);
  };

  const handleRemove = (name: string) => {
    save(sources.filter(c => c !== name));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading connected lead-form sheets…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
        <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
        Connected Lead-Form Sheets
      </span>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        A lead imported from a Google Ads sheet whose per-project tab name matches one below is assigned to this property&apos;s sales team automatically.
      </p>

      {sources.length === 0 && !isAdmin && (
        <p className="text-[11px] text-slate-400 italic">No lead-form sheets connected yet.</p>
      )}

      {sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sources.map(name => (
            <span key={name} className="inline-flex items-center gap-1 bg-brand-50 border border-brand-100 text-brand-700 px-2 py-0.5 rounded-lg text-[10px] font-bold">
              {name}
              {isAdmin && (
                <button type="button" onClick={() => handleRemove(name)} disabled={saving} className="hover:text-brand-900 disabled:opacity-40">
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="space-y-2">
          {/* Visible dropdown of sheet source names actually seen on an incoming lead */}
          <div className="flex gap-2">
            <SearchableSelect
              options={availableSuggestions}
              value={selected}
              onChange={setSelected}
              disabled={saving}
              placeholder={availableSuggestions.length === 0 ? "No unlinked sheet sources yet" : "Select a sheet source…"}
              searchPlaceholder="Search sheet sources..."
              panelWidth={260}
            />
            <button
              type="button"
              onClick={handleAddSelected}
              disabled={saving || !selected}
              className="ui-btn ui-btn-primary shrink-0 disabled:opacity-40"
            >
              {saving ? "…" : "Add"}
            </button>
          </div>

          {/* Fallback for a sheet source that hasn't sent a lead yet, so it can't be in the dropdown above */}
          {showCustomInput ? (
            <div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => { setCustomInput(e.target.value); setCustomNameError(""); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustom();
                    }
                  }}
                  disabled={saving}
                  autoFocus
                  maxLength={200}
                  aria-invalid={!!customNameError}
                  placeholder="Exact sheet tab name, e.g. Neopolis"
                  className={`w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500 disabled:opacity-60 ${fieldErrorClass(!!customNameError)}`}
                />
                <button
                  type="button"
                  onClick={handleAddCustom}
                  disabled={saving}
                  className="ui-btn ui-btn-primary shrink-0 disabled:opacity-50"
                >
                  {saving ? "…" : "Add"}
                </button>
              </div>
              <FieldError message={customNameError} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustomInput(true)}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-brand-600"
            >
              <Plus className="h-3 w-3" /> Add a sheet source that hasn&apos;t sent a lead yet
            </button>
          )}
        </div>
      )}

      {dirty && !error && <p className="text-[10px] text-amber-600 font-semibold">Unsaved changes — click Save to apply.</p>}
      {error && <p className="text-[10px] text-red-600 font-bold">{error}</p>}
    </div>
  );
});

export default SheetSourceLinker;
