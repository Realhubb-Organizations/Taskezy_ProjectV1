"use client";

import React, { useState } from "react";
import { Lead, mapApiLeadToFrontendLead } from "@/context/AppContext";
import { apiGetLead } from "@/lib/apiClient";
import LeadDetailDrawer from "./LeadDetailDrawer";
import { useLeadStatusChange } from "./LeadDrillDownPanel";

/**
 * Opens a lead's detail panel (the same LeadDetailDrawer the Leads page uses)
 * from any list that only has a lead id. Render `drawer` once in the list's
 * component; call `open(leadId)` from a row click.
 */
export function useLeadQuickView() {
  const handleStatusChange = useLeadStatusChange();
  const [lead, setLead] = useState<Lead | null>(null);
  const open = (leadId: string, fallback?: Lead) => {
    if (fallback) setLead(fallback);
    apiGetLead(leadId).then(row => setLead(mapApiLeadToFrontendLead(row))).catch(() => { /* keep the fallback, if any */ });
  };
  const drawer: React.ReactNode = lead ? (
    <LeadDetailDrawer lead={lead} isOpen onClose={() => setLead(null)} onUpdateStatus={handleStatusChange} />
  ) : null;
  return { open, drawer };
}
