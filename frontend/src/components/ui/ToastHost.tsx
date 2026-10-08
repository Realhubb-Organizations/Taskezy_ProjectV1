"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { subscribeToasts, dismissToast, type ToastItem, type ToastKind } from "@/lib/toast";

const STYLES: Record<ToastKind, { Icon: typeof CheckCircle2; iconBg: string; iconColor: string; bar: string }> = {
  success: { Icon: CheckCircle2, iconBg: "bg-emerald-50", iconColor: "text-emerald-600", bar: "bg-emerald-500" },
  error: { Icon: XCircle, iconBg: "bg-red-50", iconColor: "text-red-600", bar: "bg-red-500" },
  warning: { Icon: AlertTriangle, iconBg: "bg-amber-50", iconColor: "text-amber-600", bar: "bg-amber-500" },
  info: { Icon: Info, iconBg: "bg-blue-50", iconColor: "text-brand-600", bar: "bg-brand-500" }
};

// Mounted once near the root (see app/layout.tsx). Renders nothing until a
// toast exists, so it costs nothing on every other page.
export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;

  return (
    <div className="fixed z-[9999] top-10 left-1/2 -translate-x-1/2 flex flex-col gap-2 w-[calc(100%-2rem)] sm:w-96 pointer-events-none">
      {items.map((t) => {
        const s = STYLES[t.kind];
        return (
          <div
            key={t.id}
            className="pointer-events-auto bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden animate-toast-in"
          >
            <div className="flex items-start gap-3 p-3.5">
              <span className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${s.iconBg} ${s.iconColor}`}>
                <s.Icon className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-xs font-bold text-slate-800">{t.title}</p>
                {t.message && <p className="text-xs text-slate-500 mt-0.5">{t.message}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss"
                className="shrink-0 text-slate-400 hover:text-slate-600 -mt-1 -mr-1 p-1.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {t.duration > 0 && (
              <div
                className={`h-0.5 ${s.bar} opacity-60 animate-toast-shrink`}
                style={{ animationDuration: `${t.duration}ms` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
