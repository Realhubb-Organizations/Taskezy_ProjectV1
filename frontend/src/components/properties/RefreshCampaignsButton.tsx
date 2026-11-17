"use client";

import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiRefreshCampaignLists } from "@/lib/apiClient";

interface RefreshCampaignsButtonProps {
  /** Reloads the picker's suggestions once the refresh has finished. */
  onRefreshed: () => Promise<void>;
  disabled?: boolean;
}

/**
 * Shared by the Meta and Google campaign pickers: pulls the latest campaign
 * lists from Meta and Google now, so a campaign just created in Ads Manager
 * can be linked straight away instead of after the next 15-minute refresh.
 */
export default function RefreshCampaignsButton({ onRefreshed, disabled }: RefreshCampaignsButtonProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const handleClick = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await apiRefreshCampaignLists();
      if (!result.refreshed) {
        setMessage(result.reason === "cooldown" ? "Just refreshed. Try again in a minute." : "A refresh is already running.");
      }
      await onRefreshed();
      if (result.refreshed) setMessage("Campaign list updated.");
    } catch {
      setMessage("Couldn't refresh campaigns. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || disabled}
        title="Get the latest campaigns from Meta and Google Ads"
        className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-brand-600 disabled:opacity-50"
      >
        <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Refreshing…" : "Refresh campaigns"}
      </button>
      {message && <span className="text-[10px] text-slate-500">{message}</span>}
    </div>
  );
}
