"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp, User, Role } from "@/context/AppContext";
import { apiDisconnectMeta, apiGetMetaConnectUrl, apiListMetaConnections, ApiMetaConnection } from "@/lib/apiClient";
import {
  Settings,
  Plus,
  X,
  Edit,
  Eye,
  EyeOff,
  CheckCircle,
  AlertTriangle,
  Search,
  ShieldCheck,
  Wrench,
  Megaphone,
  Wallet,
  UserCog,
  Info,
  FileText,
  ScrollText,
  LogOut,
  TrendingUp
} from "lucide-react";

const TABS = ["Connected Apps", "Leads", "Manage Users", "About"] as const;
type Tab = (typeof TABS)[number];

const DEPT_BADGE: Record<string, string> = {
  SALES: "bg-blue-50 text-blue-700 border-blue-100",
  TECH: "bg-indigo-50 text-indigo-700 border-indigo-100",
  MARKETING: "bg-pink-50 text-pink-700 border-pink-100",
  FINANCE: "bg-emerald-50 text-emerald-700 border-emerald-100",
  ADMIN: "bg-violet-50 text-violet-700 border-violet-100"
};

function initialsFor(name: string): string {
  const parts = name.trim().split(" ").filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U";
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { users, leads, activeRole, logout, updateUserFields, addTeamMember, deleteTeamMember, refreshMetaConnectionStatus } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>("Connected Apps");

  // --- Connected Apps ---
  // Every entry other than Meta Ads is still a placeholder — no backend
  // integration exists for them yet, unlike Meta which is wired to the real
  // meta_connections table / OAuth flow below.
  const [integrations, setIntegrations] = useState([
    { name: "Google Ads", status: "Inactive", description: "Capture leads from Google Search & Display campaigns" },
    { name: "99acres", status: "Inactive", description: "Capture leads from 99acres property listings" },
    { name: "LinkedIn", status: "Inactive", description: "Capture B2B leads from LinkedIn Lead Gen Forms" },
    { name: "Housing.com", status: "Inactive", description: "Capture leads from Housing.com property listings" },
    { name: "MagicBricks", status: "Inactive", description: "Capture leads from MagicBricks property listings" },
    { name: "NoBroker", status: "Inactive", description: "Capture leads from NoBroker property listings" }
  ]);

  const handleToggleIntegration = (name: string) => {
    setIntegrations(prev => prev.map(item => {
      if (item.name === name) {
        return { ...item, status: item.status.includes("Active") ? "Inactive" : "Active" };
      }
      return item;
    }));
  };

  // --- Meta Ads: real OAuth connection ---
  const [metaConnections, setMetaConnections] = useState<ApiMetaConnection[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaBanner, setMetaBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const loadMetaConnections = async () => {
    if (activeRole !== "ADMIN") return;
    try {
      setMetaConnections(await apiListMetaConnections());
    } catch (err) {
      console.warn("Could not load Meta connections:", err);
    }
  };

  useEffect(() => {
    loadMetaConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRole]);

  // Handles the redirect back from /api/v1/meta/callback (?meta_connected=N or ?meta_error=...)
  useEffect(() => {
    const connected = searchParams.get("meta_connected");
    const error = searchParams.get("meta_error");
    if (connected) {
      setMetaBanner({ kind: "success", text: `Connected ${connected} Meta Page${connected === "1" ? "" : "s"} — new leads will start arriving in real time.` });
      loadMetaConnections();
      refreshMetaConnectionStatus();
      router.replace("/dashboard/settings");
    } else if (error) {
      const messages: Record<string, string> = {
        no_pages: "That Facebook account doesn't manage any Pages — connect an account that's an admin on at least one Page.",
        invalid_state: "The connection request expired or was tampered with — please try connecting again.",
        "1": "Something went wrong connecting to Meta — please try again."
      };
      setMetaBanner({ kind: "error", text: messages[error] || messages["1"] });
      router.replace("/dashboard/settings");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
      await refreshMetaConnectionStatus();
    } catch (err) {
      alert("Could not disconnect this Page. Please try again.");
      console.warn("Meta disconnect failed:", err);
    }
  };

  const activeMetaConnections = metaConnections.filter(c => c.status === "ACTIVE");

  // --- Leads source breakdown ---
  const leadSourceRows = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach(l => {
      const key = l.source || l.campaign || "Direct / Manual Entry";
      counts[key] = (counts[key] || 0) + 1;
    });
    const total = leads.length || 1;
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count, percent: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  // --- Manage Users ---
  const [searchQuery, setSearchQuery] = useState("");
  const [revealedUserId, setRevealedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [successMsg, setSuccessMsg] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [designation, setDesignation] = useState("");
  const [roleType, setRoleType] = useState<"Manager" | "Member">("Member");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [passwordHash, setPasswordHash] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [managerId, setManagerId] = useState<string>("");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addFirstName, setAddFirstName] = useState("");
  const [addLastName, setAddLastName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addDesignation, setAddDesignation] = useState("Sales Associate");
  const [addDepartment, setAddDepartment] = useState<"SALES" | "TECH" | "MARKETING" | "FINANCE">("SALES");
  const [addRoleType, setAddRoleType] = useState<"Manager" | "Member">("Member");
  const [addRole, setAddRole] = useState<Role>("AGENT");
  const [addPassword, setAddPassword] = useState("");
  const [addShowPassword, setAddShowPassword] = useState(false);
  const [addManagerId, setAddManagerId] = useState<string>("");

  // Only active MANAGER-role_type users are valid "Reports To" targets —
  // matches the server-side check in users.routes.ts.
  const managerOptions = useMemo(
    () => users.filter(u => u.role_type === "Manager" && u.status !== "INACTIVE"),
    [users]
  );

  const userCounts = useMemo(() => ({
    admin: users.filter(u => u.role === "ADMIN").length,
    managers: users.filter(u => u.role_type === "Manager" && u.role !== "ADMIN").length,
    it: users.filter(u => u.department === "TECH").length,
    marketing: users.filter(u => u.department === "MARKETING").length,
    finance: users.filter(u => u.department === "FINANCE" || u.role === "FINANCE").length
  }), [users]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.name.toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.phone_number || "").includes(q)
    );
  }, [users, searchQuery]);

  const handleEditClick = (user: User) => {
    setSelectedUser(user);
    setFirstName(user.first_name || user.name.split(" ")[0] || "");
    setLastName(user.last_name || user.name.split(" ")[1] || "");
    setDesignation(user.designation || "");
    setRoleType(user.role_type || "Member");
    setStatus(user.status || "ACTIVE");
    setPasswordHash(user.password_hash || user.tempPassword || "password123");
    setShowPassword(false);
    setManagerId(user.managerId || "");
  };

  const handleEditorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (passwordHash.length < 4) {
      alert("Password must be at least 4 characters.");
      return;
    }
    updateUserFields(selectedUser.id, firstName, lastName, passwordHash, designation, roleType, status, managerId || null);
    setSuccessMsg(`Successfully updated credentials and profile for ${firstName} ${lastName}.`);
    setSelectedUser(null);
    setTimeout(() => setSuccessMsg(""), 5000);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addFirstName || !addEmail || !addPassword) {
      alert("First name, email, and password are required.");
      return;
    }
    addTeamMember({
      name: `${addFirstName} ${addLastName}`.trim(),
      first_name: addFirstName,
      last_name: addLastName,
      email: addEmail,
      company_email: addEmail,
      phone_number: addPhone || "9876500000",
      role: addRole,
      passwordStatus: "ACTIVE",
      password_hash: addPassword,
      tempPassword: addPassword,
      designation: addDesignation,
      role_type: addRoleType,
      employment_type: "FULL TIME",
      department: addDepartment,
      managerId: addManagerId || undefined,
      status: "ACTIVE"
    });
    setSuccessMsg(`Successfully created account for ${addFirstName} ${addLastName}.`);
    setIsAddOpen(false);
    setAddFirstName("");
    setAddLastName("");
    setAddEmail("");
    setAddPhone("");
    setAddDesignation("Sales Associate");
    setAddDepartment("SALES");
    setAddRoleType("Member");
    setAddRole("AGENT");
    setAddPassword("");
    setAddShowPassword(false);
    setAddManagerId("");
    setTimeout(() => setSuccessMsg(""), 5000);
  };

  const handleSignOut = () => {
    if (confirm("Are you sure you want to sign out?")) {
      logout();
      router.push("/auth/login");
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
          <Settings className="h-5.5 w-5.5 text-brand-600" />
          Settings &amp; Configuration
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Connected ad portals, lead source telemetry, roster management, and account information.
        </p>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-105 text-xs text-emerald-700 font-bold flex items-center gap-2 shadow-sm animate-fade-in">
          <CheckCircle className="h-4.5 w-4.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {metaBanner && (
        <div className={`p-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 shadow-sm animate-fade-in ${
          metaBanner.kind === "success" ? "bg-emerald-50 border-emerald-105 text-emerald-700" : "bg-red-50 border-red-150 text-red-700"
        }`}>
          {metaBanner.kind === "success" ? <CheckCircle className="h-4.5 w-4.5" /> : <AlertTriangle className="h-4.5 w-4.5" />}
          <span>{metaBanner.text}</span>
        </div>
      )}

      {/* Tabs Menu */}
      <div className="flex border-b border-slate-200 gap-6 text-xs font-bold text-slate-500 mb-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`pb-3 border-b-2 transition-all ${
              activeTab === t ? "border-brand-500 text-brand-700 font-black" : "border-transparent hover:text-slate-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 1. Connected Apps */}
      {activeTab === "Connected Apps" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
          {/* Meta Ads — real OAuth connection, one card per connected Page */}
          <div className="glass-card p-5 rounded-2xl flex flex-col justify-between border border-slate-200 md:col-span-2 lg:col-span-1">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-slate-800">Meta Ads</h4>
                <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded-full ${
                  activeMetaConnections.length > 0
                    ? "bg-emerald-50 text-emerald-700 border-emerald-150"
                    : "bg-slate-100 text-slate-450 border-slate-200"
                }`}>
                  {activeMetaConnections.length > 0 ? `Active (${activeMetaConnections.length} Page${activeMetaConnections.length === 1 ? "" : "s"})` : "Inactive"}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                Capture leads from Facebook &amp; Instagram Lead Ads in real time via a webhook.
              </p>
              {activeMetaConnections.length > 0 && (
                <div className="pt-1 space-y-1">
                  {activeMetaConnections.map(c => (
                    <div key={c.id} className="flex items-center justify-between text-[10px] bg-slate-50 border border-slate-150 rounded-lg px-2 py-1.5">
                      <span className="font-bold text-slate-700 truncate">{c.page_name}</span>
                      {activeRole === "ADMIN" && (
                        <button
                          onClick={() => handleDisconnectMeta(c.id, c.page_name)}
                          className="text-red-600 hover:text-red-700 font-bold shrink-0 ml-2"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 flex justify-end">
              {activeRole === "ADMIN" ? (
                <button
                  onClick={handleConnectMeta}
                  disabled={metaLoading}
                  className="px-3 py-1 rounded text-[10px] font-bold border bg-brand-50 border-brand-200 text-brand-700 hover:bg-brand-700 hover:text-white transition-all disabled:opacity-50"
                >
                  {metaLoading ? "Redirecting…" : activeMetaConnections.length > 0 ? "Connect Another Page" : "Connect App"}
                </button>
              ) : (
                <span className="text-[10px] text-slate-400 italic">Only an Admin can manage this connection.</span>
              )}
            </div>
          </div>

          {integrations.map((item, idx) => (
            <div key={idx} className="glass-card p-5 rounded-2xl flex flex-col justify-between border border-slate-200">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-slate-800">{item.name}</h4>
                  <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded-full ${
                    item.status.includes("Active")
                      ? "bg-emerald-50 text-emerald-700 border-emerald-150"
                      : "bg-slate-100 text-slate-450 border-slate-200"
                  }`}>
                    {item.status}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">{item.description}</p>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={() => handleToggleIntegration(item.name)}
                  className={`px-3 py-1 rounded text-[10px] font-bold border transition-all ${
                    item.status.includes("Active")
                      ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                      : "bg-brand-50 border-brand-200 text-brand-700 hover:bg-brand-700 hover:text-white"
                  }`}
                >
                  {item.status.includes("Active") ? "Disconnect" : "Connect App"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. Leads: where our major leads come from */}
      {activeTab === "Leads" && (
        <div className="glass-card p-6 rounded-2xl space-y-5 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-slate-500" />
              Lead Source Breakdown
            </h3>
            <span className="text-[10px] text-slate-450 font-bold">{leads.length} total leads</span>
          </div>

          {leadSourceRows.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic py-6 text-center">No leads ingested yet.</p>
          ) : (
            <div className="space-y-3">
              {leadSourceRows.map(row => (
                <div key={row.name} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-650 font-bold">{row.name}</span>
                    <span className="text-slate-500">{row.count} ({row.percent.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-brand-500 h-full rounded-full" style={{ width: `${row.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-slate-450 leading-relaxed pt-3 border-t border-slate-100">
            This breakdown reflects the ingestion source captured on each lead (ad platform, campaign, or manual entry) so you can see
            where the majority of your pipeline originates from at a glance.
          </p>
        </div>
      )}

      {/* 3. Manage Users */}
      {activeTab === "Manage Users" && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h3 className="text-sm font-bold text-slate-700">Corporate User Directory</h3>
            <button
              onClick={() => setIsAddOpen(true)}
              className="inline-flex items-center gap-1.5 bg-brand-700 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-md shadow-brand-700/10 shrink-0"
            >
              <Plus className="h-4 w-4" />
              Add User
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: "Admin", count: userCounts.admin, icon: ShieldCheck, color: "text-violet-600 bg-violet-50 border-violet-100" },
              { label: "Managers", count: userCounts.managers, icon: UserCog, color: "text-blue-600 bg-blue-50 border-blue-100" },
              { label: "IT", count: userCounts.it, icon: Wrench, color: "text-indigo-600 bg-indigo-50 border-indigo-100" },
              { label: "Marketing", count: userCounts.marketing, icon: Megaphone, color: "text-pink-600 bg-pink-50 border-pink-100" },
              { label: "Finance", count: userCounts.finance, icon: Wallet, color: "text-emerald-600 bg-emerald-50 border-emerald-100" }
            ].map(stat => (
              <div key={stat.label} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">{stat.label}</span>
                  <p className="text-lg font-black text-slate-800 mt-0.5">{stat.count}</p>
                </div>
                <div className={`h-8 w-8 rounded-lg border flex items-center justify-center shrink-0 ${stat.color}`}>
                  <stat.icon className="h-4 w-4" />
                </div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* User records */}
          <div className="space-y-2.5">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                No users match &quot;{searchQuery}&quot;.
              </div>
            ) : (
              filteredUsers.map(user => {
                const isRevealed = revealedUserId === user.id;
                const deptKey = user.role === "ADMIN" ? "ADMIN" : (user.department || "SALES");
                return (
                  <div key={user.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-700 font-black text-xs shrink-0">
                        {initialsFor(user.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-800 truncate">{user.name}</p>
                          <span className={`text-[9px] font-bold border px-1.5 py-0.5 rounded-full shrink-0 ${DEPT_BADGE[deptKey] || DEPT_BADGE.SALES}`}>
                            {deptKey}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate">{user.designation || "—"}</p>
                        <p className="text-[10px] text-slate-500 font-mono truncate">{user.email}</p>
                        <p className="text-[10px] text-slate-500 font-mono">+91-{user.phone_number || "9876543210"}</p>
                        {user.managerName && (
                          <p className="text-[10px] text-brand-600 font-semibold truncate">Reports to {user.managerName}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {isRevealed && (
                        <div className="text-right bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 animate-fade-in">
                          <span className="block text-[8px] font-bold text-slate-400 uppercase">Login Password</span>
                          <span className="font-mono font-black text-brand-700 text-xs">
                            {user.password_hash || user.tempPassword || "password123"}
                          </span>
                        </div>
                      )}
                      <button
                        onClick={() => setRevealedUserId(isRevealed ? null : user.id)}
                        className="p-2 rounded-lg text-slate-500 hover:text-brand-700 hover:bg-slate-50 border border-slate-200 transition-colors"
                        title={isRevealed ? "Hide login credentials" : "Show login credentials"}
                      >
                        {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      {user.role !== "ADMIN" || activeRole === "ADMIN" ? (
                        <button
                          onClick={() => handleEditClick(user)}
                          className="p-2 rounded-lg text-slate-500 hover:text-brand-700 hover:bg-slate-50 border border-slate-200 transition-colors"
                          title="Edit user"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 4. About */}
      {activeTab === "About" && (
        <div className="max-w-xl space-y-4 animate-fade-in">
          <div className="glass-card p-6 rounded-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
                <Info className="h-5.5 w-5.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">TASKEZY Enterprise Platform</h3>
                <p className="text-[11px] text-slate-500">Version 1.0.0 (2026.07)</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
              Unified CRM, HRMS, and Finance operating system for real estate brokerage teams. Built for Realhubb Ventures.
            </p>
          </div>

          <div className="glass-card rounded-2xl divide-y divide-slate-100 overflow-hidden">
            <button
              onClick={() => alert("Privacy Policy: Realhubb Ventures processes lead and employee data solely for internal CRM/HRMS/Finance operations. Full policy document pending legal publication.")}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
            >
              <span className="flex items-center gap-2.5 text-xs font-bold text-slate-700">
                <FileText className="h-4 w-4 text-slate-400" />
                Privacy Policy
              </span>
              <span className="text-[10px] text-slate-400">View</span>
            </button>
            <button
              onClick={() => alert("Terms of Service: Usage of the TASKEZY platform is governed by the Realhubb Ventures master services agreement. Full terms document pending legal publication.")}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
            >
              <span className="flex items-center gap-2.5 text-xs font-bold text-slate-700">
                <ScrollText className="h-4 w-4 text-slate-400" />
                Terms of Service
              </span>
              <span className="text-[10px] text-slate-400">View</span>
            </button>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 font-bold text-xs transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      )}

      {/* Add User Modal */}
      {isAddOpen && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30" onClick={() => setIsAddOpen(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white border border-slate-200 p-6 rounded-2xl shadow-2xl z-40 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-brand-700 flex items-center gap-1.5">
                <Plus className="h-4.5 w-4.5 text-brand-600" />
                Add User
              </h3>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">First Name</label>
                  <input
                    type="text"
                    required
                    value={addFirstName}
                    onChange={(e) => setAddFirstName(e.target.value)}
                    placeholder="Pradeep"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Last Name</label>
                  <input
                    type="text"
                    value={addLastName}
                    onChange={(e) => setAddLastName(e.target.value)}
                    placeholder="Kumar"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Email</label>
                  <input
                    type="email"
                    required
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="name@realhubb.in"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Phone Number</label>
                  <input
                    type="text"
                    value={addPhone}
                    onChange={(e) => setAddPhone(e.target.value)}
                    placeholder="9980189914"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Department</label>
                  <select
                    value={addDepartment}
                    onChange={(e) => setAddDepartment(e.target.value as "SALES" | "TECH" | "MARKETING" | "FINANCE")}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                  >
                    <option value="SALES">SALES</option>
                    <option value="TECH">IT / TECH</option>
                    <option value="MARKETING">MARKETING</option>
                    <option value="FINANCE">FINANCE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Designation</label>
                  <input
                    type="text"
                    required
                    value={addDesignation}
                    onChange={(e) => setAddDesignation(e.target.value)}
                    placeholder="e.g. Sales Associate"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Role Type</label>
                  <select
                    value={addRoleType}
                    onChange={(e) => setAddRoleType(e.target.value as "Manager" | "Member")}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                  >
                    <option value="Member">Member</option>
                    <option value="Manager">Manager</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">SaaS License Type</label>
                  <select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value as Role)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                  >
                    <option value="AGENT">AGENT (Sales/IT/Mktg)</option>
                    <option value="FINANCE">FINANCE OPS</option>
                    <option value="ADMIN">GLOBAL ADMIN</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Reports To</label>
                <select
                  value={addManagerId}
                  onChange={(e) => setAddManagerId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                >
                  <option value="">No manager / top-level</option>
                  {managerOptions.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                {managerOptions.length === 0 && (
                  <p className="text-[9px] text-slate-400 mt-1">No Manager-role_type users exist yet — add one first if this person should report to someone.</p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Initial Password</label>
                <div className="relative">
                  <input
                    type={addShowPassword ? "text" : "password"}
                    required
                    value={addPassword}
                    onChange={(e) => setAddPassword(e.target.value)}
                    placeholder="Enter account password"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-10 py-2.5 text-xs focus:outline-none focus:border-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setAddShowPassword(!addShowPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {addShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-brand-700 hover:bg-brand-600 text-white font-bold py-2.5 rounded-lg text-xs transition-all shadow-sm"
              >
                Create User
              </button>
            </form>
          </div>
        </>
      )}

      {/* Edit User Modal */}
      {selectedUser && (
        <>
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30" onClick={() => setSelectedUser(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white border border-slate-200 p-6 rounded-2xl shadow-2xl z-40 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <h3 className="text-sm font-bold text-brand-700 flex items-center gap-1.5">
                <Edit className="h-4.5 w-4.5 text-brand-600" />
                Edit User
              </h3>
              <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-slate-655">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
              Updating details for <strong>{selectedUser.email}</strong>.
            </p>

            <form onSubmit={handleEditorSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">First Name</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-805 focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Last Name</label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-805 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Designation</label>
                <input
                  type="text"
                  required
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-805 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Role Type</label>
                  <select
                    value={roleType}
                    onChange={(e) => setRoleType(e.target.value as "Manager" | "Member")}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                  >
                    <option value="Manager">Manager</option>
                    <option value="Member">Member</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE")}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Reports To</label>
                <select
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                >
                  <option value="">No manager / top-level</option>
                  {managerOptions
                    .filter(m => m.id !== selectedUser?.id)
                    .map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Login Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={passwordHash}
                    onChange={(e) => setPasswordHash(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-10 py-2 text-xs text-slate-805 focus:outline-none focus:border-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-450 hover:text-slate-655"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {selectedUser.role !== "ADMIN" && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete ${selectedUser.name}?`)) {
                      deleteTeamMember(selectedUser.id);
                      setSelectedUser(null);
                      setSuccessMsg(`Removed ${selectedUser.name} from the roster.`);
                      setTimeout(() => setSuccessMsg(""), 5000);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-1.5 text-red-600 hover:text-red-700 text-[11px] font-bold"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Delete this user
                </button>
              )}

              <button
                type="submit"
                className="w-full bg-brand-700 hover:bg-brand-600 text-white font-semibold py-2.5 rounded-lg text-xs transition-all shadow-md shadow-brand-700/10"
              >
                Save Changes
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
