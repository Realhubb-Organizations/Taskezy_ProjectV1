"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { useApp, Notification } from "@/context/AppContext";

const SHOW_MS = 6000;
const MAX_STACK = 3;

// Pops a banner at the top of the screen for each notification that arrives
// while the app is open (web and mobile app). On Android a push that lands
// while the app is in the foreground is not shown as a system popup, so
// without this a new lead/reminder only showed up as a bell badge.
// Tapping a banner opens it the same way the bell's list does.
export default function NotificationPopup() {
  const { notifications, markNotificationRead } = useApp();
  const router = useRouter();
  const [popups, setPopups] = useState<Notification[]>([]);
  const [mounted, setMounted] = useState(false);
  // Everything already in the list when this mounts is old news.
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(notifications.map(n => n.id));
      return;
    }
    const fresh = notifications.filter(n => !seen.current!.has(n.id) && !n.read);
    if (fresh.length === 0) return;
    fresh.forEach(n => seen.current!.add(n.id));
    setPopups(prev => [...fresh, ...prev].slice(0, MAX_STACK));
    fresh.forEach(n => setTimeout(() => setPopups(prev => prev.filter(p => p.id !== n.id)), SHOW_MS));
  }, [notifications]);

  const dismiss = (id: string) => setPopups(prev => prev.filter(p => p.id !== id));

  const open = (n: Notification) => {
    dismiss(n.id);
    markNotificationRead(n.id);
    if (n.system === "CRM" && n.leadId) router.push(`/dashboard/crm?openLead=${n.leadId}`);
    else if (n.link) router.push(n.link);
  };

  if (!mounted || popups.length === 0) return null;

  return createPortal(
    <div
      className="fixed z-[450] left-3 right-3 sm:left-auto sm:right-4 sm:w-96 flex flex-col gap-2 pointer-events-none"
      style={{ top: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
      aria-live="polite"
    >
      {popups.map(n => (
        <div
          key={n.id}
          role="status"
          className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-xl animate-slide-down"
        >
          <button type="button" onClick={() => open(n)} className="flex items-start gap-3 min-w-0 flex-1 text-left">
            <span className="h-8 w-8 rounded-lg bg-[#EEF1FB] text-[#0B1E6E] flex items-center justify-center shrink-0">
              <Bell className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-bold text-slate-900 truncate">{n.title}</span>
              <span className="block text-[11px] text-slate-600 line-clamp-2">{n.message}</span>
            </span>
          </button>
          <button type="button" onClick={() => dismiss(n.id)} className="text-slate-400 hover:text-slate-700 shrink-0 p-0.5" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}
