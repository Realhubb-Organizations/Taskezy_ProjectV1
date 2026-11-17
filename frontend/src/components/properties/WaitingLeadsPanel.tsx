"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Inbox, Loader2 } from "lucide-react";
import { apiAssignLeadsWaitingForProperty, apiGetLeadsWaitingForProperty, ApiWaitingLead } from "@/lib/apiClient";
import { useDialog } from "@/components/ui/DialogProvider";

interface WaitingLeadsPanelProps {
  propertyId: string;
  propertyName: string;
  /** Bump after the popup saves its campaign / sheet links, to re-check. */
  reloadKey: number;
}

const formatArrived = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Admin-only. Leads that landed on an admin because this property's Meta
 * campaign or sheet tab wasn't linked yet. Shows the exact list and moves
 * nothing until the admin confirms; the server re-checks every lead before
 * assigning it with the property's own team rule.
 */
export default function WaitingLeadsPanel({ propertyId, propertyName, reloadKey }: WaitingLeadsPanelProps) {
  const { toast, confirm } = useDialog();
  const [leads, setLeads] = useState<ApiWaitingLead[]>([]);
  const [canAssign, setCanAssign] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiGetLeadsWaitingForProperty(propertyId);
      setLeads(result.leads);
      setCanAssign(result.canAssign);
    } catch {
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { load(); }, [load, reloadKey]);

  const handleAssign = async () => {
    const count = leads.length;
    const ok = await confirm({
      title: `Assign ${count} waiting lead${count === 1 ? "" : "s"}?`,
      message: `They'll be shared out to ${propertyName}'s sales team using the property's own assignment rule. Each agent gets a notification, and each lead keeps its history.`,
      confirmLabel: `Assign ${count} lead${count === 1 ? "" : "s"}`
    });
    if (!ok) return;
    setAssigning(true);
    try {
      const { assigned, skipped } = await apiAssignLeadsWaitingForProperty(propertyId, leads.map(l => l.id));
      toast(
        skipped > 0
          ? `${assigned} lead${assigned === 1 ? "" : "s"} assigned. ${skipped} left waiting (changed since you opened this, or no eligible agent).`
          : `${assigned} lead${assigned === 1 ? "" : "s"} assigned to ${propertyName}'s team.`,
        assigned > 0 ? "success" : "error"
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't assign the waiting leads. Try again.", "error");
    } finally {
      setAssigning(false);
      load();
    }
  };

  if (loading || leads.length === 0) return null;

  return (
    <div className="space-y-2">
      <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
        <Inbox className="h-3.5 w-3.5 text-slate-500" />
        Leads waiting for this property ({leads.length})
      </span>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        These arrived before their campaign or sheet was linked here, so they&apos;re still Unassigned on an admin.
        Only leads nobody has worked yet, from the last 30 days, are listed.
      </p>
      <ul className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
        {leads.map(lead => (
          <li key={lead.id} className="px-3 py-2 text-[11px] flex flex-wrap justify-between gap-x-3 gap-y-0.5">
            <span className="font-semibold text-slate-800">{lead.name}</span>
            <span className="text-slate-500">{lead.phone}</span>
            <span className="w-full text-slate-500 truncate">
              {lead.from_sheet ? "Google sheet" : "Meta"}: {lead.campaign || "no campaign name"} · arrived {formatArrived(lead.created_at)} · on {lead.held_by}
            </span>
          </li>
        ))}
      </ul>
      {canAssign ? (
        <button type="button" onClick={handleAssign} disabled={assigning} className="ui-btn ui-btn-primary w-full disabled:opacity-50">
          {assigning ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Assigning…</> : `Assign ${leads.length} lead${leads.length === 1 ? "" : "s"} to this property's team`}
        </button>
      ) : (
        <p className="text-[10px] text-amber-700 font-semibold">Add an active sales team to this property before these leads can be assigned.</p>
      )}
    </div>
  );
}
