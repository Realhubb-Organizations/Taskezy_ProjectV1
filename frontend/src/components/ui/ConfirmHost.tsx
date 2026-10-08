"use client";

import { useEffect, useState } from "react";
import { subscribeConfirm, resolveConfirm, type ConfirmOptions } from "@/lib/confirmDialog";

export default function ConfirmHost() {
  const [req, setReq] = useState<(ConfirmOptions & { id: string }) | null>(null);
  useEffect(() => subscribeConfirm(setReq), []);

  if (!req) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={() => resolveConfirm(false)} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm p-5 animate-toast-in">
        {req.title && <h3 className="text-sm font-extrabold text-slate-900 mb-1.5">{req.title}</h3>}
        <p className="text-xs text-slate-600 leading-relaxed">{req.message}</p>
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={() => resolveConfirm(false)}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            {req.cancelLabel || "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => resolveConfirm(true)}
            className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-colors ${
              req.danger ? "bg-red-600 hover:bg-red-700" : "bg-[#0B1E6E] hover:bg-[#0a1a5e]"
            }`}
          >
            {req.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
