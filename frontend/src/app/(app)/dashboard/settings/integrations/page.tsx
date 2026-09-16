"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/context/AppContext";
import {
  apiListMetaConnections,
  apiGetMetaConnectUrl,
  apiDisconnectMeta,
  ApiMetaConnection,
  apiListGoogleAdsAccounts,
  ApiGoogleAdsAccount
} from "@/lib/apiClient";
import { ChevronRight, CheckCircle, AlertTriangle, Info, Search } from "lucide-react";

type IntegrationKey = "meta" | "google";

const INTEGRATION_INFO: Record<IntegrationKey, { name: string; description: string; logo: string }> = {
  meta: {
    name: "Meta Ads",
    description: "Capture leads from Facebook & Instagram Lead Ads in real time via a webhook.",
    logo: "https://img.icons8.com/?size=100&id=wA5rN96FVDtq&format=png&color=000000"
  },
  google: {
    name: "Google Ads",
    description: "Sync campaign spend and leads from your Google Ads account (MCC supported).",
    logo: "https://img.icons8.com/?size=100&id=4hR4Ih04Je2t&format=png&color=000000"
  }
};

// The still-unwired Connected Apps placeholders (99acres, LinkedIn, etc.) —
// their "View Details" link lands here too rather than skipping it, but with
// an honest "no backend yet" message instead of borrowing Meta/Google's data.
const PLACEHOLDER_DESCRIPTIONS: Record<string, string> = {
  "99acres": "Capture leads from 99acres property listings automatically.",
  LinkedIn: "Capture B2B leads from LinkedIn Lead Gen Forms.",
  "Housing.com": "Capture leads from Housing.com property listings.",
  MagicBricks: "Capture leads from MagicBricks property listings.",
  NoBroker: "Capture leads from NoBroker property listings."
};

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const statusPill = (active: boolean) => (
  <span className={`inline-flex items-center gap-1 text-[10px] font-bold border px-2 py-0.5 rounded-full shrink-0 ${
    active ? "bg-emerald-50 text-emerald-700 border-emerald-150" : "bg-slate-100 text-slate-450 border-slate-200"
  }`}>
    {active && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
    {active ? "Active" : "Inactive"}
  </span>
);

function PlaceholderDetail({ name }: { name: string }) {
  const description = PLACEHOLDER_DESCRIPTIONS[name] || `Capture leads from ${name}.`;
  return (
    <div className="space-y-5 pb-12">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <Link href="/dashboard/settings" className="hover:text-brand-700">Settings</Link>
        <ChevronRight className="h-3 w-3 text-slate-300" />
        <Link href="/dashboard/settings" className="hover:text-brand-700">Connected Apps</Link>
        <ChevronRight className="h-3 w-3 text-slate-300" />
        <span className="text-slate-800 font-extrabold">{name}</span>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-extrabold text-slate-900">{name}</h2>
          {statusPill(false)}
        </div>
        <p className="text-xs text-slate-500 max-w-md">{description}</p>
        <div className="bg-slate-50 border border-slate-150 rounded-xl px-4 py-3 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500">
            This integration isn&apos;t connected to a real backend yet — there&apos;s nothing to show here beyond what&apos;s on the Connected Apps card.
          </p>
        </div>
      </div>
    </div>
  );
}

// Picks which detail view to mount based on ?app= — a plain branch here (not
// an early return inside the real-integration view) so React always calls
// that view's hooks in the same order; swapping between this and
// PlaceholderDetail just mounts/unmounts a different component, which is
// safe, versus an early return partway through one component's hooks.
function IntegrationDetailContent() {
  const searchParams = useSearchParams();
  const keyParam = searchParams.get("app");
  const isRealIntegration = keyParam === "meta" || keyParam === "google" || !keyParam;
  if (!isRealIntegration) {
    return <PlaceholderDetail name={keyParam!} />;
  }
  return <RealIntegrationDetail keyParam={keyParam} />;
}

function RealIntegrationDetail({ keyParam }: { keyParam: string | null }) {
  const key: IntegrationKey = keyParam === "google" ? "google" : "meta";
  const info = INTEGRATION_INFO[key];

  const { activeRole, users, leads, adSpendRecords } = useApp();

  // --- Meta ---
  const [metaConnections, setMetaConnections] = useState<ApiMetaConnection[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaBanner, setMetaBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pageSearch, setPageSearch] = useState("");

  const loadMetaConnections = async () => {
    if (activeRole !== "ADMIN") return;
    try {
      setMetaConnections(await apiListMetaConnections());
    } catch (err) {
      console.warn("Could not load Meta connections:", err);
    }
  };

  useEffect(() => {
    if (key === "meta") loadMetaConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, activeRole]);

  const handleConnectMeta = async () => {
    setMetaLoading(true);
    try {
      const { url } = await apiGetMetaConnectUrl();
      window.location.href = url;
    } catch (err) {
      setMetaBanner({ kind: "error", text: "Could not start the Meta connection — please try again." });
      console.warn("Meta connect failed:", err);
      setMetaLoading(false);
    }
  };

  const handleDisconnectMeta = async (connectionId: string, pageName: string) => {
    if (!confirm(`Disconnect "${pageName}"? New leads from this Page will stop arriving until you reconnect it.`)) return;
    try {
      await apiDisconnectMeta(connectionId);
      await loadMetaConnections();
    } catch (err) {
      alert("Could not disconnect this Page. Please try again.");
      console.warn("Meta disconnect failed:", err);
    }
  };

  const activeMetaConnections = metaConnections.filter(c => c.status === "ACTIVE");
  const filteredMetaConnections = activeMetaConnections.filter(c =>
    !pageSearch.trim() || c.page_name.toLowerCase().includes(pageSearch.trim().toLowerCase())
  );

  // Real lead count per connected Page — matched by the same metaPageName
  // every ingested lead is stamped with (see meta.lead-ingest.ts), never
  // invented.
  const leadsForPage = (pageName: string) => leads.filter(l => l.metaPageName === pageName).length;
  const totalLeadsViaMeta = useMemo(
    () => leads.filter(l => !!l.metaPageName || l.source === "Meta Ads").length,
    [leads]
  );
  const mostRecentMetaConnection = [...activeMetaConnections].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0];
  const metaConnectedByName = mostRecentMetaConnection
    ? users.find(u => u.id === mostRecentMetaConnection.connected_by)?.name || mostRecentMetaConnection.connected_by
    : null;
  const metaAdAccountId = activeMetaConnections.find(c => c.ad_account_id)?.ad_account_id;

  // --- Google ---
  const [googleAccounts, setGoogleAccounts] = useState<ApiGoogleAdsAccount[]>([]);

  useEffect(() => {
    if (key !== "google" || activeRole !== "ADMIN") return;
    apiListGoogleAdsAccounts()
      .then(setGoogleAccounts)
      .catch(err => console.warn("Could not load Google Ads accounts:", err));
  }, [key, activeRole]);

  const activeGoogleAccounts = googleAccounts.filter(a => a.status === "ACTIVE");
  const filteredGoogleAccounts = activeGoogleAccounts.filter(a =>
    !pageSearch.trim() || a.name.toLowerCase().includes(pageSearch.trim().toLowerCase())
  );

  // Real synced spend/leads per account — from the same ad_spend_records the
  // Reports/Campaigns pages already read, never invented.
  const spendForAccount = (accountName: string) => {
    const rows = adSpendRecords.filter(r => r.platform === "Google" && r.accountName === accountName);
    return {
      spend: rows.reduce((sum, r) => sum + r.spend, 0),
      leadsGenerated: rows.reduce((sum, r) => sum + r.leadsGenerated, 0)
    };
  };
  const totalGoogleSpend = useMemo(
    () => adSpendRecords.filter(r => r.platform === "Google").reduce((sum, r) => sum + r.spend, 0),
    [adSpendRecords]
  );

  const [tab, setTab] = useState<"overview" | "connected" | "webhooks">("overview");
  const active = key === "meta" ? activeMetaConnections.length > 0 : activeGoogleAccounts.length > 0;
  const connectedCount = key === "meta" ? activeMetaConnections.length : activeGoogleAccounts.length;

  const webhookUrl = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    return `${base}/api/v1/meta/webhook`;
  }, []);

  return (
    <div className="space-y-5 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <Link href="/dashboard/settings" className="hover:text-brand-700">Settings</Link>
        <ChevronRight className="h-3 w-3 text-slate-300" />
        <Link href="/dashboard/settings" className="hover:text-brand-700">Connected Apps</Link>
        <ChevronRight className="h-3 w-3 text-slate-300" />
        <span className="text-slate-800 font-extrabold">{info.name}</span>
      </div>

      {metaBanner && (
        <div className={`p-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 shadow-sm ${
          metaBanner.kind === "success" ? "bg-emerald-50 border-emerald-105 text-emerald-700" : "bg-red-50 border-red-150 text-red-700"
        }`}>
          {metaBanner.kind === "success" ? <CheckCircle className="h-4.5 w-4.5" /> : <AlertTriangle className="h-4.5 w-4.5" />}
          <span>{metaBanner.text}</span>
        </div>
      )}

      {activeRole !== "ADMIN" ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-xs text-slate-500 italic">
          Only an Admin can view integration details.
        </div>
      ) : (
        <>
          {/* Banner */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50 px-6 py-5 flex items-center gap-5 flex-wrap">
            <div className="h-14 w-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center p-2.5 shrink-0">
              <img src={info.logo} alt={info.name} className="h-full w-full object-contain" />
            </div>
            <div className="flex-1 min-w-[220px]">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-extrabold text-slate-900">{info.name}</h2>
                {statusPill(active)}
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-md">{info.description}</p>
            </div>
            <div className="flex items-center gap-6 pl-2">
              <div className="text-center">
                <p className="text-xl font-black text-slate-900">{connectedCount}</p>
                <p className="text-[10px] text-slate-500 font-bold whitespace-nowrap">{key === "meta" ? "Pages Connected" : "Accounts Connected"}</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-black text-slate-900">{key === "meta" ? totalLeadsViaMeta : `₹${totalGoogleSpend.toLocaleString("en-IN")}`}</p>
                <p className="text-[10px] text-slate-500 font-bold whitespace-nowrap">{key === "meta" ? "Total Leads" : "Total Spend Synced"}</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm w-fit">
            <div className="flex gap-1">
              {(["overview", "connected", ...(key === "meta" ? ["webhooks" as const] : [])] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                    tab === t ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  {t === "overview" ? "Overview" : t === "connected" ? (key === "meta" ? "Connected Pages" : "Connected Accounts") : "Webhooks"}
                </button>
              ))}
            </div>
          </div>

          {tab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-extrabold text-slate-900">Integration Status</h3>
                <div className={`rounded-xl px-3.5 py-3 border ${active ? "bg-emerald-50 border-emerald-100" : "bg-slate-50 border-slate-150"}`}>
                  <p className={`text-xs font-extrabold flex items-center gap-1.5 ${active ? "text-emerald-700" : "text-slate-600"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />
                    {active ? "Connected" : "Not Connected"}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {active
                      ? `Your ${info.name} account is connected and ${key === "meta" ? "capturing leads" : "syncing spend"}.`
                      : `Connect your ${info.name} account to start ${key === "meta" ? "capturing leads" : "syncing spend"}.`}
                  </p>
                </div>
                {key === "meta" ? (
                  <button
                    onClick={handleConnectMeta}
                    disabled={metaLoading}
                    className="w-full px-3.5 py-2 rounded-lg text-xs font-bold border bg-brand-50 border-brand-200 text-brand-700 hover:bg-brand-700 hover:text-white transition-all disabled:opacity-50"
                  >
                    {metaLoading ? "Redirecting…" : active ? "Connect Another Page" : "Connect Meta Ads"}
                  </button>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">New accounts linked under the MCC appear here automatically — no manual connect action needed.</p>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-extrabold text-slate-900">Account Information</h3>
                {key === "meta" ? (
                  active ? (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between"><span className="text-slate-400 font-semibold">Connected By</span><span className="font-bold text-slate-700">{metaConnectedByName || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400 font-semibold">Connected Since</span><span className="font-bold text-slate-700">{formatDate(mostRecentMetaConnection?.created_at)}</span></div>
                      {metaAdAccountId && (
                        <div className="flex justify-between"><span className="text-slate-400 font-semibold">Ad Account ID</span><span className="font-mono font-bold text-slate-700">{metaAdAccountId}</span></div>
                      )}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">Nothing to show until a Page is connected.</p>
                  )
                ) : active ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-slate-400 font-semibold">Accounts Linked</span><span className="font-bold text-slate-700">{activeGoogleAccounts.length}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400 font-semibold">First Linked</span><span className="font-bold text-slate-700">{formatDate([...activeGoogleAccounts].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0]?.created_at)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400 font-semibold">Total Spend Synced</span><span className="font-bold text-slate-700">₹{totalGoogleSpend.toLocaleString("en-IN")}</span></div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">Nothing to show until an account is linked.</p>
                )}
              </div>
            </div>
          )}

          {tab === "connected" && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <h3 className="text-sm font-extrabold text-slate-900">
                  {key === "meta" ? `Connected Pages (${activeMetaConnections.length})` : `Connected Accounts (${activeGoogleAccounts.length})`}
                </h3>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={pageSearch}
                    onChange={(e) => setPageSearch(e.target.value)}
                    placeholder={key === "meta" ? "Search pages..." : "Search accounts..."}
                    className="bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-700 w-48 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] uppercase font-extrabold text-slate-500">
                      <th className="px-5 py-2.5">{key === "meta" ? "Page Name" : "Account Name"}</th>
                      <th className="px-5 py-2.5">{key === "meta" ? "Page ID" : "Account ID"}</th>
                      <th className="px-5 py-2.5">Status</th>
                      <th className="px-5 py-2.5">{key === "meta" ? "Leads" : "Spend Synced"}</th>
                      <th className="px-5 py-2.5">Connected Since</th>
                      {key === "meta" && <th className="px-5 py-2.5 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold">
                    {key === "meta" ? (
                      filteredMetaConnections.length === 0 ? (
                        <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400 italic">No connected Pages{pageSearch ? " match your search" : " yet"}.</td></tr>
                      ) : (
                        filteredMetaConnections.map(c => (
                          <tr key={c.id}>
                            <td className="px-5 py-3 font-bold text-slate-800">{c.page_name}</td>
                            <td className="px-5 py-3 font-mono text-slate-500">{c.page_id}</td>
                            <td className="px-5 py-3">{statusPill(true)}</td>
                            <td className="px-5 py-3 text-slate-700">{leadsForPage(c.page_name)}</td>
                            <td className="px-5 py-3 text-slate-500">{formatDate(c.created_at)}</td>
                            <td className="px-5 py-3 text-right">
                              <button onClick={() => handleDisconnectMeta(c.id, c.page_name)} className="text-red-600 hover:text-red-700 font-bold">Disconnect</button>
                            </td>
                          </tr>
                        ))
                      )
                    ) : filteredGoogleAccounts.length === 0 ? (
                      <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400 italic">No connected accounts{pageSearch ? " match your search" : " yet"}.</td></tr>
                    ) : (
                      filteredGoogleAccounts.map(a => {
                        const { spend } = spendForAccount(a.name);
                        return (
                          <tr key={a.id}>
                            <td className="px-5 py-3 font-bold text-slate-800">{a.name}</td>
                            <td className="px-5 py-3 font-mono text-slate-500">{a.id}</td>
                            <td className="px-5 py-3">{statusPill(true)}</td>
                            <td className="px-5 py-3 text-slate-700">₹{spend.toLocaleString("en-IN")}</td>
                            <td className="px-5 py-3 text-slate-500">{formatDate(a.created_at)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === "webhooks" && key === "meta" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900">Webhook Endpoint</h3>
              <p className="text-[11px] text-slate-500">
                Meta delivers new Lead Ads submissions to this endpoint in real time — every connected Page above is subscribed to it automatically when connected, no manual setup needed.
              </p>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-150 rounded-lg px-3 py-2">
                <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <code className="text-[11px] font-mono text-slate-700 truncate">{webhookUrl}</code>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function IntegrationDetailPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh] flex items-center justify-center text-xs font-bold text-slate-400">Loading…</div>}>
      <IntegrationDetailContent />
    </Suspense>
  );
}
