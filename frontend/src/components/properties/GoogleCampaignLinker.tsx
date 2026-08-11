"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Megaphone, X, Loader2, Plus } from "lucide-react";
import {
  apiGetGoogleCampaignSuggestions,
  apiGetPropertyGoogleCampaigns,
  apiSetPropertyGoogleCampaigns,
  ApiRequestError
} from "@/lib/apiClient";

interface GoogleCampaignLinkerProps {
  propertyId: string;
  isAdmin: boolean;
}

/**
 * Mirrors MetaCampaignLinker.tsx, but for Google Ads spend attribution —
 * ad_spend_records.google_campaign_id is stamped by the sync job by matching
 * a synced campaign's name against what's linked here (see
 * jobs/googleAdsSpendSync.ts -> google-ads.repository.ts upsertCampaign).
 */
export default function GoogleCampaignLinker({ propertyId, isAdmin }: GoogleCampaignLinkerProps) {
  const [campaigns, setCampaigns] = useState<string[]>([]);
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
      apiGetPropertyGoogleCampaigns(propertyId),
      isAdmin ? apiGetGoogleCampaignSuggestions() : Promise.resolve<string[]>([])
    ])
      .then(([linked, suggested]) => {
        if (cancelled) return;
        setCampaigns(linked);
        setSuggestions(suggested);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load connected campaigns.");
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
    const previous = campaigns;
    setCampaigns(next); // optimistic — reverted below on failure
    try {
      const confirmed = await apiSetPropertyGoogleCampaigns(propertyId, next);
      setCampaigns(confirmed);
    } catch (err) {
      setCampaigns(previous);
      setError(err instanceof ApiRequestError ? err.message : "Could not save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const availableSuggestions = useMemo(
    () => suggestions.filter(s => !campaigns.includes(s)),
    [suggestions, campaigns]
  );

  const handleAddSelected = () => {
    const name = selected.trim();
    setSelected("");
    if (!name || campaigns.includes(name)) return;
    save([...campaigns, name]);
  };

  const handleAddCustom = () => {
    const name = customInput.trim();
    if (!name || campaigns.includes(name)) {
      setCustomInput("");
      return;
    }
    setCustomInput("");
    setShowCustomInput(false);
    save([...campaigns, name]);
  };

  const handleRemove = (name: string) => {
    save(campaigns.filter(c => c !== name));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading connected campaigns…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
        <Megaphone className="h-3.5 w-3.5 text-slate-500" />
        Connected Google Campaigns
      </span>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        Ad spend from a synced Google campaign whose name matches one below is attributed to this property automatically.
      </p>

      {campaigns.length === 0 && !isAdmin && (
        <p className="text-[11px] text-slate-400 italic">No campaigns connected yet.</p>
      )}

      {campaigns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {campaigns.map(name => (
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
          {/* Visible dropdown of campaign names the sync job has actually seen under the connected MCC */}
          <div className="flex gap-2">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={saving}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-brand-500 disabled:opacity-60"
            >
              <option value="">
                {availableSuggestions.length === 0 ? "No synced campaigns yet" : "Select a synced campaign…"}
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

          {/* Fallback for a campaign the sync job hasn't picked up yet, so it can't be in the dropdown above */}
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
                placeholder="Exact campaign name from Google Ads"
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
              <Plus className="h-3 w-3" /> Add a campaign that hasn&apos;t synced yet
            </button>
          )}
        </div>
      )}

      {error && <p className="text-[10px] text-red-600 font-bold">{error}</p>}
    </div>
  );
}
