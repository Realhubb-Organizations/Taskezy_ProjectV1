"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApp, Role, SystemType, getAvailableSystems } from "@/context/AppContext";
import NotificationBell from "@/components/dashboard/NotificationBell";
import {
  LayoutDashboard,
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
  Landmark,
  FileText,
  BarChart,
  HelpCircle,
  Video,
  LifeBuoy,
  Briefcase,
  ArrowLeft,
  Calendar,
  MoreHorizontal
} from "lucide-react";

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

  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSystemDropdownOpen, setIsSystemDropdownOpen] = useState(false);

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

  const availableSystems = getAvailableSystems(currentUser);

  const handleSystemChange = (system: SystemType) => {
    setActiveSystem(system);
    router.push("/dashboard");
  };

  const getSystemDetails = (sys: SystemType) => {
    switch (sys) {
      case "CRM":
        return { name: "CRM Portal", icon: Building, color: "text-blue-600 bg-blue-50 border-blue-100", desc: "Leads & Properties" };
      case "HRMS":
        return { name: "HRMS Portal", icon: Briefcase, color: "text-indigo-600 bg-indigo-50 border-indigo-100", desc: "Attendance & Roster" };
      case "FINANCE":
        return { name: "Finance Portal", icon: DollarSign, color: "text-emerald-600 bg-emerald-50 border-emerald-100", desc: "Billing & Claims" };
      case "ADMIN":
        return { name: "Admin Cockpit", icon: Shield, color: "text-violet-600 bg-violet-50 border-violet-100", desc: "Global Control" };
    }
  };

  const activeSystemDetail = getSystemDetails(activeSystem);

  const mainNavigation = [
    { name: "Dashboard", href: "/dashboard", activeCheck: (p: string, t?: string | null) => p === "/dashboard" && !t, icon: LayoutDashboard },
    { name: "Leads", href: "/dashboard/crm", activeCheck: (p: string, t?: string | null) => p === "/dashboard/crm", icon: Users },
    { name: "Properties", href: "/dashboard/properties", activeCheck: (p: string, t?: string | null) => p === "/dashboard/properties", icon: Building },
    { name: "Resale Market", href: "/dashboard/resale", activeCheck: (p: string, t?: string | null) => p === "/dashboard/resale", icon: Landmark },
    { name: "Calendar", href: "/dashboard/crm/calendar", activeCheck: (p: string, t?: string | null) => p === "/dashboard/crm/calendar", icon: Calendar }
  ];

  const hrisNavigation = [
    { name: "Teams", href: "/dashboard/hrms?tab=teams", activeCheck: (p: string, t?: string | null) => p === "/dashboard/hrms" && t === "teams", icon: Users },
    { name: "Attendance", href: "/dashboard/hrms?tab=attendance", activeCheck: (p: string, t?: string | null) => p === "/dashboard/hrms" && t === "attendance", icon: Clock },
    { name: "Calendar", href: "/dashboard/hrms?tab=calendar", activeCheck: (p: string, t?: string | null) => p === "/dashboard/hrms" && t === "calendar", icon: Calendar },
    { name: "HR Dashboard", href: "/dashboard/hrms?tab=dashboard", activeCheck: (p: string, t?: string | null) => p === "/dashboard/hrms" && t === "dashboard", icon: LayoutDashboard }
  ];

  const financeNavigation = [
    { name: "Billing", href: "/dashboard/finance?tab=billing", activeCheck: (p: string, t?: string | null) => p === "/dashboard/finance" && t === "billing", icon: DollarSign },
    { name: "Reimbursements", href: "/dashboard/finance?tab=reimbursements", activeCheck: (p: string, t?: string | null) => p === "/dashboard/finance" && t === "reimbursements", icon: FileText },
    { name: "Calendar", href: "/dashboard/finance?tab=calendar", activeCheck: (p: string, t?: string | null) => p === "/dashboard/finance" && t === "calendar", icon: Calendar },
    { name: "Finance Dashboard", href: "/dashboard/finance?tab=dashboard", activeCheck: (p: string, t?: string | null) => p === "/dashboard/finance" && t === "dashboard", icon: LayoutDashboard }
  ];

  const bottomNavigation = [
    { name: "Settings", href: "/dashboard/settings", activeCheck: (p: string, t?: string | null) => p === "/dashboard/settings", icon: Settings },
    { name: "Reports", href: "/dashboard/reports", activeCheck: (p: string, t?: string | null) => p === "/dashboard/reports", icon: BarChart },
    { name: "Organization", href: "/dashboard/organization", activeCheck: (p: string, t?: string | null) => p === "/dashboard/organization", icon: Building }
  ];

  // Filter navigation arrays based on current user context and active system
  const showCRM = activeSystem === "CRM";
  const showHRMS = activeSystem === "HRMS";
  const showFinance = activeSystem === "FINANCE";
  const showAdmin = activeSystem === "ADMIN";

  const allowedMainNavigation = showCRM
    ? mainNavigation.filter(item => checkUserAccess(currentUser, item.href))
    : showAdmin
      ? [
          { name: "Dashboard", href: "/dashboard", activeCheck: (p: string, t?: string | null) => p === "/dashboard" && !t, icon: LayoutDashboard },
          { name: "Calendar", href: "/dashboard/admin/calendar", activeCheck: (p: string, t?: string | null) => p === "/dashboard/admin/calendar", icon: Calendar }
        ]
      : [];
  const allowedHrisNavigation = showHRMS ? hrisNavigation.filter(item => checkUserAccess(currentUser, item.href)) : [];
  const allowedFinanceNavigation = showFinance ? financeNavigation.filter(item => checkUserAccess(currentUser, item.href)) : [];
  const allowedBottomNavigation = bottomNavigation.filter(item => checkUserAccess(currentUser, item.href));

  // Mobile bottom tab bar: whichever system's nav group is active, its first
  // 4 items become fixed tabs (mirrors a native app's tab bar); anything
  // beyond that — plus Settings/Reports/Organization/Help/Logout, none of
  // which fit in a 5-tab bar — lives behind the "More" tab (the same drawer
  // used on desktop-hidden screens).
  const primaryMobileNav = (
    allowedMainNavigation.length > 0 ? allowedMainNavigation :
    allowedHrisNavigation.length > 0 ? allowedHrisNavigation :
    allowedFinanceNavigation.length > 0 ? allowedFinanceNavigation : []
  ).slice(0, 4);

  const handleLogout = () => {
    logout();
    router.push("/auth/login");
  };

  const getActiveTabName = () => {
    if (pathname === "/dashboard/admin/calendar") return "Calendar";
    for (const item of mainNavigation) {
      if (item.activeCheck(pathname, activeTabParam)) return item.name;
    }
    for (const item of hrisNavigation) {
      if (item.activeCheck(pathname, activeTabParam)) return `HRIS: ${item.name}`;
    }
    for (const item of financeNavigation) {
      if (item.activeCheck(pathname, activeTabParam)) return `Finance: ${item.name}`;
    }
    for (const item of bottomNavigation) {
      if (item.activeCheck(pathname, activeTabParam)) return item.name;
    }
    return "Control Cockpit";
  };

  const hasPageAccess = checkUserAccess(currentUser, pathname);

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-800">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-slate-200 bg-white z-20">
        <div className="flex flex-col flex-grow pt-4 pb-4 overflow-y-auto">
          {/* Logo */}
          <div className="flex items-center flex-shrink-0 px-6 mb-6">
            <Link href="/dashboard" className="flex items-center">
              <img
                src="/Blue White Professional Minimal Company Business Card (1).png"
                alt="TASKEZY Logo"
                className="h-10 w-auto object-contain"
              />
            </Link>
          </div>

          {/* System Switcher */}
          {availableSystems.length > 1 ? (
            <div className="relative px-4 mb-4">
              <button
                onClick={() => setIsSystemDropdownOpen(!isSystemDropdownOpen)}
                className="w-full flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all duration-200"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`p-1.5 rounded-lg border ${activeSystemDetail.color}`}>
                    <activeSystemDetail.icon className="h-4 w-4 shrink-0" />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-[11px] font-extrabold text-slate-805 leading-none">{activeSystemDetail.name}</p>
                    <p className="text-[9px] text-slate-400 font-semibold leading-none mt-1 truncate">{activeSystemDetail.desc}</p>
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 shrink-0 ${isSystemDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {isSystemDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setIsSystemDropdownOpen(false)} />
                  <div className="absolute left-4 right-4 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 p-1.5 space-y-1 animate-fade-in">
                    {availableSystems.map((sys) => {
                      const details = getSystemDetails(sys);
                      const isSelected = sys === activeSystem;
                      return (
                        <button
                          key={sys}
                          onClick={() => {
                            handleSystemChange(sys);
                            setIsSystemDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-lg transition-all duration-200 text-left ${
                            isSelected ? "bg-brand-50/50" : "hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`p-1 rounded-md border ${details.color}`}>
                              <details.icon className="h-3.5 w-3.5 shrink-0" />
                            </div>
                            <div className="min-w-0">
                              <p className={`text-[10px] font-bold ${isSelected ? "text-brand-700" : "text-slate-700"}`}>{details.name}</p>
                              <p className="text-[8px] text-slate-400 font-medium leading-tight truncate">{details.desc}</p>
                            </div>
                          </div>
                          {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-brand-600 mr-1" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="px-4 mb-4">
              <div className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                <div className={`p-1.5 rounded-lg border ${activeSystemDetail.color}`}>
                  <activeSystemDetail.icon className="h-4 w-4 animate-pulse" />
                </div>
                <div>
                  <p className="text-[11px] font-extrabold text-slate-800 leading-none">{activeSystemDetail.name}</p>
                  <p className="text-[9px] text-slate-400 font-semibold leading-none mt-1">{activeSystemDetail.desc}</p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Links */}
          <nav className="mt-2 flex-1 px-4 space-y-4">
            {/* Main Section */}
            {allowedMainNavigation.length > 0 && (
              <div className="space-y-1">
                {allowedMainNavigation.map((item) => {
                  const isActive = item.activeCheck(pathname, activeTabParam);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`group flex items-center px-4 py-2.5 text-xs font-bold rounded-lg transition-all duration-250 ${
                        isActive
                          ? "bg-brand-50 border-l-2 border-brand-500 text-brand-700"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <item.icon className={`mr-2.5 h-4.5 w-4.5 ${isActive ? "text-brand-650" : "text-slate-400"}`} />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* HRIS Group */}
            {allowedHrisNavigation.length > 0 && (
              <div className="space-y-1">
                <p className="px-4 text-[9px] uppercase tracking-wider font-extrabold text-slate-400">HRIS</p>
                {allowedHrisNavigation.map((item) => {
                  const isActive = item.activeCheck(pathname, activeTabParam);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`group flex items-center px-4 py-2 text-xs font-bold rounded-lg transition-all duration-250 ${
                        isActive
                          ? "bg-brand-50 border-l-2 border-brand-500 text-brand-700"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <item.icon className={`mr-2.5 h-4 w-4 ${isActive ? "text-brand-650" : "text-slate-400"}`} />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Finance Group */}
            {allowedFinanceNavigation.length > 0 && (
              <div className="space-y-1">
                <p className="px-4 text-[9px] uppercase tracking-wider font-extrabold text-slate-400">Finance</p>
                {allowedFinanceNavigation.map((item) => {
                  const isActive = item.activeCheck(pathname, activeTabParam);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`group flex items-center px-4 py-2 text-xs font-bold rounded-lg transition-all duration-250 ${
                        isActive
                          ? "bg-brand-50 border-l-2 border-brand-500 text-brand-700"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <item.icon className={`mr-2.5 h-4 w-4 ${isActive ? "text-brand-650" : "text-slate-400"}`} />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* System settings and reports */}
            {allowedBottomNavigation.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-slate-100">
                {allowedBottomNavigation.map((item) => {
                  const isActive = item.activeCheck(pathname, activeTabParam);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`group flex items-center px-4 py-2 text-xs font-bold rounded-lg transition-all duration-250 ${
                        isActive
                          ? "bg-brand-50 border-l-2 border-brand-500 text-brand-700"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <item.icon className={`mr-2.5 h-4 w-4 ${isActive ? "text-brand-650" : "text-slate-400"}`} />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Help / Modals trigger links */}
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
        </div>

        {/* User profile footer */}
        <div className="flex-shrink-0 flex border-t border-slate-200 p-4 bg-slate-50/50">
          <div className="flex items-center w-full">
            <div className="h-9 w-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500">
              <UserIcon className="h-4 w-4" />
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate">
                {currentUser?.name || "Sanjeev Singh"}
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                {currentUser?.email || "admin@realhubb.in"}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="ml-auto text-slate-400 hover:text-red-500 transition-colors p-1"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content wrapper */}
      <div className="md:pl-64 flex flex-col flex-1 w-full min-h-screen">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-10 flex-shrink-0 h-14 md:h-16 border-b border-slate-200 bg-white/70 backdrop-blur-md flex items-center justify-between px-3 sm:px-6 lg:px-8 gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            {/* Back Navigation Button */}
            <button
              onClick={() => router.back()}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-all flex items-center justify-center shrink-0 border border-slate-200 shadow-sm bg-white"
              title="Navigate back to previous tab/page"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>

            <h1 className="text-xs sm:text-sm font-bold text-brand-700 tracking-wide uppercase ml-0.5 truncate">{getActiveTabName()}</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Edge sync status — desktop only; mobile equivalent lives in the "More" drawer */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-xs">
              <button
                onClick={() => setOnlineStatus(!isOnline)}
                className={`flex items-center gap-1.5 transition-colors font-bold ${
                  isOnline ? "text-emerald-600 hover:text-emerald-700" : "text-amber-600 hover:text-amber-700"
                }`}
                title="Toggle network online/offline to test synchronization capabilities"
              >
                {isOnline ? (
                  <>
                    <Wifi className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Online</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3.5 w-3.5 animate-pulse" />
                    <span>Offline</span>
                  </>
                )}
              </button>

              {pendingSyncCount > 0 && (
                <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2 ml-1">
                  <button
                    onClick={triggerSync}
                    disabled={isSyncing || !isOnline}
                    className={`flex items-center gap-1 text-brand-600 hover:text-brand-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold ${
                      isSyncing ? "animate-spin" : ""
                    }`}
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Sync ({pendingSyncCount})</span>
                  </button>
                </div>
              )}
            </div>

            {/* Notification Bell */}
            <NotificationBell />

            {/* Connected User Badge — desktop only; mobile shows this in the "More" drawer instead */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-750 max-w-[240px] truncate">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="truncate">Connected: {currentUser?.name} ({currentUser?.designation})</span>
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
                    src="/Blue White Professional Minimal Company Business Card (1).png"
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

              {/* Mobile System Switcher */}
              {availableSystems.length > 1 ? (
                <div className="relative mb-4">
                  <button
                    onClick={() => setIsSystemDropdownOpen(!isSystemDropdownOpen)}
                    className="w-full flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all duration-200"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-1.5 rounded-lg border ${activeSystemDetail.color}`}>
                        <activeSystemDetail.icon className="h-4 w-4 shrink-0" />
                      </div>
                      <div className="text-left min-w-0">
                        <p className="text-[11px] font-extrabold text-slate-805 leading-none">{activeSystemDetail.name}</p>
                        <p className="text-[9px] text-slate-400 font-semibold leading-none mt-1 truncate">{activeSystemDetail.desc}</p>
                      </div>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 shrink-0 ${isSystemDropdownOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isSystemDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setIsSystemDropdownOpen(false)} />
                      <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 p-1.5 space-y-1 animate-fade-in">
                        {availableSystems.map((sys) => {
                          const details = getSystemDetails(sys);
                          const isSelected = sys === activeSystem;
                          return (
                            <button
                              key={sys}
                              onClick={() => {
                                handleSystemChange(sys);
                                setIsSystemDropdownOpen(false);
                                setIsMobileMenuOpen(false);
                              }}
                              className={`w-full flex items-center justify-between p-2 rounded-lg transition-all duration-200 text-left ${
                                isSelected ? "bg-brand-50/50" : "hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`p-1 rounded-md border ${details.color}`}>
                                  <details.icon className="h-3.5 w-3.5 shrink-0" />
                                </div>
                                <div className="min-w-0">
                                  <p className={`text-[10px] font-bold ${isSelected ? "text-brand-700" : "text-slate-700"}`}>{details.name}</p>
                                  <p className="text-[8px] text-slate-400 font-medium leading-tight truncate">{details.desc}</p>
                                </div>
                              </div>
                              {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-brand-600 mr-1" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="mb-4">
                  <div className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                    <div className={`p-1.5 rounded-lg border ${activeSystemDetail.color}`}>
                      <activeSystemDetail.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[11px] font-extrabold text-slate-800 leading-none">{activeSystemDetail.name}</p>
                      <p className="text-[9px] text-slate-400 font-semibold leading-none mt-1">{activeSystemDetail.desc}</p>
                    </div>
                  </div>
                </div>
              )}

              <nav className="space-y-4 flex-1 overflow-y-auto">
                {allowedMainNavigation.length > 0 && (
                  <div className="space-y-1">
                    {allowedMainNavigation.map((item) => {
                      const isActive = item.activeCheck(pathname, activeTabParam);
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={`flex items-center px-4 py-2 text-xs font-semibold rounded-lg ${
                            isActive ? "bg-brand-50 text-brand-700 border-l-2 border-brand-500" : "text-slate-500 hover:bg-slate-50"
                          }`}
                          onClick={() => setIsMobileMenuOpen(false)}
                        >
                          <item.icon className="mr-2 h-4.5 w-4.5 text-slate-400" />
                          {item.name}
                        </Link>
                      );
                    })}
                  </div>
                )}

                {allowedHrisNavigation.length > 0 && (
                  <div className="space-y-1">
                    <p className="px-4 text-[9px] uppercase tracking-wider font-extrabold text-slate-400">HRIS</p>
                    {allowedHrisNavigation.map((item) => {
                      const isActive = item.activeCheck(pathname, activeTabParam);
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

                {allowedFinanceNavigation.length > 0 && (
                  <div className="space-y-1">
                    <p className="px-4 text-[9px] uppercase tracking-wider font-extrabold text-slate-400">Finance</p>
                    {allowedFinanceNavigation.map((item) => {
                      const isActive = item.activeCheck(pathname, activeTabParam);
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

                {/* Settings/Reports/Organization — present on the desktop sidebar
                    but previously missing here, leaving mobile with no way to
                    reach them at all. */}
                {allowedBottomNavigation.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-slate-100">
                    {allowedBottomNavigation.map((item) => {
                      const isActive = item.activeCheck(pathname, activeTabParam);
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
