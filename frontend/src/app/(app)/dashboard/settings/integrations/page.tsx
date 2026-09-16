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
import { ChevronRight, CheckCircle, AlertTriangle, Info, Search, HelpCircle, ArrowRight, Users, TrendingUp, LayoutGrid, Calendar, RefreshCw, Clock, Zap, ExternalLink, Mail, Hash, IndianRupee, ShieldCheck, Edit } from "lucide-react";

type IntegrationKey = "meta" | "google";

const INTEGRATION_INFO: Record<IntegrationKey, { name: string; description: string; logo: string }> = {
  meta: {
    name: "Meta Ads",
    description: "Capture leads from Facebook & Instagram Lead Ads in real time via a webhook. Sync leads directly into your CRM and never miss an opportunity.",
    logo: "https://img.icons8.com/?size=100&id=wA5rN96FVDtq&format=png&color=000000"
  },
  google: {
    name: "Google Ads",
    description: "Sync campaign spend and leads from your Google Ads account (MCC supported).",
    logo: "https://img.icons8.com/?size=100&id=4hR4Ih04Je2t&format=png&color=000000"
  }
};

// The exact OAuth scopes this app requests when connecting Meta (see
// Taskezy-Server meta-client.ts getOAuthDialogUrl) — real and fixed, not a
// per-connection value, so shown once here rather than fabricated per Page.
// Mapped to short display labels (several raw scopes collapse to one chip)
// so they read the same as the design reference's "Lead Ads / Pages / Ads
// Read" pills, without inventing scopes the app doesn't actually request.
const META_RAW_SCOPES = ["pages_show_list", "pages_manage_metadata", "pages_read_engagement", "leads_retrieval", "ads_management", "ads_read", "business_management"];
const META_PERMISSION_LABELS: string[] = Array.from(new Set(META_RAW_SCOPES.map(scope => {
  if (scope.startsWith("pages_")) return "Pages";
  if (scope === "leads_retrieval") return "Lead Ads";
  if (scope.startsWith("ads_")) return "Ads Read";
  if (scope === "business_management") return "Business Management";
  return scope;
})));

// What actually happens to an inbound Meta lead — mirrors
// Taskezy-Server meta.lead-ingest.ts field-by-field, not invented.
const META_FIELD_MAPPING: { metaField: string; crmField: string }[] = [
  { metaField: "full_name (or first_name + last_name)", crmField: "Lead Name" },
  { metaField: "phone_number / phone", crmField: "Phone — required, lead is skipped without it" },
  { metaField: "email", crmField: "Email" },
  { metaField: "campaign_name (falls back to form_id, then \"Meta Lead Ads\")", crmField: "Campaign" },
  { metaField: "The connected Page the form was submitted on", crmField: "Source Page / Meta footprint" },
  { metaField: "Campaign name matched to a Property", crmField: "Property + auto-assigned Agent (Round Robin/Percentage); otherwise routed Unassigned to the connecting Admin" }
];

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

function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const statusPill = (active: boolean) => (
  <span className={`inline-flex items-center gap-1 text-[10px] font-bold border px-2 py-0.5 rounded-full shrink-0 ${
    active ? "bg-emerald-50 text-emerald-700 border-emerald-150" : "bg-slate-100 text-slate-450 border-slate-200"
  }`}>
    {active && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
    {active ? "Active" : "Inactive"}
  </span>
);

// A real percent-change stat card (icon + big number + vs-prior-period %) —
// same visual slot the reference fills with fabricated Sync Success
// Rate/Average Sync Time, which have no meaning for a real-time webhook
// integration (there's no batch "sync" to rate or time).
// A real trend line — points are actual daily counts, not decorative filler.
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const w = 64, h = 24;
  const coords = points.map((v, i) => `${(i / (points.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-16 shrink-0" preserveAspectRatio="none">
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-emerald-500" />
    </svg>
  );
}

function StatCard({ icon, label, value, changeLabel, trend }: { icon: React.ReactNode; label: string; value: string; changeLabel?: string; trend?: number[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400">{label}</p>
          <p className="text-lg font-black text-slate-900">{value}</p>
          {changeLabel && <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{changeLabel}</p>}
        </div>
      </div>
      {trend && <Sparkline points={trend} />}
    </div>
  );
}

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

const PAGE_TABLE_SIZE = 5;

function RealIntegrationDetail({ keyParam }: { keyParam: string | null }) {
  const key: IntegrationKey = keyParam === "google" ? "google" : "meta";
  const info = INTEGRATION_INFO[key];

  const { activeRole, users, leads } = useApp();
  const { adSpendRecords } = useApp();

  // --- Meta ---
  const [metaConnections, setMetaConnections] = useState<ApiMetaConnection[]>([]);
  const [metaConnectionsLoaded, setMetaConnectionsLoaded] = useState(false);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaBanner, setMetaBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pageSearch, setPageSearch] = useState("");
  const [pageTablePage, setPageTablePage] = useState(1);

  const loadMetaConnections = async () => {
    if (activeRole !== "ADMIN") {
      setMetaConnectionsLoaded(true);
      return;
    }
    try {
      setMetaConnections(await apiListMetaConnections());
    } catch (err) {
      console.warn("Could not load Meta connections:", err);
    } finally {
      setMetaConnectionsLoaded(true);
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
  const pageTableTotalPages = Math.max(1, Math.ceil(filteredMetaConnections.length / PAGE_TABLE_SIZE));
  const pagedMetaConnections = filteredMetaConnections.slice((pageTablePage - 1) * PAGE_TABLE_SIZE, pageTablePage * PAGE_TABLE_SIZE);
  useEffect(() => { setPageTablePage(1); }, [pageSearch]);

  // Real lead count per connected Page — matched by the same metaPageName
  // every ingested lead is stamped with (see meta.lead-ingest.ts), never
  // invented. "Last 30 Days" is a genuine rolling window over each lead's
  // real createdAtStr.
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const leadsForPageLast30Days = (pageName: string) => leads.filter(l =>
    l.metaPageName === pageName && l.createdAtStr && Date.now() - new Date(l.createdAtStr).getTime() <= THIRTY_DAYS_MS
  ).length;
  // Most recent real lead for a Page — the closest honest stand-in for a
  // per-page "last synced" (falls back to the connection's own created_at
  // if the Page hasn't produced a lead yet).
  const lastActivityForPage = (c: ApiMetaConnection) => {
    const pageLeads = leads.filter(l => l.metaPageName === c.page_name && l.createdAtStr);
    if (pageLeads.length === 0) return c.created_at;
    return pageLeads.map(l => l.createdAtStr!).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  };

  const metaLeadsAll = useMemo(() => leads.filter(l => !!l.metaPageName || l.source === "Meta Ads"), [leads]);
  const totalLeadsViaMeta = metaLeadsAll.length;

  const now = new Date();
  const isSameMonth = (iso: string | undefined, ref: Date) => {
    if (!iso) return false;
    const d = new Date(iso);
    return !isNaN(d.getTime()) && d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
  };
  const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const leadsThisMonth = metaLeadsAll.filter(l => isSameMonth(l.createdAtStr, now)).length;
  const leadsLastMonth = metaLeadsAll.filter(l => isSameMonth(l.createdAtStr, lastMonthRef)).length;
  const monthChangePct = leadsLastMonth > 0 ? Math.round(((leadsThisMonth - leadsLastMonth) / leadsLastMonth) * 100) : null;
  const avgLeadsPerPage = activeMetaConnections.length > 0 ? Math.round(totalLeadsViaMeta / activeMetaConnections.length) : 0;
  const newPagesThisMonth = activeMetaConnections.filter(c => isSameMonth(c.created_at, now)).length;
  // Real daily lead counts for the trailing 14 days — an actual trend line,
  // not a decorative filler curve.
  const dailyLeadTrend = useMemo(() => {
    const days: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const count = metaLeadsAll.filter(l => {
        if (!l.createdAtStr) return false;
        const d = new Date(l.createdAtStr);
        return !isNaN(d.getTime()) && d.toDateString() === day.toDateString();
      }).length;
      days.push(count);
    }
    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaLeadsAll]);

  const mostRecentMetaConnection = [...activeMetaConnections].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0];
  const connectedByUser = mostRecentMetaConnection ? users.find(u => u.id === mostRecentMetaConnection.connected_by) : undefined;
  const metaConnectedByName = connectedByUser?.name || mostRecentMetaConnection?.connected_by || null;
  const metaAdAccountId = activeMetaConnections.find(c => c.ad_account_id)?.ad_account_id;

  // --- Google ---
  const [googleAccounts, setGoogleAccounts] = useState<ApiGoogleAdsAccount[]>([]);
  const [googleAccountsLoaded, setGoogleAccountsLoaded] = useState(false);

  useEffect(() => {
    if (key !== "google" || activeRole !== "ADMIN") {
      setGoogleAccountsLoaded(true);
      return;
    }
    apiListGoogleAdsAccounts()
      .then(setGoogleAccounts)
      .catch(err => console.warn("Could not load Google Ads accounts:", err))
      .finally(() => setGoogleAccountsLoaded(true));
  }, [key, activeRole]);

  const dataLoaded = key === "meta" ? metaConnectionsLoaded : googleAccountsLoaded;

  const activeGoogleAccounts = googleAccounts.filter(a => a.status === "ACTIVE");
  const filteredGoogleAccounts = activeGoogleAccounts.filter(a =>
    !pageSearch.trim() || a.name.toLowerCase().includes(pageSearch.trim().toLowerCase())
  );

  // Real synced spend/leads per account — from the same ad_spend_records the
  // Reports/Campaigns pages already read, never invented.
  const spendForAccount = (accountName: string) => {
    const rows = adSpendRecords.filter(r => r.platform === "Google" && r.accountName === accountName);
    return { spend: rows.reduce((sum, r) => sum + r.spend, 0) };
  };
  const totalGoogleSpend = useMemo(
    () => adSpendRecords.filter(r => r.platform === "Google").reduce((sum, r) => sum + r.spend, 0),
    [adSpendRecords]
  );

  type MetaTab = "overview" | "pages" | "mapping" | "webhooks" | "sync" | "settings";
  type GoogleTab = "overview" | "accounts";
  const [metaTab, setMetaTab] = useState<MetaTab>("overview");
  const [googleTab, setGoogleTab] = useState<GoogleTab>("overview");
  const tab = key === "meta" ? metaTab : googleTab;

  const active = key === "meta" ? activeMetaConnections.length > 0 : activeGoogleAccounts.length > 0;
  const connectedCount = key === "meta" ? activeMetaConnections.length : activeGoogleAccounts.length;
  // Most recent connection's created_at, across whichever platform is
  // active — the same real timestamp the Connected Apps card labels
  // "Last synced" (there's no separate sync-log table for a true one).
  const lastSyncedAt = [...(key === "meta" ? activeMetaConnections : activeGoogleAccounts)]
    .map(c => c.created_at)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  const webhookUrl = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    return `${base}/api/v1/meta/webhook`;
  }, []);

  const pagesTable = (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100">
        <h3 className="text-sm font-extrabold text-slate-900">
          {key === "meta" ? `Connected Pages (${activeMetaConnections.length})` : `Connected Accounts (${activeGoogleAccounts.length})`}
        </h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={pageSearch}
              onChange={(e) => setPageSearch(e.target.value)}
              placeholder={key === "meta" ? "Search pages..." : "Search accounts..."}
              className="bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-700 w-48 focus:outline-none focus:border-brand-500"
            />
          </div>
          {key === "meta" && (
            <button
              onClick={handleConnectMeta}
              disabled={metaLoading}
              className="inline-flex items-center gap-1.5 bg-[#0B1E6E] hover:bg-[#081650] text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
            >
              {metaLoading ? "Redirecting…" : "Connect Another Page"}
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 text-[10px] uppercase font-extrabold text-slate-500">
              <th className="px-5 py-2.5">{key === "meta" ? "Page Name" : "Account Name"}</th>
              <th className="px-5 py-2.5">{key === "meta" ? "Page ID" : "Account ID"}</th>
              <th className="px-5 py-2.5">Status</th>
              <th className="px-5 py-2.5">{key === "meta" ? "Leads (Last 30 Days)" : "Spend Synced"}</th>
              <th className="px-5 py-2.5">{key === "meta" ? "Last Synced" : "Connected Since"}</th>
              {key === "meta" && <th className="px-5 py-2.5 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-semibold">
            {key === "meta" ? (
              pagedMetaConnections.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400 italic">No connected Pages{pageSearch ? " match your search" : " yet"}.</td></tr>
              ) : (
                pagedMetaConnections.map(c => (
                  <tr key={c.id}>
                    <td className="px-5 py-3 font-bold text-slate-800">{c.page_name}</td>
                    <td className="px-5 py-3 font-mono text-slate-500">{c.page_id}</td>
                    <td className="px-5 py-3">{statusPill(true)}</td>
                    <td className="px-5 py-3 text-slate-700">{leadsForPageLast30Days(c.page_name)}</td>
                    <td className="px-5 py-3 text-slate-500">{formatDateTime(lastActivityForPage(c))}</td>
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
      {key === "meta" && filteredMetaConnections.length > PAGE_TABLE_SIZE && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
          <span className="text-[11px] text-slate-400 font-semibold">
            {filteredMetaConnections.length} Page{filteredMetaConnections.length === 1 ? "" : "s"} total
          </span>
          <div className="flex items-center gap-1">
            {Array.from({ length: pageTableTotalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPageTablePage(p)}
                className={`h-6 w-6 rounded-lg text-[11px] font-bold ${p === pageTablePage ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const statCards = key === "meta" && (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard
        icon={<Users className="h-4.5 w-4.5" />}
        label="Leads This Month"
        value={String(leadsThisMonth)}
        changeLabel={monthChangePct === null ? undefined : `${monthChangePct >= 0 ? "↑" : "↓"} ${Math.abs(monthChangePct)}% vs last month`}
        trend={dailyLeadTrend}
      />
      <StatCard icon={<TrendingUp className="h-4.5 w-4.5" />} label="Avg Leads / Page" value={String(avgLeadsPerPage)} />
      <StatCard icon={<LayoutGrid className="h-4.5 w-4.5" />} label="New Pages This Month" value={String(newPagesThisMonth)} />
    </div>
  );

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
      ) : !dataLoaded ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 animate-pulse space-y-3">
          <div className="h-4 w-40 bg-slate-200 rounded" />
          <div className="h-3 w-72 bg-slate-200 rounded" />
        </div>
      ) : (
        <>
          {/* Banner */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50 px-6 py-5 flex items-center gap-5 flex-wrap">
            <div className="h-14 w-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center p-2.5 shrink-0">
              <img src={info.logo} alt={info.name} className="h-full w-full object-contain" />
            </div>
            <div className="flex-1 min-w-[240px]">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-extrabold text-slate-900">{info.name}</h2>
                {statusPill(active)}
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-lg">{info.description}</p>
            </div>
            {key === "meta" && (
              <div className="hidden md:flex items-center -space-x-3 shrink-0">
                <div className="h-11 w-11 rounded-2xl shadow-md flex items-center justify-center -rotate-6 overflow-hidden">
                  <svg viewBox="0 0 24 24" className="h-full w-full" aria-label="Instagram">
                    <defs>
                      <linearGradient id="ig-grad" x1="0" y1="1" x2="1" y2="0">
                        <stop offset="0%" stopColor="#FEDA75" />
                        <stop offset="30%" stopColor="#FA7E1E" />
                        <stop offset="60%" stopColor="#D62976" />
                        <stop offset="100%" stopColor="#962FBF" />
                      </linearGradient>
                    </defs>
                    <rect width="24" height="24" fill="url(#ig-grad)" />
                    <rect x="6" y="6" width="12" height="12" rx="3.5" fill="none" stroke="white" strokeWidth="1.6" />
                    <circle cx="12" cy="12" r="3.2" fill="none" stroke="white" strokeWidth="1.6" />
                    <circle cx="17" cy="7" r="1.1" fill="white" />
                  </svg>
                </div>
                <div className="h-11 w-11 rounded-2xl shadow-md flex items-center justify-center rotate-3 -translate-y-1 overflow-hidden">
                  <svg viewBox="0 0 24 24" className="h-full w-full" aria-label="Facebook">
                    <rect width="24" height="24" fill="#1877F2" />
                    <path d="M15.5 8.5h1.5V6.1c-.26-.03-1.15-.1-2.19-.1-2.17 0-3.66 1.32-3.66 3.75v2.1H8.9v2.7h2.25V19h2.79v-6.45h2.16l.34-2.7h-2.5V10c0-.78.21-1.5 1.56-1.5z" fill="white" />
                  </svg>
                </div>
              </div>
            )}
            <div className="flex items-center gap-5 pl-2 border-l border-slate-200/80">
              <div className="text-center px-1">
                <p className="text-xl font-black text-slate-900">{connectedCount}</p>
                <p className="text-[10px] text-slate-500 font-bold whitespace-nowrap">{key === "meta" ? "Pages Connected" : "Accounts Connected"}</p>
              </div>
              <div className="text-center px-1 border-l border-slate-200/80 pl-5">
                <p className="text-xl font-black text-slate-900">{key === "meta" ? totalLeadsViaMeta : `₹${totalGoogleSpend.toLocaleString("en-IN")}`}</p>
                <p className="text-[10px] text-slate-500 font-bold whitespace-nowrap">{key === "meta" ? "Total Leads" : "Total Spend Synced"}</p>
              </div>
            </div>
            {active && lastSyncedAt && (
              <div className="w-full flex justify-end -mt-1">
                <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Last synced {formatDateTime(lastSyncedAt)}
                </p>
              </div>
            )}
          </div>

          {/* Tabs — underline style */}
          <div className="border-b border-slate-200 overflow-x-auto">
            <div className="flex gap-6 text-xs font-bold text-slate-500 min-w-max">
              {key === "meta"
                ? (["overview", "pages", "mapping", "webhooks", "sync", "settings"] as MetaTab[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setMetaTab(t)}
                    className={`pb-3 border-b-2 transition-all whitespace-nowrap ${
                      metaTab === t ? "border-brand-500 text-brand-700 font-black" : "border-transparent hover:text-slate-800"
                    }`}
                  >
                    {{ overview: "Overview", pages: "Connected Pages", mapping: "Lead Mapping", webhooks: "Webhooks", sync: "Sync History", settings: "Settings" }[t]}
                  </button>
                ))
                : (["overview", "accounts"] as GoogleTab[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setGoogleTab(t)}
                    className={`pb-3 border-b-2 transition-all whitespace-nowrap ${
                      googleTab === t ? "border-brand-500 text-brand-700 font-black" : "border-transparent hover:text-slate-800"
                    }`}
                  >
                    {t === "overview" ? "Overview" : "Connected Accounts"}
                  </button>
                ))}
            </div>
          </div>

          {tab === "overview" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
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
                    active ? (
                      <>
                        <button
                          onClick={() => {
                            if (!confirm(activeMetaConnections.length === 1
                              ? `Disconnect "${activeMetaConnections[0].page_name}"? New leads from this Page will stop arriving until you reconnect it.`
                              : `Disconnect all ${activeMetaConnections.length} connected Pages? New leads will stop arriving from every one of them until you reconnect.`)) return;
                            Promise.all(activeMetaConnections.map(c => apiDisconnectMeta(c.id))).then(loadMetaConnections);
                          }}
                          className="w-full px-3.5 py-2 rounded-lg text-xs font-bold border bg-red-50 border-red-200 text-red-700 hover:bg-red-100 transition-all"
                        >
                          Disconnect
                        </button>
                        <div className="space-y-2.5 text-xs pt-1">
                          <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" /><span className="text-slate-400 font-semibold">Connected Since</span></div>
                          <p className="font-bold text-slate-700 -mt-1.5 pl-5.5">{formatDate(mostRecentMetaConnection?.created_at)}</p>
                          <div className="flex items-center gap-2"><RefreshCw className="h-3.5 w-3.5 text-slate-400 shrink-0" /><span className="text-slate-400 font-semibold">Last Synced</span></div>
                          <p className="font-bold text-slate-700 -mt-1.5 pl-5.5">{formatDateTime(lastSyncedAt)}</p>
                          <div className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" /><span className="text-slate-400 font-semibold">Next Sync</span></div>
                          {/* Meta delivers leads via a real-time webhook, not a
                              polling job — there's no "next run" to count down
                              to, so this says that honestly instead of a fake
                              countdown that would misrepresent how leads
                              actually arrive. */}
                          <p className="font-bold text-slate-700 -mt-1.5 pl-5.5">Real-time — no wait</p>
                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-slate-400 shrink-0" /><span className="text-slate-400 font-semibold">Auto Sync</span></div>
                            <span className="relative inline-flex h-5 w-9 rounded-full bg-brand-600 shrink-0" title="Always on for a real-time integration">
                              <span className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-white" />
                            </span>
                          </div>
                          <p className="text-slate-400 -mt-1.5">New leads are delivered instantly — always on, can&apos;t be turned off for a webhook integration.</p>
                        </div>
                      </>
                    ) : (
                      <button
                        onClick={handleConnectMeta}
                        disabled={metaLoading}
                        className="w-full px-3.5 py-2 rounded-lg text-xs font-bold border bg-brand-50 border-brand-200 text-brand-700 hover:bg-brand-700 hover:text-white transition-all disabled:opacity-50"
                      >
                        {metaLoading ? "Redirecting…" : "Connect Meta Ads"}
                      </button>
                    )
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">New accounts linked under the MCC appear here automatically — no manual connect action needed.</p>
                  )}
                  <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 flex items-start gap-2.5">
                    <HelpCircle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-[11px] font-bold text-slate-700">Need Help?</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Follow our step-by-step guide to set up {info.name} integration.</p>
                      <button
                        onClick={() => alert("A written setup guide isn't published yet — use Contact Support in the sidebar and we'll walk you through it.")}
                        className="mt-2 inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        View Setup Guide <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-slate-900">Account Information</h3>
                    {key === "meta" && active && (
                      <button
                        onClick={handleConnectMeta}
                        className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                        title="Re-run Meta login to connect a different account"
                      >
                        <Edit className="h-3 w-3" /> Edit Connection
                      </button>
                    )}
                  </div>
                  {key === "meta" ? (
                    active ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-4 text-xs">
                        <div>
                          <span className="text-slate-400 font-semibold flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Account Name</span>
                          <p className="font-bold text-slate-800 mt-1">{metaConnectedByName || "—"}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</span>
                          <p className="font-bold text-slate-800 mt-1 truncate">{connectedByUser?.email || "—"}</p>
                        </div>
                        <div>
                          {/* This CRM only ever operates in one region — every
                              date/currency in the app already formats as
                              en-IN/₹ — so this is a fixed app-wide default,
                              not a value fetched per Meta account (Meta
                              doesn't return one for a Page connection). */}
                          <span className="text-slate-400 font-semibold flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Time Zone</span>
                          <p className="font-bold text-slate-800 mt-1">Asia/Kolkata (GMT +05:30)</p>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold flex items-center gap-1.5"><Hash className="h-3.5 w-3.5" /> Account ID</span>
                          <p className="font-mono font-bold text-slate-800 mt-1">{metaAdAccountId || "—"}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold flex items-center gap-1.5"><IndianRupee className="h-3.5 w-3.5" /> Currency</span>
                          <p className="font-bold text-slate-800 mt-1">INR (₹)</p>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Permissions</span>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {META_PERMISSION_LABELS.map(p => (
                              <span key={p} className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{p}</span>
                            ))}
                          </div>
                        </div>
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

              {pagesTable}
              {statCards}
            </div>
          )}

          {tab === "pages" && key === "meta" && pagesTable}
          {tab === "accounts" && key === "google" && pagesTable}

          {tab === "mapping" && key === "meta" && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <h3 className="text-sm font-extrabold text-slate-900">Lead Mapping</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">How an inbound Meta Lead Ads submission becomes a lead in this CRM — fixed by the integration, not configurable per Page.</p>
              </div>
              <div className="divide-y divide-slate-100">
                {META_FIELD_MAPPING.map((row, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 px-5 py-3 text-xs">
                    <span className="text-slate-500 font-semibold sm:w-[45%]">{row.metaField}</span>
                    <ArrowRight className="h-3 w-3 text-slate-300 hidden sm:block shrink-0" />
                    <span className="font-bold text-slate-800">{row.crmField}</span>
                  </div>
                ))}
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

          {tab === "sync" && key === "meta" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-extrabold text-slate-900">Sync History</h3>
              <p className="text-[11px] text-slate-500 max-w-lg">
                Meta Ads is real-time and event-driven, not a periodic batch sync — there&apos;s no sync run history to show. Every new lead lands in the Leads table the moment Meta sends it; check a lead&apos;s Activity Log there for exactly when it arrived.
              </p>
            </div>
          )}

          {tab === "settings" && key === "meta" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900">Connection Settings</h3>
              {active ? (
                <>
                  <p className="text-[11px] text-slate-500">Disconnecting stops new leads from every connected Page below from arriving until you reconnect.</p>
                  <div className="space-y-1.5">
                    {activeMetaConnections.map(c => (
                      <div key={c.id} className="flex items-center justify-between text-xs bg-slate-50 border border-slate-150 rounded-lg px-3 py-2">
                        <span className="font-bold text-slate-700">{c.page_name}</span>
                        <button onClick={() => handleDisconnectMeta(c.id, c.page_name)} className="text-red-600 hover:text-red-700 font-bold">Disconnect</button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-slate-400 italic">Nothing to configure until a Page is connected.</p>
              )}
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
