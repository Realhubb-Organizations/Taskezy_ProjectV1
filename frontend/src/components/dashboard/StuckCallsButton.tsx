"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useDialog } from "@/components/ui/DialogProvider";
import { isSuperAdminUser } from "@/lib/superAdmin";
import { apiListStuckCallAttempts, apiForceCompleteCallAttempt, ApiStuckCallAttempt } from "@/lib/apiClient";

/**
 * Super-Admin-only button + popup for Manage Users — manual, on-demand
 * version of StuckCallsPanel.tsx's always-visible CRM Dashboard card
 * (same backend, /call-attempts/stuck + /call-attempts/:id/force-complete
 * — Admin already sees every stuck row with no team-scoping, so this
 * needs no backend change). Click to check who's stuck and where, Solve
 * to force-close. Renders nothing for anyone but the Super Admin account.
 */
export default function StuckCallsButton() {
  const { currentUser } = useApp();
  const { confirm, toast } = useDialog();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ApiStuckCallAttempt[] | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);

  if (!isSuperAdminUser(currentUser?.email)) return null;

  const openModal = async () => {
    setOpen(true);
    setLoading(true);
    try {
      setRows(await apiListStuckCallAttempts());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const timeStuck = (createdAt: string) => {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };

  const forceClose = async (row: ApiStuckCallAttempt) => {
    const ok = await confirm({
      title: "Force-close this call?",
      message: `${row.caller_name} has been stuck on "${row.lead_name ?? "a lead"}" for ${timeStuck(row.created_at)}. This marks their call feedback as resolved so they can use the app again — only do this once you've confirmed with them it's a dead end, not a call they're still on.`,
      confirmLabel: "Force Close",
      danger: true
    });
    if (!ok) return;
    setClosingId(row.id);
    try {
      await apiForceCompleteCallAttempt(row.id);
      setRows(prev => prev?.filter(r => r.id !== row.id) ?? null);
      toast(`Unstuck ${row.caller_name}.`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not force-close this call.", "error");
    } finally {
      setClosingId(null);
    }
  };

  return (
    <>
      <button onClick={openModal} className="ui-btn ui-btn-secondary border">
        <AlertTriangle className="h-4 w-4" />
        Stuck Calls
      </button>
      {open && createPortal(
        <div
          className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto p-6 space-y-4 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="h-9 w-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                  <AlertTriangle className="h-4.5 w-4.5" />
                </span>
                <h3 className="ui-title">Agents stuck on a call-feedback popup</h3>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading ? (
              <p className="text-xs text-slate-500">Checking...</p>
            ) : !rows || rows.length === 0 ? (
              <p className="text-xs text-slate-500">Nobody&apos;s stuck right now.</p>
            ) : (
              <div className="space-y-2">
                {rows.map(row => (
                  <div key={row.id} className="flex items-center justify-between gap-3 bg-amber-50 rounded-xl border border-amber-100 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{row.caller_name} · {row.lead_name ?? "Unknown lead"}</p>
                      <p className="text-[11px] text-slate-500">{row.channel === "WHATSAPP" ? "WhatsApp" : "Call"} · stuck for {timeStuck(row.created_at)}</p>
                    </div>
                    <button
                      onClick={() => forceClose(row)}
                      disabled={closingId === row.id}
                      className="shrink-0 text-xs font-bold text-amber-700 hover:text-amber-900 border border-amber-300 rounded-lg px-3 py-1.5 disabled:opacity-60 transition-colors"
                    >
                      {closingId === row.id ? "Closing..." : "Solve"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
