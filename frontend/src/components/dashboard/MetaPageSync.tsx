"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  apiGetMetaPageStatuses,
  type ApiMetaPageStatus,
  type ApiMetaPageStatuses,
  type ApiMetaSyncResult
} from "@/lib/apiClient";

/**
 * Settings → Meta Ads: the Pages that aren't connected, the "Connection lost"
 * pill and the Sync result text. The Sync itself runs on the server with the
 * Facebook logins Taskezy already holds (meta.pageSync.ts).
 */

/** Live Page states from Meta. Slow (a few seconds), so loaded separately from the connection list. */
export function useMetaPageStatuses(enabled: boolean) {
  const [statuses, setStatuses] = useState<ApiMetaPageStatuses | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setStatuses(await apiGetMetaPageStatuses());
      setFailed(false);
    } catch (err) {
      setFailed(true);
      console.warn("Could not check Meta Pages:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  return { statuses, loading, failed, reload };
}

const listNames = (names: string[]) => `${names.slice(0, 5).join(", ")}${names.length > 5 ? ` and ${names.length - 5} more` : ""}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function describeSyncResult(r: ApiMetaSyncResult): { kind: "success" | "error"; text: string } {
  const parts: string[] = [];
  if (r.connected.length) parts.push(`Connected ${plural(r.connected.length, "Page")}: ${listNames(r.connected)}.`);
  if (r.adAccountsAdded) parts.push(`Added ${plural(r.adAccountsAdded, "new ad account")}.`);
  if (r.failed.length) {
    parts.push(`Couldn't connect: ${listNames(r.failed)}. This usually means the Facebook account needs full access to ${r.failed.length === 1 ? "that Page" : "those Pages"}.`);
  }
  if (r.loginErrors) {
    parts.push(`${plural(r.loginErrors, "saved Facebook login")} couldn't be read (often an expired login), so some Pages may be missing. Use "Connect Another Page" to sign in again.`);
  }
  if (!parts.length) parts.push("Everything the saved Facebook logins manage is already connected.");
  return { kind: r.failed.length || r.loginErrors ? "error" : "success", text: parts.join(" ") };
}

export function ConnectionLostPill({ page }: { page: ApiMetaPageStatus }) {
  return (
    <span
      title={page.canSync
        ? "Meta no longer accepts this Page's saved connection. Sync now repairs it."
        : "Meta no longer accepts this Page's saved connection, and no saved Facebook login can see it. Reconnect with a Facebook account that manages this Page."}
      className="inline-flex items-center gap-1 text-[10px] font-bold border px-2 py-0.5 rounded-full shrink-0 bg-red-50 text-red-700 border-red-150"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Connection lost
    </span>
  );
}

interface NotConnectedPagesProps {
  pages: ApiMetaPageStatus[];
  loading: boolean;
  failed: boolean;
  loginErrors: number;
  busy: boolean;
  onRetry: () => void;
  onConnect: (pageId: string) => void;
  onConnectWithFacebook: () => void;
}

export function NotConnectedPages({ pages, loading, failed, loginErrors, busy, onRetry, onConnect, onConnectWithFacebook }: NotConnectedPagesProps) {
  const rows = pages.filter(p => p.state === "ready" || p.state === "disconnected");
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <h3 className="ui-section-title">Not Connected{loading ? "" : ` (${rows.length})`}</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Facebook Pages that don&apos;t send leads to Taskezy. Pages someone disconnected on purpose stay off until you reconnect them.
        </p>
      </div>
      {failed ? (
        <div className="px-5 py-4 text-xs text-amber-700 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" /> Couldn&apos;t check your Pages with Meta right now.
          <button onClick={onRetry} className="font-bold hover:underline inline-flex items-center gap-1"><RefreshCw className="h-3 w-3" /> Try again</button>
        </div>
      ) : loading && rows.length === 0 ? (
        <p className="px-5 py-4 text-xs text-slate-400 italic">Checking your Facebook Pages with Meta…</p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-4 text-xs text-slate-400 italic">Every Page the saved Facebook logins manage is connected.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase font-extrabold text-slate-500">
                <th className="px-5 py-2.5">Page Name</th>
                <th className="px-5 py-2.5">Page ID</th>
                <th className="px-5 py-2.5">Status</th>
                <th className="px-5 py-2.5">Managed By</th>
                <th className="px-5 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold">
              {rows.map(p => (
                <tr key={p.pageId}>
                  <td className="px-5 py-3 font-bold text-slate-800">{p.name}</td>
                  <td className="px-5 py-3 font-mono text-slate-500">{p.pageId}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex text-[10px] font-bold border px-2 py-0.5 rounded-full ${
                      p.state === "ready" ? "bg-amber-50 text-amber-700 border-amber-150" : "bg-slate-100 text-slate-500 border-slate-200"
                    }`}>
                      {p.state === "ready" ? "Ready to connect" : "Disconnected by an admin"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{p.managedBy.length ? p.managedBy.join(", ") : "No saved Facebook login"}</td>
                  <td className="px-5 py-3 text-right">
                    {p.canSync ? (
                      <button onClick={() => onConnect(p.pageId)} disabled={busy} className="ui-btn ui-btn-secondary disabled:opacity-50">
                        {p.state === "ready" ? "Connect" : "Reconnect"}
                      </button>
                    ) : (
                      <button onClick={onConnectWithFacebook} disabled={busy} className="text-[11px] font-bold text-brand-700 hover:underline disabled:opacity-50">
                        Connect with Facebook
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {loginErrors > 0 && !failed && (
        <p className="px-5 py-2.5 text-[11px] text-amber-700 border-t border-slate-100">
          {plural(loginErrors, "saved Facebook login")} couldn&apos;t be read, so some Pages may be missing here.
        </p>
      )}
    </div>
  );
}
