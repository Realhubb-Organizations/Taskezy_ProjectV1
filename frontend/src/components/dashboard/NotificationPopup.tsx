"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlarmClock, Bell, Repeat, UserPlus, X } from "lucide-react";
import { useApp, Notification } from "@/context/AppContext";

// iOS-style notification banners for notifications that arrive while the app
// (web or mobile) is open:
//   • bundled by type — a burst of new leads is ONE stacked card ("+4 more"),
//     never a pile of cards covering the screen;
//   • "liquid glass" look (frosted, see-through, light edge) with springy
//     motion;
//   • slides away on its own after SHOW_MS (paused while hovered/expanded),
//     or swipe it up / tap ✕;
//   • tap a bundle to expand it, tap an item to open it (same as the bell).
// Only notifications created in the last minute pop up, so a backlog
// arriving right after login stays in the bell instead of flooding in.

const SHOW_MS = 4000;
const LEAVE_MS = 320;
const MAX_GROUPS = 2;
const FRESH_WINDOW_MS = 60_000;
const SWIPE_DISMISS_PX = 36;

type GroupKey = "leads" | "reminders" | "reassigned" | "activity";
const GROUPS: Record<GroupKey, { label: string; icon: React.ElementType; tint: string }> = {
  leads: { label: "New Leads", icon: UserPlus, tint: "text-[#4F46E5]" },
  reminders: { label: "Reminders", icon: AlarmClock, tint: "text-amber-600" },
  reassigned: { label: "Reassigned to you", icon: Repeat, tint: "text-sky-600" },
  activity: { label: "Activity", icon: Bell, tint: "text-[#0B1E6E]" }
};
const groupOf = (n: Notification): GroupKey =>
  n.category === "NEW_LEAD" ? "leads" : n.category === "REMINDER" ? "reminders" : n.category === "REASSIGNMENT" ? "reassigned" : "activity";

interface Bundle {
  key: GroupKey;
  items: Notification[]; // newest first
  leaving: boolean;
}

export default function NotificationPopup() {
  const { notifications, markNotificationRead } = useApp();
  const router = useRouter();
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [expanded, setExpanded] = useState<GroupKey | null>(null);
  const [hovered, setHovered] = useState<GroupKey | null>(null);
  const [mounted, setMounted] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const timers = useRef<Partial<Record<GroupKey, ReturnType<typeof setTimeout>>>>({});
  const drag = useRef<{ key: GroupKey; startY: number; dy: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ key: GroupKey; dy: number } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const leave = (key: GroupKey) => {
    clearTimeout(timers.current[key]);
    delete timers.current[key];
    setBundles(prev => prev.map(b => (b.key === key ? { ...b, leaving: true } : b)));
    setTimeout(() => setBundles(prev => prev.filter(b => b.key !== key)), LEAVE_MS);
    setExpanded(e => (e === key ? null : e));
  };

  const armTimer = (key: GroupKey) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => leave(key), SHOW_MS);
  };

  // New arrivals → into their type's bundle (newest bundle on top).
  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(notifications.map(n => n.id));
      return;
    }
    const now = Date.now();
    const fresh = notifications.filter(n => {
      if (seen.current!.has(n.id)) return false;
      seen.current!.add(n.id);
      const t = new Date(n.timestamp).getTime();
      return !n.read && (isNaN(t) || now - t < FRESH_WINDOW_MS);
    });
    if (fresh.length === 0) return;
    // Worked out here, not inside the setBundles updater — React runs that
    // later, so keys collected there were still empty when the timers were
    // armed below and the banner never left.
    const touched = new Set<GroupKey>(fresh.map(groupOf));
    setBundles(prev => {
      let next = [...prev];
      for (const n of [...fresh].reverse()) {
        const key = groupOf(n);
        const existing = next.find(b => b.key === key);
        const updated: Bundle = { key, items: [n, ...(existing && !existing.leaving ? existing.items : [])], leaving: false };
        next = [updated, ...next.filter(b => b.key !== key)];
      }
      return next.slice(0, MAX_GROUPS);
    });
    touched.forEach(key => armTimer(key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifications]);

  // Pause auto-hide while a bundle is expanded or hovered.
  useEffect(() => {
    bundles.forEach(b => {
      if (b.leaving) return;
      if (b.key === expanded || b.key === hovered) {
        clearTimeout(timers.current[b.key]);
        delete timers.current[b.key];
      } else if (!timers.current[b.key]) {
        armTimer(b.key);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, hovered]);

  useEffect(() => () => Object.values(timers.current).forEach(t => clearTimeout(t)), []);

  const openItem = (n: Notification) => {
    leave(groupOf(n));
    markNotificationRead(n.id);
    if (n.system === "CRM" && n.leadId) router.push(`/dashboard/crm?openLead=${n.leadId}`);
    else if (n.link) router.push(n.link);
  };

  const onCardTap = (b: Bundle) => {
    if (b.items.length === 1) openItem(b.items[0]);
    else setExpanded(e => (e === b.key ? null : b.key));
  };

  // Swipe up to dismiss.
  const onPointerDown = (key: GroupKey) => (e: React.PointerEvent) => {
    drag.current = { key, startY: e.clientY, dy: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dy = Math.min(0, e.clientY - drag.current.startY);
    drag.current.dy = dy;
    if (dy < -4) setDragOffset({ key: drag.current.key, dy });
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragOffset(null);
    if (d && d.dy < -SWIPE_DISMISS_PX) leave(d.key);
  };

  if (!mounted || bundles.length === 0) return null;

  return createPortal(
    <div
      className="fixed z-[450] left-2.5 right-2.5 sm:left-auto sm:right-4 sm:w-[380px] flex flex-col gap-3 pointer-events-none"
      style={{ top: "calc(0.6rem + env(safe-area-inset-top, 0px))" }}
      aria-live="polite"
    >
      {bundles.map(b => {
        const meta = GROUPS[b.key];
        const Icon = meta.icon;
        const top = b.items[0];
        const more = b.items.length - 1;
        const isOpen = expanded === b.key;
        const dy = dragOffset?.key === b.key ? dragOffset.dy : 0;
        return (
          <div
            key={b.key}
            className={`relative pointer-events-auto touch-pan-x ${b.leaving ? "animate-liquid-out" : "animate-liquid-in"}`}
            style={dy ? { transform: `translateY(${dy}px)`, opacity: Math.max(0.3, 1 + dy / 120), transition: "none" } : undefined}
            // Hover pauses auto-hide for a real mouse only — on phones a tap
            // also "hovers" and never un-hovers, which would pin the banner.
            onPointerEnter={(e) => { if (e.pointerType === "mouse") setHovered(b.key); }}
            onPointerLeave={(e) => { if (e.pointerType === "mouse") setHovered(h => (h === b.key ? null : h)); }}
            onPointerDown={onPointerDown(b.key)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* Stack effect: ghost cards peeking out under a collapsed bundle */}
            {!isOpen && more > 0 && (
              <>
                {more > 1 && <div aria-hidden="true" className="liquid-glass-ghost absolute inset-x-7 -bottom-[18px] h-10 rounded-[18px] opacity-75" />}
                <div aria-hidden="true" className="liquid-glass-ghost absolute inset-x-3.5 -bottom-[9px] h-10 rounded-[20px]" />
              </>
            )}

            <div className="liquid-glass relative rounded-[22px] overflow-hidden">
              <div className="flex items-start gap-3 px-3.5 pt-3 pb-3">
                <button type="button" onClick={() => onCardTap(b)} className="flex items-start gap-3 min-w-0 flex-1 text-left">
                  <span className={`h-9 w-9 rounded-xl bg-white/70 shadow-sm flex items-center justify-center shrink-0 ${meta.tint}`}>
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 truncate">{meta.label}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">now</span>
                    </span>
                    <span className="block text-[13px] font-semibold text-slate-900 truncate">{top.title}</span>
                    <span className="block text-xs text-slate-600 line-clamp-2">{top.message}</span>
                    {more > 0 && !isOpen && (
                      <span className="mt-1 inline-block text-[11px] font-semibold text-[#0B1E6E]">+{more} more · tap to see</span>
                    )}
                  </span>
                </button>
                <button type="button" onClick={() => leave(b.key)} className="h-6 w-6 rounded-full bg-white/60 text-slate-500 hover:text-slate-800 flex items-center justify-center shrink-0" aria-label="Dismiss">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Expanded bundle: every notification in it, newest first */}
              {isOpen && (
                <ul className="border-t border-white/50 max-h-[50vh] overflow-y-auto animate-liquid-expand">
                  {b.items.slice(1).map(n => (
                    <li key={n.id}>
                      <button type="button" onClick={() => openItem(n)} className="w-full text-left px-4 py-2.5 hover:bg-white/40 transition-colors border-b border-white/40 last:border-b-0">
                        <span className="block text-xs font-semibold text-slate-900 truncate">{n.title}</span>
                        <span className="block text-[11px] text-slate-600 line-clamp-1">{n.message}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>,
    document.body
  );
}
