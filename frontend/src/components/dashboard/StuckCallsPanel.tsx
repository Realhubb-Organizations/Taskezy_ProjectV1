"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useDialog } from "@/components/ui/DialogProvider";
import { apiListStuckCallAttempts, apiForceCompleteCallAttempt, ApiStuckCallAttempt } from "@/lib/apiClient";

/**
 * Admin/Manager-only rescue for an agent who can never resolve the
 * blocking call-feedback gate themselves (CallFeedbackGate.tsx) — bad
 * network, or every nearby time slot conflicting with another lead (the
 * 5-minute scheduling guard). The gate is deliberately unclosable and
 * survives a force-quit/relaunch (the PENDING_FEEDBACK row is checked
 * from the server on every app launch), so without this there's no way
 * out for them short of someone editing the database directly. Renders
 * nothing when nobody's stuck — zero clutter on a normal day.
 *
 * Only popups open for SHOW_AFTER_MINUTES or more are listed: every call
 * opens one, and an agent filling it in right after a call isn't stuck.
 * Refreshes every minute, so finished popups drop off and newly stuck ones
 * appear without a reload. (Settings → StuckCallsButton still lists all.)
 */
const SHOW_AFTER_MINUTES = 10;
const REFRESH_MS = 60_000;
const minutesOpen = (createdAt: string) => Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
export default function StuckCallsPanel() {
  const { currentUser } = useApp();
  const { confirm, toast } = useDialog();
  const canRescue = currentUser?.role === "ADMIN" || currentUser?.role_type === "Manager";
  const [rows, setRows] = useState<ApiStuckCallAttempt[]>([]);
  const [closingId, setClosingId] = useState<string | null>(null);

  useEffect(() => {
    if (!canRescue) return;
    const load = () => apiListStuckCallAttempts().then(all => setRows(all.filter(r => minutesOpen(r.created_at) >= SHOW_AFTER_MINUTES))).catch(() => {});
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRescue]);

  if (!canRescue || rows.length === 0) return null;

  const timeStuck = (createdAt: string) => {
    const minutes = minutesOpen(createdAt);
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };

  const forceClose = async (row: ApiStuckCallAttempt) => {
    const ok = await confirm({
      title: "Force-close this call?",
      message: `${row.caller_name} has been stuck on "${row.lead_name ?? "a lead"}" for ${timeStuck(row.created_at)}. This frees their app. The feedback stays pending on this lead, and they'll have to fill it before working on the lead again.`,
      confirmLabel: "Force Close",
      danger: true
    });
    if (!ok) return;
    setClosingId(row.id);
    try {
      await apiForceCompleteCallAttempt(row.id);
      setRows(prev => prev.filter(r => r.id !== row.id));
      toast(`Freed ${row.caller_name}. The feedback is now pending on "${row.lead_name ?? "the lead"}".`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not force-close this call.", "error");
    } finally {
      setClosingId(null);
    }
  };

  return (
    <div className="glass-card p-4 rounded-2xl border border-amber-200 bg-amber-50/60 space-y-3 animate-fade-in">
      <div className="flex items-center gap-2 text-amber-800">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <h3 className="text-sm font-bold">{rows.length} agent{rows.length === 1 ? "" : "s"} stuck on a call-feedback popup</h3>
      </div>
      <div className="space-y-2">
        {rows.map(row => (
          <div key={row.id} className="flex items-center justify-between gap-3 bg-white rounded-xl border border-amber-100 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">{row.caller_name} · {row.lead_name ?? "Unknown lead"}</p>
              <p className="text-[11px] text-slate-500">{row.channel === "WHATSAPP" ? "WhatsApp" : "Call"} · stuck for {timeStuck(row.created_at)}</p>
            </div>
            <button
              onClick={() => forceClose(row)}
              disabled={closingId === row.id}
              className="shrink-0 text-xs font-bold text-amber-700 hover:text-amber-900 border border-amber-300 rounded-lg px-3 py-1.5 disabled:opacity-60 transition-colors"
            >
              {closingId === row.id ? "Closing..." : "Force Close"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
