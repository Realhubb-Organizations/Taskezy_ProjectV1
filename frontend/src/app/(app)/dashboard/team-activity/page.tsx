"use client";

import React, { useEffect, useState } from "react";
import { apiGetPresence, ApiPresenceRow } from "@/lib/apiClient";
import PresenceDot from "@/components/PresenceDot";
import { Radio } from "lucide-react";

const POLL_INTERVAL_MS = 15_000;

function timeAgo(ms: number | null): string {
  if (ms === null) return "never";
  const diffMin = Math.round((Date.now() - ms) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

const SECTIONS: { status: ApiPresenceRow["status"]; label: string }[] = [
  { status: "active", label: "Active" },
  { status: "idle", label: "Idle" },
  { status: "offline", label: "Offline" }
];

export default function TeamActivityPage() {
  const [rows, setRows] = useState<ApiPresenceRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchPresence = () => {
      apiGetPresence().then((data) => { if (!cancelled) setRows(data); }).catch(() => { /* keep showing the last known state */ });
    };
    fetchPresence();
    const interval = setInterval(fetchPresence, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 rounded-2xl flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-700">
          <Radio size={18} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">Team Activity</h2>
          <p className="text-xs text-slate-500">Who has the app open right now — updates every 15 seconds.</p>
        </div>
      </div>

      {rows === null ? (
        <div className="glass-card p-6 rounded-2xl text-sm text-slate-500">Loading...</div>
      ) : (
        SECTIONS.map(({ status, label }) => {
          const people = rows.filter((r) => r.status === status);
          return (
            <div key={status} className="glass-card p-6 rounded-2xl">
              <h3 className="text-sm font-bold text-slate-700 mb-3">{label} ({people.length})</h3>
              {people.length === 0 ? (
                <p className="text-xs text-slate-400">Nobody here.</p>
              ) : (
                <ul className="space-y-2">
                  {people.map((p) => (
                    <li key={p.userId} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <PresenceDot status={p.status} />
                        <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                        <span className="text-[10px] uppercase font-bold text-slate-400">{p.role}</span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {status === "active" ? "active now" : `last active ${timeAgo(p.lastActiveAt)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
