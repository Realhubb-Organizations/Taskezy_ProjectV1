"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, UserPlus, AlarmClock, Briefcase, DollarSign, ChevronLeft, ChevronDown, Repeat, AlertTriangle } from "lucide-react";
import { useApp, getAvailableSystems, Notification, NotificationCategory, SystemType } from "@/context/AppContext";

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function categoryIcon(category: NotificationCategory) {
  switch (category) {
    case "NEW_LEAD":
      return UserPlus;
    case "REMINDER":
      return AlarmClock;
    case "REASSIGNMENT":
      return Repeat;
    case "MISSED_SLA":
      return AlertTriangle;
    case "REGULARIZATION":
    case "ATTENDANCE":
    case "LEAVE":
      return Briefcase;
    case "INVOICE":
    case "CLAIM":
    case "KYC":
      return DollarSign;
    default:
      return Bell;
  }
}

const sortDesc = (a: Notification, b: Notification) =>
  new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();

interface NotificationGroup {
  key: string;
  label: string;
  emptyText: string;
  items: Notification[];
}

export default function NotificationBell() {
  const { notifications, currentUser, activeSystem, markNotificationRead } = useApp();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [activeGroupKey, setActiveGroupKey] = useState<string>("");

  // Anyone whose account spans more than one system — admins (CRM/HRMS/
  // Finance), and SALES agents/managers (CRM/HRMS) — gets a scope picker
  // here instead of one long row of tabs. A user scoped to a single system
  // (TECH/MARKETING → HRMS only, FINANCE dept → HRMS/Finance) sees no
  // picker and the bell just shows their one system. Finance never appears
  // for someone without Finance access, since getAvailableSystems already
  // excludes it for them.
  const availableScopes = useMemo(
    () => getAvailableSystems(currentUser).filter((s): s is Exclude<SystemType, "ADMIN"> => s !== "ADMIN"),
    [currentUser]
  );
  const showScopePicker = availableScopes.length > 1;
  const [systemScope, setSystemScope] = useState<Exclude<SystemType, "ADMIN">>("CRM");
  const [scopeDropdownOpen, setScopeDropdownOpen] = useState(false);

  // Keep the picker's selection valid as the available scopes change (e.g. on login).
  useEffect(() => {
    if (availableScopes.length && !availableScopes.includes(systemScope)) {
      setSystemScope(availableScopes[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableScopes]);

  const effectiveScope: SystemType = showScopePicker ? systemScope : (availableScopes[0] || activeSystem);

  const scopedNotifications = showScopePicker
    ? notifications.filter(n => availableScopes.includes(n.system as Exclude<SystemType, "ADMIN">))
    : notifications.filter(n => n.system === effectiveScope);
  const unreadCount = scopedNotifications.filter(n => !n.read).length;

  const newLeads = useMemo(
    () => notifications.filter(n => n.system === "CRM" && n.category === "NEW_LEAD").sort(sortDesc),
    [notifications]
  );
  const reminders = useMemo(
    () => notifications.filter(n => n.system === "CRM" && n.category === "REMINDER").sort(sortDesc),
    [notifications]
  );
  // Catch-all for every other CRM category (reassignment, KYC, invoice,
  // missed-SLA, general) — without this, anything outside New Leads/Reminders
  // was silently unreachable in the CRM view even though it was delivered.
  const crmActivity = useMemo(
    () => notifications.filter(n => n.system === "CRM" && n.category !== "NEW_LEAD" && n.category !== "REMINDER").sort(sortDesc),
    [notifications]
  );
  const hrmsNotifs = useMemo(
    () => notifications.filter(n => n.system === "HRMS").sort(sortDesc),
    [notifications]
  );
  const financeNotifs = useMemo(
    () => notifications.filter(n => n.system === "FINANCE").sort(sortDesc),
    [notifications]
  );

  // Scoped to effectiveScope (the admin's CRM/HRMS/Finance picker, or the
  // only system a non-admin user has) rather than raw activeSystem — CRM is
  // the only scope with real sub-categories, so it's the only one that gets
  // a second-level tab row; HRMS/Finance are a single flat list each.
  const groups: NotificationGroup[] = useMemo(() => {
    if (effectiveScope === "CRM") {
      return [
        { key: "new-leads", label: "New Leads", emptyText: "No new leads right now.", items: newLeads },
        { key: "reminders", label: "Reminder Alerts", emptyText: "No reminders scheduled.", items: reminders },
        { key: "activity", label: "Activity Alerts", emptyText: "No other alerts.", items: crmActivity }
      ];
    }
    if (effectiveScope === "HRMS") {
      return [{ key: "hrms", label: "HRMS", emptyText: "No HRMS notifications.", items: hrmsNotifs }];
    }
    return [{ key: "finance", label: "Finance", emptyText: "No finance notifications.", items: financeNotifs }];
  }, [effectiveScope, newLeads, reminders, crmActivity, hrmsNotifs, financeNotifs]);

  // Keep the selected sub-tab valid whenever the scope (or panel) changes
  useEffect(() => {
    if (!groups.some(g => g.key === activeGroupKey)) {
      setActiveGroupKey(groups[0]?.key || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveScope, isOpen]);

  const activeGroup = groups.find(g => g.key === activeGroupKey) || groups[0];

  const handleItemClick = (n: Notification) => {
    markNotificationRead(n.id);
    setIsOpen(false);
    if (n.system === "CRM" && n.leadId) {
      router.push(`/dashboard/crm?openLead=${n.leadId}`);
    } else if (n.link) {
      router.push(n.link);
    }
  };

  const renderItem = (n: Notification) => {
    const Icon = categoryIcon(n.category);
    return (
      <button
        key={n.id}
        onClick={() => handleItemClick(n)}
        className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0 ${
          !n.read ? "bg-brand-50/30" : ""
        }`}
      >
        <div
          className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border ${
            !n.read ? "bg-brand-50 border-brand-100 text-brand-600" : "bg-slate-50 border-slate-200 text-slate-400"
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-xs font-bold truncate ${!n.read ? "text-slate-850" : "text-slate-600"}`}>{n.title}</p>
            {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-brand-600 shrink-0" />}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
          <p className="text-[9px] text-slate-400 font-semibold mt-1">{timeAgo(n.timestamp)}</p>
        </div>
      </button>
    );
  };

  const scopeLabel = (s: SystemType) => (s === "FINANCE" ? "Finance" : s);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="relative p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Full-height right-docked drawer — same createPortal + slide-in
          pattern as the Filter drawer elsewhere in this app, instead of a
          small anchored dropdown. */}
      {isOpen && createPortal(
        <div className="fixed inset-0 z-[100]">
          <div className="fixed inset-0 bg-slate-900/20" onClick={() => setIsOpen(false)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-white border-l border-slate-200 shadow-2xl flex flex-col animate-slide-in">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0 gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-800 -ml-1.5 p-1 shrink-0">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <h3 className="text-base font-extrabold text-slate-900 shrink-0">Notifications</h3>
              </div>
              {/* System scope picker — anyone with more than one system
                  (admins across CRM/HRMS/Finance, SALES agents/managers
                  across CRM/HRMS) gets it here; a single-system user does
                  not. Sits where the old "Mark all read" action used to be. */}
              {showScopePicker && (
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setScopeDropdownOpen(o => !o)}
                    className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 rounded-lg pl-2 pr-1.5 py-1 text-[11px] font-bold text-slate-700 transition-colors"
                  >
                    {scopeLabel(systemScope)}
                    <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${scopeDropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {scopeDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-[105]" onClick={() => setScopeDropdownOpen(false)} />
                      <div className="absolute right-0 top-full mt-1.5 w-32 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-[110] overflow-hidden">
                        {availableScopes.map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => { setSystemScope(s); setScopeDropdownOpen(false); }}
                            className={`w-full text-left px-3 py-1.5 text-xs font-bold transition-colors ${
                              systemScope === s ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {scopeLabel(s)}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Sub-tab filter (CRM only, e.g. New Leads/Reminder/Activity) —
                segmented pill tabs, same toggle-switcher style as the Data
                Calling page's tab bar, instead of a native select. */}
            {groups.length > 1 && (
              <div className="px-5 pt-3 pb-1 shrink-0">
                <div className="bg-slate-200/70 p-1 rounded-xl flex items-center gap-1">
                  {groups.map(g => (
                    <button
                      key={g.key}
                      onClick={() => setActiveGroupKey(g.key)}
                      className={`flex-1 min-w-0 px-1.5 py-1.5 rounded-lg text-[9px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis transition-all ${
                        activeGroupKey === g.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {g.label}{g.items.length > 0 ? ` (${g.items.length})` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Active group content */}
            <div className="flex-1 overflow-y-auto">
              {!activeGroup || activeGroup.items.length === 0 ? (
                <p className="px-4 py-6 text-center text-[11px] text-slate-400 italic">
                  {activeGroup?.emptyText || "No notifications."}
                </p>
              ) : (
                activeGroup.items.map(renderItem)
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
