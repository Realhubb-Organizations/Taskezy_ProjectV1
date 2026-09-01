"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApp, SystemType } from "@/context/AppContext";
import NotificationBell from "@/components/dashboard/NotificationBell";
import {
  LayoutDashboard,
  LayoutGrid,
  Target,
  Users,
  Clock,
  DollarSign,
  Settings,
  Wifi,
  WifiOff,
  RefreshCw,
  LogOut,
  ChevronDown,
  User as UserIcon,
  Shield,
  X,
  Building,
  FileText,
  BarChart,
  Megaphone,
  Phone,
  HelpCircle,
  Video,
  LifeBuoy,
  Calendar,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";

function initialsFor(name?: string): string {
  if (!name) return "U";
  const parts = name.trim().split(" ").filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U";
}

function checkUserAccess(user: { role: string; department?: string; role_type?: string } | null, path: string): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true; // GOD ADMIN has absolute monitoring access

  // CRM: accessible only to SALES department
  if (path.startsWith("/dashboard/crm")) {
    return user.department === "SALES";
  }

  // HRMS: accessible to all departments (SALES, TECH, MARKETING, FINANCE)
  if (path.startsWith("/dashboard/hrms")) {
    return !!(user.department && ["SALES", "TECH", "MARKETING", "FINANCE"].includes(user.department));
  }

  // Finance: accessible only to FINANCE department
  if (path.startsWith("/dashboard/finance")) {
    return user.department === "FINANCE" || user.role === "FINANCE";
  }

  // Admin Cockpit: accessible only to ADMIN
  if (path.startsWith("/dashboard/admin")) {
    return user.role === "ADMIN";
  }

  // Settings: Manage Users / Connected Apps (OAuth) / roster data — admin-level
  // actions, not something a Manager or Member should be able to open at all.
  if (path.startsWith("/dashboard/settings")) {
    return user.role === "ADMIN";
  }

  return true;
} // Properties, Resale, Reports, Organization are open to other departments

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTabParam = searchParams.get("tab");

  const {
    currentUser,
    authLoading,
    activeRole,
    isOnline,
    pendingSyncCount,
    isSyncing,
    switchUserRole,
    setOnlineStatus,
    triggerSync,
    logout,
    activeSystem,
    setActiveSystem
  } = useApp();

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Desktop-only sidebar collapse (icon rail) — the mobile drawer/bottom tab
  // bar are separate, `md:hidden`-gated UI and are unaffected by this.
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<SystemType>>(new Set());
  const toggleGroup = (key: SystemType) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Modals simulation state
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Real auth required now — no more default logged-in user. Redirect to
  // login once the session-restore check (see AppContext) has finished and
  // confirmed there's no valid session, rather than on every render. This
  // effect (and every hook above it) must run unconditionally on every
  // render — the early returns below happen only in the JSX we return, never
  // by skipping hook calls, or React's hooks-order invariant breaks.
  useEffect(() => {
    if (!authLoading && !currentUser) {
      router.push("/auth/login");
    }
  }, [authLoading, currentUser, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-xs font-bold text-slate-500">
        Checking session...
      </div>
    );
  }

  if (!currentUser) {
    return null; // redirect above is in flight
  }

  // Sidebar groups — CRM/HRMS/FINANCE are always shown together, each
  // independently expandable, rather than switched between one at a time.
  // Clicking any item inside a group sets activeSystem to that group so
  // everything downstream that already keys off activeSystem (Settings,
  // NotificationBell, the Home dashboard's per-role content) keeps working
  // exactly as before — only how the sidebar presents them changed.
  const crmItems = [
    { name: "Dashboard", href: "/dashboard", activeCheck: (p: string, t?: string | null) => p === "/dashboard" && !t, icon: LayoutGrid },
    { name: "Properties", href: "/dashboard/properties", activeCheck: (p: string, t?: string | null) => p === "/dashboard/properties", icon: Building },
    { name: "Leads", href: "/dashboard/crm", activeCheck: (p: string, t?: string | null) => p === "/dashboard/crm", icon: Users },
    // Campaigns/Data Calling don't have dedicated pages of their own yet —
    // routed to the closest existing real, data-backed views (Marketing/
    // Agent Reports) rather than a dead link or fake page. Reports' own
    // role-scoping still applies (a sales Member following the Campaigns
    // link lands on their own Agent Reports instead, exactly like
    // navigating there any other way).
    { name: "Campaigns", href: "/dashboard/reports?tab=marketing", activeCheck: (p: string, t?: string | null) => p === "/dashboard/reports" && t === "marketing", icon: Megaphone },
    { name: "Data Calling", href: "/dashboard/reports?tab=agent", activeCheck: (p: string, t?: string | null) => p === "/dashboard/reports" && t === "agent", icon: Phone },
    { name: "Calendar", href: "/dashboard/crm/calendar", activeCheck: (p: string, t?: string | null) => p === "/dashboard/crm/calendar", icon: Calendar },
    { name: "Settings", href: "/dashboard/settings", activeCheck: (p: string, t?: string | null) => p === "/dashboard/settings", icon: Settings },
    { name: "Reports", href: "/dashboard/reports", activeCheck: (p: string, t?: string | null) => p === "/dashboard/reports", icon: BarChart }
  ];

  const hrmsItems = [
    { name: "Teams", href: "/dashboard/hrms?tab=teams", activeCheck: (p: string, t?: string | null) => p === "/dashboard/hrms" && t === "teams", icon: Users },
    { name: "Attendance", href: "/dashboard/hrms?tab=attendance", activeCheck: (p: string, t?: string | null) => p === "/dashboard/hrms" && t === "attendance", icon: Clock },
    { name: "HR Dashboard", href: "/dashboard/hrms?tab=dashboard", activeCheck: (p: string, t?: string | null) => p === "/dashboard/hrms" && t === "dashboard", icon: LayoutDashboard },
    { name: "Calendar", href: "/dashboard/hrms?tab=calendar", activeCheck: (p: string, t?: string | null) => p === "/dashboard/hrms" && t === "calendar", icon: Calendar },
    // HRMS Settings/Reports are a distinct, HRMS-flavored view of the shared
    // pages (geofence/half-day rules; all-employee attendance report) — not
    // the same global destination CRM's Settings/Reports items point to.
    { name: "Settings", href: "/dashboard/settings?tab=HRMS", activeCheck: (p: string, t?: string | null) => p === "/dashboard/settings" && t === "HRMS", icon: Settings },
    { name: "Reports", href: "/dashboard/hrms?tab=reports", activeCheck: (p: string, t?: string | null) => p === "/dashboard/hrms" && t === "reports", icon: BarChart }
  ];

  const financeItems = [
    { name: "Billing", href: "/dashboard/finance?tab=billing", activeCheck: (p: string, t?: string | null) => p === "/dashboard/finance" && t === "billing", icon: DollarSign },
    { name: "Reimbursements", href: "/dashboard/finance?tab=reimbursements", activeCheck: (p: string, t?: string | null) => p === "/dashboard/finance" && t === "reimbursements", icon: FileText },
    { name: "Finance Dashboard", href: "/dashboard/finance?tab=dashboard", activeCheck: (p: string, t?: string | null) => p === "/dashboard/finance" && t === "dashboard", icon: LayoutDashboard },
    { name: "Calendar", href: "/dashboard/finance?tab=calendar", activeCheck: (p: string, t?: string | null) => p === "/dashboard/finance" && t === "calendar", icon: Calendar },
    // Finance Settings/Reports are a distinct, Finance-flavored view (GST/
    // due-date rules; upcoming/overdue/collected payments report) — not the
    // same global destination CRM's Settings/Reports items point to.
    { name: "Settings", href: "/dashboard/settings?tab=Finance", activeCheck: (p: string, t?: string | null) => p === "/dashboard/settings" && t === "Finance", icon: Settings },
    { name: "Reports", href: "/dashboard/finance?tab=reports", activeCheck: (p: string, t?: string | null) => p === "/dashboard/finance" && t === "reports", icon: BarChart }
  ];

  const sidebarGroups = (
    [
      { key: "HRMS" as SystemType, label: "HRMS", icon: Target, baseHref: "/dashboard/hrms", items: hrmsItems },
      { key: "CRM" as SystemType, label: "CRM", icon: LayoutGrid, baseHref: "/dashboard/crm", items: crmItems },
      { key: "FINANCE" as SystemType, label: "FINANCE", icon: FileText, baseHref: "/dashboard/finance", items: financeItems }
    ]
  )
    .filter(g => checkUserAccess(currentUser, g.baseHref))
    .map(g => ({ ...g, items: g.items.filter(item => checkUserAccess(currentUser, item.href)) }));

  // Static links, always visible below the groups regardless of which is expanded.
  const staticBottomLinks = [
    { name: "Organization", href: "/dashboard/organization", activeCheck: (p: string) => p === "/dashboard/organization", icon: Building }
  ].filter(item => checkUserAccess(currentUser, item.href));

  const activeGroupForMobile = sidebarGroups.find(g => g.key === activeSystem) || sidebarGroups[0];
  // Mobile bottom tab bar: whichever system's group is currently active, its
  // first 4 items become fixed tabs (mirrors a native app's tab bar);
  // anything beyond that — plus the other groups/Organization/Help/Logout —
  // lives behind the "More" tab (the same drawer used on desktop-hidden screens).
  const primaryMobileNav = activeGroupForMobile ? activeGroupForMobile.items.slice(0, 4) : [];

  const handleLogout = () => {
    logout();
    router.push("/auth/login");
  };

  const getActiveTabName = () => {
    if (pathname === "/dashboard" && !activeTabParam) return "Home";
    for (const group of sidebarGroups) {
      for (const item of group.items) {
        if (item.activeCheck(pathname, activeTabParam)) return item.name;
      }
    }
    for (const item of staticBottomLinks) {
      if (item.activeCheck(pathname)) return item.name;
    }
    return "Home";
  };

  const hasPageAccess = checkUserAccess(currentUser, pathname);

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-800">
      {/* Desktop Sidebar — collapses to an icon rail; mobile uses a separate drawer/bottom-tab pattern below, entirely unaffected by this. */}
      <aside
        className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 border-r border-slate-200 bg-white z-20 transition-all duration-200 ${
          isSidebarCollapsed ? "md:w-20" : "md:w-64"
        }`}
      >
        <div className="flex flex-col flex-grow pt-4 pb-4 overflow-y-auto overflow-x-hidden">
          {/* Logo + collapse toggle */}
          <div className={`flex items-center flex-shrink-0 mb-6 ${isSidebarCollapsed ? "justify-center px-2" : "justify-between px-6"}`}>
            {!isSidebarCollapsed && (
              <Link href="/dashboard" className="flex items-center min-w-0">
                <img
                  src="/Blue White Professional Minimal Company Business Card.png"
                  alt="TASKEZY Logo"
                  className="h-10 w-auto object-contain"
                />
              </Link>
            )}
            <button
              onClick={() => setIsSidebarCollapsed(v => !v)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-brand-700 hover:bg-slate-50 transition-colors shrink-0"
              title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isSidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </button>
          </div>

          {/* Navigation Groups — HRMS/CRM/FINANCE always visible, each independently expandable */}
          <nav className={`flex-1 space-y-1 ${isSidebarCollapsed ? "px-2" : "px-4"}`}>
            {sidebarGroups.map((group) => {
              const isExpanded = !isSidebarCollapsed && (expandedGroups.has(group.key) || group.items.some(i => i.activeCheck(pathname, activeTabParam)));
              return (
                <div key={group.key}>
                  <button
                    onClick={() => {
                      if (isSidebarCollapsed) {
                        setIsSidebarCollapsed(false);
                        setExpandedGroups(prev => new Set(prev).add(group.key));
                      } else {
                        toggleGroup(group.key);
                      }
                    }}
                    title={group.label}
                    className={`w-full flex items-center text-xs font-extrabold text-slate-800 rounded-lg hover:bg-slate-50 transition-colors ${
                      isSidebarCollapsed ? "justify-center py-2.5" : "justify-between px-4 py-2.5"
                    }`}
                  >
                    <span className={`flex items-center ${isSidebarCollapsed ? "" : "gap-2.5"}`}>
                      <group.icon className="h-4.5 w-4.5 text-brand-700" />
                      {!isSidebarCollapsed && group.label}
                    </span>
                    {!isSidebarCollapsed && (
                      <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="mt-1 ml-4 pl-3.5 border-l border-slate-150 space-y-0.5 animate-fade-in">
                      {group.items.map((item) => {
                        const isActive = item.activeCheck(pathname, activeTabParam);
                        return (
                          <Link
                            key={item.name}
                            href={item.href}
                            onClick={() => setActiveSystem(group.key)}
                            className={`flex items-center px-3 py-2 text-xs font-bold rounded-lg transition-all duration-200 ${
                              isActive
                                ? "bg-brand-50 text-brand-700"
                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                            }`}
                          >
                            <item.icon className={`mr-2 h-3.5 w-3.5 ${isActive ? "text-brand-650" : "text-slate-400"}`} />
                            {item.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Static links — Organization, then Help/Tutorials/Contact — always visible regardless of which group is expanded */}
            <div className="pt-3 mt-3 border-t border-slate-100 space-y-1">
              {staticBottomLinks.map((item) => {
                const isActive = item.activeCheck(pathname);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    title={item.name}
                    className={`flex items-center text-xs font-bold rounded-lg transition-all duration-200 ${
                      isSidebarCollapsed ? "justify-center py-2" : "px-4 py-2"
                    } ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
                  >
                    <item.icon className={`h-4 w-4 ${isSidebarCollapsed ? "" : "mr-2.5"} ${isActive ? "text-brand-650" : "text-slate-400"}`} />
                    {!isSidebarCollapsed && item.name}
                  </Link>
                );
              })}
            </div>

            <div className="pt-3 mt-3 border-t border-slate-100 space-y-1 text-[11px] font-bold text-slate-450">
              <button
                onClick={() => setActiveModal("help")}
                title="Help & Support"
                className={`w-full flex items-center hover:text-slate-800 transition-colors ${isSidebarCollapsed ? "justify-center py-2" : "px-4 py-1.5"}`}
              >
                <HelpCircle className={`h-3.5 w-3.5 ${isSidebarCollapsed ? "" : "mr-2"}`} /> {!isSidebarCollapsed && "Help & Support"}
              </button>
              <button
                onClick={() => setActiveModal("tutorials")}
                title="CRM Tutorials"
                className={`w-full flex items-center hover:text-slate-800 transition-colors ${isSidebarCollapsed ? "justify-center py-2" : "px-4 py-1.5"}`}
              >
                <Video className={`h-3.5 w-3.5 ${isSidebarCollapsed ? "" : "mr-2"}`} /> {!isSidebarCollapsed && "CRM Tutorials"}
              </button>
              <button
                onClick={() => setActiveModal("contact")}
                title="Contact Support"
                className={`w-full flex items-center hover:text-slate-800 transition-colors ${isSidebarCollapsed ? "justify-center py-2" : "px-4 py-1.5"}`}
              >
                <LifeBuoy className={`h-3.5 w-3.5 ${isSidebarCollapsed ? "" : "mr-2"}`} /> {!isSidebarCollapsed && "Contact Support"}
              </button>
            </div>
          </nav>
        </div>
      </aside>

      {/* Main content wrapper */}
      <div className={`flex flex-col flex-1 w-full min-h-screen transition-all duration-200 ${isSidebarCollapsed ? "md:pl-20" : "md:pl-64"}`}>
        {/* Top Header Bar */}
        <header className="sticky top-0 z-10 flex-shrink-0 h-14 md:h-16 border-b border-slate-200 bg-white/70 backdrop-blur-md flex items-center justify-between px-3 sm:px-6 lg:px-8 gap-2">
          <h1 className="text-sm font-bold text-slate-900 truncate">{getActiveTabName()}</h1>

          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <NotificationBell />

            {/* User menu — avatar + name dropdown, replaces the old separate profile footer/badge; Logout lives here now. */}
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-1.5"
              >
                <span className="h-8 w-8 rounded-full bg-brand-800 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {initialsFor(currentUser?.name)}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 hidden sm:block ${isUserMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {isUserMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setIsUserMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-40 overflow-hidden animate-fade-in">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <p className="text-xs font-bold text-slate-800 truncate">{currentUser?.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">{currentUser?.email}</p>
                    </div>
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        handleLogout();
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Sidebar drawer */}
        {isMobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 w-[82vw] max-w-72 bg-white border-r border-slate-200 p-5 flex flex-col z-40 md:hidden overflow-y-auto">
              <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-4">
                <Link href="/dashboard" className="flex items-center">
                  <img
                    src="/Blue White Professional Minimal Company Business Card.png"
                    alt="TASKEZY Logo"
                    className="h-9 w-auto object-contain"
                  />
                </Link>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-slate-500 hover:text-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Connected user + edge sync controls — desktop shows these in the
                  header/sidebar footer; on mobile both live here instead. */}
              <div className="mb-4 p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                    <UserIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{currentUser?.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{currentUser?.email}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] pt-2 border-t border-slate-200">
                  <button
                    onClick={() => setOnlineStatus(!isOnline)}
                    className={`flex items-center gap-1.5 font-bold ${isOnline ? "text-emerald-600" : "text-amber-600"}`}
                  >
                    {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5 animate-pulse" />}
                    {isOnline ? "Online" : "Offline"}
                  </button>
                  {pendingSyncCount > 0 && (
                    <button
                      onClick={triggerSync}
                      disabled={isSyncing || !isOnline}
                      className={`flex items-center gap-1 text-brand-600 font-semibold disabled:opacity-40 ${isSyncing ? "animate-spin" : ""}`}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Sync ({pendingSyncCount})
                    </button>
                  )}
                </div>
              </div>

              <nav className="space-y-1 flex-1 overflow-y-auto">
                {sidebarGroups.map((group) => {
                  const isExpanded = expandedGroups.has(group.key) || group.items.some(i => i.activeCheck(pathname, activeTabParam));
                  return (
                    <div key={group.key}>
                      <button
                        onClick={() => toggleGroup(group.key)}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-extrabold text-slate-800 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <span className="flex items-center gap-2.5">
                          <group.icon className="h-4.5 w-4.5 text-brand-700" />
                          {group.label}
                        </span>
                        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                      </button>
                      {isExpanded && (
                        <div className="mt-1 ml-4 pl-3.5 border-l border-slate-150 space-y-0.5">
                          {group.items.map((item) => {
                            const isActive = item.activeCheck(pathname, activeTabParam);
                            return (
                              <Link
                                key={item.name}
                                href={item.href}
                                className={`flex items-center px-3 py-2 text-xs font-semibold rounded-lg ${
                                  isActive ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50"
                                }`}
                                onClick={() => {
                                  setActiveSystem(group.key);
                                  setIsMobileMenuOpen(false);
                                }}
                              >
                                <item.icon className="mr-2 h-3.5 w-3.5 text-slate-400" />
                                {item.name}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Organization — present on the desktop sidebar but previously
                    missing here, leaving mobile with no way to reach it at all. */}
                {staticBottomLinks.length > 0 && (
                  <div className="space-y-1 pt-2 mt-2 border-t border-slate-100">
                    {staticBottomLinks.map((item) => {
                      const isActive = item.activeCheck(pathname);
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={`flex items-center px-4 py-1.5 text-xs font-semibold rounded-lg ${
                            isActive ? "bg-brand-50 text-brand-700 border-l-2 border-brand-500" : "text-slate-500 hover:bg-slate-50"
                          }`}
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          <item.icon className="mr-2 h-4 w-4 text-slate-400" />
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                )}

                {/* Help / Support — same as the desktop sidebar's bottom links, also previously missing on mobile */}
                <div className="space-y-1 pt-2 border-t border-slate-100 text-[11px] font-bold text-slate-450">
                  <button
                    onClick={() => setActiveModal("help")}
                    className="w-full flex items-center px-4 py-1.5 hover:text-slate-800 transition-colors"
                  >
                    <HelpCircle className="mr-2 h-3.5 w-3.5" /> Help &amp; Support
                  </button>
                  <button
                    onClick={() => setActiveModal("tutorials")}
                    className="w-full flex items-center px-4 py-1.5 hover:text-slate-800 transition-colors"
                  >
                    <Video className="mr-2 h-3.5 w-3.5" /> CRM Tutorials
                  </button>
                  <button
                    onClick={() => setActiveModal("contact")}
                    className="w-full flex items-center px-4 py-1.5 hover:text-slate-800 transition-colors"
                  >
                    <LifeBuoy className="mr-2 h-3.5 w-3.5" /> Contact Support
                  </button>
                </div>
              </nav>

              {/* Logout — present in the desktop sidebar footer, previously
                  had no mobile equivalent at all. */}
              <div className="flex-shrink-0 border-t border-slate-200 pt-3 mt-3">
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </>
        )}

        {/* Mobile bottom tab bar — the primary navigation surface on phones,
            matching a native app's tab bar. "More" opens the drawer above,
            which holds everything that doesn't fit as a fixed tab. */}
        <nav
          className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex items-stretch">
            {primaryMobileNav.map((item) => {
              const isActive = item.activeCheck(pathname, activeTabParam);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-w-0 ${
                    isActive ? "text-brand-700" : "text-slate-400"
                  }`}
                >
                  <item.icon className={`h-5 w-5 ${isActive ? "text-brand-650" : "text-slate-400"}`} />
                  <span className="text-[10px] font-bold truncate max-w-full px-1">{item.name}</span>
                </Link>
              );
            })}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-w-0 ${
                isMobileMenuOpen ? "text-brand-700" : "text-slate-400"
              }`}
            >
              <MoreHorizontal className={`h-5 w-5 ${isMobileMenuOpen ? "text-brand-650" : "text-slate-400"}`} />
              <span className="text-[10px] font-bold">More</span>
            </button>
          </div>
        </nav>

        {/* Core Container — bottom padding on mobile clears the fixed tab bar */}
        <main className="flex-1 p-3 sm:p-6 lg:p-8 pb-24 md:pb-8 bg-slate-50/50 overflow-y-auto">
          {hasPageAccess ? children : (
            <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center space-y-6 bg-white border border-slate-200 rounded-3xl shadow-sm max-w-2xl mx-auto my-8 animate-fade-in">
              <div className="h-16 w-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center text-red-650 shadow-md">
                <Shield className="h-8 w-8 animate-pulse" />
              </div>
              <div className="space-y-2 max-w-md">
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Security Access Gated</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  Your profile <span className="text-brand-700 font-bold">({currentUser?.email})</span> in the <span className="font-semibold text-brand-700">{currentUser?.department || "unassigned"}</span> department is unauthorized to access <span className="font-mono bg-slate-100 text-red-650 px-1 py-0.5 rounded font-bold">{pathname}</span>.
                </p>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  The TaskEzy multi-tenant security architecture enforces strict separation between CRM lead pipelines, HRMS telemetry, and Finance ledgers.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  href="/dashboard"
                  className="bg-brand-700 hover:bg-brand-600 text-white font-bold px-4 py-2.5 rounded-lg text-xs transition-all shadow-md shadow-brand-700/10"
                >
                  Return to Dashboard
                </Link>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50 text-xs font-bold text-slate-500">Loading control cockpit...</div>}>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}
