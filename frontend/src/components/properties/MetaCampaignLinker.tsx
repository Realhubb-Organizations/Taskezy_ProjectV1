"use client";

import React, { useEffect, useState } from "react";
import { Megaphone, X, Loader2 } from "lucide-react";
import {
  apiGetMetaCampaignSuggestions,
  apiGetPropertyMetaCampaigns,
  apiSetPropertyMetaCampaigns,
  ApiRequestError
} from "@/lib/apiClient";

interface MetaCampaignLinkerProps {
  propertyId: string;
  isAdmin: boolean;
}

/**
 * New Meta leads auto-fill leads.property_id when their campaign name
 * matches one linked here (see meta.lead-ingest.ts) — this is what makes
 * that matching possible, not just cosmetic tagging.
 */
export default function MetaCampaignLinker({ propertyId, isAdmin }: MetaCampaignLinkerProps) {
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiGetPropertyMetaCampaigns(propertyId),
      isAdmin ? apiGetMetaCampaignSuggestions() : Promise.resolve<string[]>([])
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
      const confirmed = await apiSetPropertyMetaCampaigns(propertyId, next);
      setCampaigns(confirmed);
    } catch (err) {
      setCampaigns(previous);
      setError(err instanceof ApiRequestError ? err.message : "Could not save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    const name = input.trim();
    if (!name || campaigns.includes(name)) {
      setInput("");
      return;
    }
    setInput("");
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
        Connected Meta Campaigns
      </span>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        New Meta leads whose ad campaign name matches one below are filed under this property automatically.
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
        <>
          <div className="flex gap-2">
            <input
              type="text"
              list="meta-campaign-suggestions"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              disabled={saving}
              placeholder="Exact campaign name from Meta Ads Manager"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-brand-500 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving}
              className="shrink-0 bg-brand-700 hover:bg-brand-600 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all disabled:opacity-50"
            >
              {saving ? "…" : "Add"}
            </button>
          </div>
          <datalist id="meta-campaign-suggestions">
            {suggestions.filter(s => !campaigns.includes(s)).map(s => <option key={s} value={s} />)}
          </datalist>
        </>
      )}

      {error && <p className="text-[10px] text-red-600 font-bold">{error}</p>}
    </div>
  );
}
