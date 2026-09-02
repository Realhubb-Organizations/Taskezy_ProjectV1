"use client";

import React, { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, X, Loader2, Plus } from "lucide-react";
import {
  apiGetSheetSourceSuggestions,
  apiGetPropertySheetSources,
  apiSetPropertySheetSources,
  ApiRequestError
} from "@/lib/apiClient";

interface SheetSourceLinkerProps {
  propertyId: string;
  isAdmin: boolean;
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
export default function SheetSourceLinker({ propertyId, isAdmin }: SheetSourceLinkerProps) {
  const [sources, setSources] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
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

  const save = async (next: string[]) => {
    setSaving(true);
    setError("");
    const previous = sources;
    setSources(next); // optimistic — reverted below on failure
    try {
      const confirmed = await apiSetPropertySheetSources(propertyId, next);
      setSources(confirmed);
    } catch (err) {
      setSources(previous);
      setError(err instanceof ApiRequestError ? err.message : "Could not save — please try again.");
    } finally {
      setSaving(false);
    }
  };

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
    if (!name || sources.includes(name)) {
      setCustomInput("");
      return;
    }
    setCustomInput("");
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
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={saving}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-brand-500 disabled:opacity-60"
            >
              <option value="">
                {availableSuggestions.length === 0 ? "No unlinked sheet sources yet" : "Select a sheet source…"}
              </option>
              {availableSuggestions.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAddSelected}
              disabled={saving || !selected}
              className="shrink-0 bg-brand-700 hover:bg-brand-600 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all disabled:opacity-40"
            >
              {saving ? "…" : "Add"}
            </button>
          </div>

          {/* Fallback for a sheet source that hasn't sent a lead yet, so it can't be in the dropdown above */}
          {showCustomInput ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustom();
                  }
                }}
                disabled={saving}
                autoFocus
                placeholder="Exact sheet tab name, e.g. Neopolis"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleAddCustom}
                disabled={saving}
                className="shrink-0 bg-brand-700 hover:bg-brand-600 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all disabled:opacity-50"
              >
                {saving ? "…" : "Add"}
              </button>
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

      {error && <p className="text-[10px] text-red-600 font-bold">{error}</p>}
    </div>
  );
}
