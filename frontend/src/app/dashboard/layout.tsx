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
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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
    { name: "Dashboard", href: "/dashboard/crm", activeCheck: (p: string, t?: string | null) => p === "/dashboard/crm" && !t, icon: LayoutDashboard },
    { name: "Properties", href: "/dashboard/properties", activeCheck: (p: string) => p === "/dashboard/properties", icon: Building },
    { name: "Leads", href: "/dashboard/crm?tab=leads", activeCheck: (p: string, t?: string | null) => (p === "/dashboard/crm" && t === "leads") || p === "/dashboard/leads", icon: Calendar },
    { name: "Campaigns", href: "/dashboard/reports", activeCheck: (p: string) => p === "/dashboard/reports", icon: BarChart },
    { name: "Data Calling", href: "/dashboard/crm/calendar", activeCheck: (p: string) => p === "/dashboard/crm/calendar", icon: Briefcase },
    { name: "Team Analysis", href: "/dashboard/organization", activeCheck: (p: string) => p === "/dashboard/organization", icon: Users }
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
          { name: "Home", href: "/dashboard", activeCheck: (p: string, t?: string | null) => p === "/dashboard" && !t, icon: LayoutDashboard },
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
    if (pathname === "/dashboard") return "Dashboard";
    if (pathname === "/dashboard/admin/calendar") return "Calendar";
    for (const item of mainNavigation) {
      if (item.activeCheck(pathname, activeTabParam)) return item.name;
    }
    for (const item of hrisNavigation) {
      if (item.activeCheck(pathname, activeTabParam)) return item.name;
    }
    for (const item of financeNavigation) {
      if (item.activeCheck(pathname, activeTabParam)) return item.name;
    }
    for (const item of bottomNavigation) {
      if (item.activeCheck(pathname, activeTabParam)) return item.name;
    }
    return "Dashboard";
  };

  const hasPageAccess = checkUserAccess(currentUser, pathname);

  const userInitials = (currentUser?.name || "BS")
    .split(" ")
    .filter(Boolean)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "BS";

  return (
    <div className="min-h-screen flex bg-[#F4F5F7] text-slate-800">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 border-r border-slate-200 bg-white z-20 transition-all duration-300 ${
          isSidebarCollapsed ? "md:w-20" : "md:w-60"
        }`}
      >
        <div className="flex flex-col flex-grow pt-4 pb-4 overflow-y-auto overflow-x-hidden">
          {/* Logo + collapse toggle */}
          <div className={`flex items-center flex-shrink-0 mb-6 ${isSidebarCollapsed ? "justify-between px-3" : "justify-between px-5"}`}>
            <Link href="/dashboard" className="flex items-center overflow-hidden">
              {isSidebarCollapsed ? (
                <img src="/logo_icon.png" alt="TASKEZY" className="h-7 w-auto object-contain" />
              ) : (
                <div className="shrink-0 flex items-center gap-2">
                  <img
                    src="/taskezy_logo_clean.png"
                    alt="TASKEZY Logo"
                    className="h-8 w-auto object-contain"
                  />
                  <div className="flex flex-col justify-center gap-[3px] text-slate-700 hover:text-black cursor-pointer">
                    <div className="w-3.5 h-[2px] bg-slate-700 rounded-full" />
                    <div className="w-3.5 h-[2px] bg-slate-700 rounded-full" />
                  </div>
                </div>
              )}
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="mt-2 flex-1 px-3 space-y-4">
            {/* HRMS Accordion */}
            <div>
              <button
                onClick={() => {
                  if (isSidebarCollapsed) setIsSidebarCollapsed(false);
                  else {
                    const el = document.getElementById("hrms-menu");
                    if (el) el.classList.toggle("hidden");
                  }
                }}
                className={`w-full flex items-center ${isSidebarCollapsed ? "justify-center gap-1.5" : "justify-between px-2"} py-2 text-[13px] font-bold text-black hover:bg-slate-50 rounded-lg`}
                title="HRMS"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-4.5 h-4.5 rounded-full border-2 border-black flex items-center justify-center shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-black" />
                  </div>
                  {!isSidebarCollapsed && <span>HRMS</span>}
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-black shrink-0" />
              </button>
              {!isSidebarCollapsed && (
                <div id="hrms-menu" className="hidden pl-6 pt-1 space-y-1">
                  {allowedHrisNavigation.map((item) => (
                    <Link key={item.name} href={item.href} className="block py-1 text-xs text-slate-600 hover:text-black font-medium">
                      {item.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* CRM Accordion */}
            <div>
              <button
                onClick={() => {
                  if (isSidebarCollapsed) setIsSidebarCollapsed(false);
                  else {
                    const el = document.getElementById("crm-menu");
                    if (el) el.classList.toggle("hidden");
                  }
                }}
                className={`w-full flex items-center ${isSidebarCollapsed ? "justify-center gap-1.5" : "justify-between px-2"} py-2 text-[13px] font-bold text-black hover:bg-slate-50 rounded-lg`}
                title="CRM"
              >
                <div className="flex items-center gap-2.5">
                  <div className="grid grid-cols-2 gap-0.5 w-4 h-4 border-[1.5px] border-black p-[1px] rounded-[2px] shrink-0">
                    <div className="bg-black"></div>
                    <div className="bg-black"></div>
                    <div className="bg-black"></div>
                    <div className="bg-black"></div>
                  </div>
                  {!isSidebarCollapsed && <span>CRM</span>}
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-black shrink-0" />
              </button>
              {!isSidebarCollapsed && (
                <div id="crm-menu" className="pl-4 pt-1 space-y-1">
                  {allowedMainNavigation.map((item) => {
                    const isActive = item.activeCheck(pathname, activeTabParam);
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={`flex items-center gap-2.5 py-2 px-3 text-xs rounded-lg transition-colors ${
                          isActive
                            ? "bg-[#0C0E28] text-white font-semibold"
                            : "text-slate-700 hover:text-black hover:bg-slate-100 font-normal"
                        }`}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* FINANCE Accordion */}
            <div>
              <button
                onClick={() => {
                  if (isSidebarCollapsed) setIsSidebarCollapsed(false);
                  else {
                    const el = document.getElementById("finance-menu");
                    if (el) el.classList.toggle("hidden");
                  }
                }}
                className={`w-full flex items-center ${isSidebarCollapsed ? "justify-center gap-1.5" : "justify-between px-2"} py-2 text-[13px] font-bold text-black hover:bg-slate-50 rounded-lg`}
                title="FINANCE"
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="h-4.5 w-4.5 text-black shrink-0" />
                  {!isSidebarCollapsed && <span>FINANCE</span>}
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-black shrink-0" />
              </button>
              {!isSidebarCollapsed && (
                <div id="finance-menu" className="hidden pl-6 pt-1 space-y-1">
                  {allowedFinanceNavigation.map((item) => (
                    <Link key={item.name} href={item.href} className="block py-1 text-xs text-slate-600 hover:text-black font-medium">
                      {item.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>
        </div>
      </aside>

      {/* Main content wrapper */}
      <div className={`flex flex-col flex-1 w-full min-h-screen transition-all duration-300 ${isSidebarCollapsed ? "md:pl-20" : "md:pl-64"}`}>
        {/* Top Header Bar */}
        <header className="sticky top-0 z-10 flex-shrink-0 h-14 md:h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 sm:px-8">
          <h1 className="text-xl font-bold text-black tracking-tight">{getActiveTabName()}</h1>
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            {/* Notification Bell */}
            <NotificationBell />

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-1 shrink-0"
                title={currentUser?.name}
              >
                <span className="h-8 w-8 rounded-full bg-[#001D4A] text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {userInitials}
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${isUserMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {isUserMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setIsUserMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-40 p-1.5 animate-fade-in">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="text-xs font-bold text-slate-800 truncate">{currentUser?.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">{currentUser?.email}</p>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-3 py-2 mt-1 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
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
        <main className="flex-1 px-3 sm:px-6 lg:px-8 pt-2 sm:pt-4 pb-24 md:pb-8 bg-slate-50/50 overflow-y-auto">
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
