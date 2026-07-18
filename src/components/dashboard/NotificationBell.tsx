"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Bell, UserPlus, AlarmClock, Briefcase, DollarSign, Check, ChevronDown } from "lucide-react";
import { useApp, Notification, NotificationCategory } from "@/context/AppContext";

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
  const { notifications, activeSystem, markNotificationRead, markAllNotificationsRead } = useApp();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [activeGroupKey, setActiveGroupKey] = useState<string>("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const scopedNotifications = activeSystem === "ADMIN"
    ? notifications
    : notifications.filter(n => n.system === activeSystem);
  const unreadCount = scopedNotifications.filter(n => !n.read).length;

  const newLeads = useMemo(
    () => notifications.filter(n => n.system === "CRM" && n.category === "NEW_LEAD").sort(sortDesc),
    [notifications]
  );
  const reminders = useMemo(
    () => notifications.filter(n => n.system === "CRM" && n.category === "REMINDER").sort(sortDesc),
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

  const groups: NotificationGroup[] = useMemo(() => {
    if (activeSystem === "CRM") {
      return [
        { key: "new-leads", label: "New Leads", emptyText: "No new leads right now.", items: newLeads },
        { key: "reminders", label: "Reminder Alerts", emptyText: "No reminders scheduled.", items: reminders }
      ];
    }
    if (activeSystem === "ADMIN") {
      return [
        { key: "new-leads", label: "CRM · New Leads", emptyText: "No new leads.", items: newLeads },
        { key: "reminders", label: "CRM · Reminder Alerts", emptyText: "No reminders.", items: reminders },
        { key: "hrms", label: "HRMS", emptyText: "No HRMS notifications.", items: hrmsNotifs },
        { key: "finance", label: "Finance", emptyText: "No finance notifications.", items: financeNotifs }
      ];
    }
    if (activeSystem === "HRMS") {
      return [{ key: "hrms", label: "HRMS Alerts", emptyText: "No HRMS notifications.", items: hrmsNotifs }];
    }
    if (activeSystem === "FINANCE") {
      return [{ key: "finance", label: "Finance Alerts", emptyText: "No finance notifications.", items: financeNotifs }];
    }
    return [];
  }, [activeSystem, newLeads, reminders, hrmsNotifs, financeNotifs]);

  // Keep the selected dropdown group valid whenever the system context (or panel) changes
  useEffect(() => {
    if (!groups.some(g => g.key === activeGroupKey)) {
      setActiveGroupKey(groups[0]?.key || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSystem, isOpen]);

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

  const panelTitle =
    activeSystem === "CRM" ? "CRM Notifications" :
    activeSystem === "HRMS" ? "HRMS Notifications" :
    activeSystem === "FINANCE" ? "Finance Notifications" :
    "Global Notification Center";

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
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

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-xs font-extrabold text-slate-800">{panelTitle}</h3>
            <button
              onClick={() => markAllNotificationsRead(activeSystem === "ADMIN" ? undefined : activeSystem)}
              className="text-[10px] font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              <Check className="h-3 w-3" /> Mark all read
            </button>
          </div>

          {/* Group selector dropdown */}
          {groups.length > 1 && (
            <div className="px-4 py-2.5 border-b border-slate-100 bg-white">
              <div className="relative">
                <select
                  value={activeGroupKey}
                  onChange={(e) => setActiveGroupKey(e.target.value)}
                  className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-brand-500"
                >
                  {groups.map(g => (
                    <option key={g.key} value={g.key}>
                      {g.label} {g.items.length > 0 ? `(${g.items.length})` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Active group content */}
          <div className="max-h-[24rem] overflow-y-auto">
            {!activeGroup || activeGroup.items.length === 0 ? (
              <p className="px-4 py-6 text-center text-[11px] text-slate-400 italic">
                {activeGroup?.emptyText || "No notifications."}
              </p>
            ) : (
              activeGroup.items.map(renderItem)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
