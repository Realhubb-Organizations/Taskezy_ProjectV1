"use client";

import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, PieChart, Pie, Cell } from "recharts";
import { Lead } from "@/context/AppContext";

export type DashboardDateRange = "today" | "yesterday" | "week" | "month" | "all";

// Pie palette drawn from the design's 3D pie reference (orange / blue /
// yellow / sky / pink / magenta), ordered so every neighbouring slice —
// including the last→first wrap — stays distinguishable for colour-blind
// viewers (validated with the dataviz palette checker). Anything past six
// statuses folds into a neutral "Other" slice rather than a generated hue.
const PIE_COLORS = ["#E8792A", "#4863CF", "#D9A514", "#1E96D6", "#E0406F", "#A93AB3"];
const OTHER_COLOR = "#94A3B8";
const LINE_COLOR = "#6D3FD9";

const formatInrCompact = (v: number) => {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${Math.round(v)}`;
};
const formatInr = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

const lighten = (hex: string, amount: number) => {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
};

// Compact white-panel dropdown matching the app's other portal menus (a
// native <select> popup renders dark on macOS/Chrome and clashes).
function MiniSelect({ value, options, allLabel, onChange }: { value: string; options: string[]; allLabel: string; onChange: (v: string) => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const width = 176;
  return (
    <>
      <button
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPos(p => (p ? null : { top: rect.bottom + 4, left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) }));
        }}
        className="inline-flex items-center gap-1.5 border border-slate-200 rounded-md px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 max-w-[140px]"
      >
        <span className="truncate">{value || allLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
      </button>
      {pos && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setPos(null)} />
          <div className="fixed z-[70] bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 max-h-60 overflow-y-auto" style={{ top: pos.top, left: pos.left, width }}>
            {["", ...options].map(opt => (
              <button
                key={opt || "__all"}
                onClick={() => { onChange(opt); setPos(null); }}
                className={`w-full text-left px-3 py-1.5 text-xs font-semibold truncate transition-colors ${
                  value === opt ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {opt || allLabel}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

// Time buckets for the trend line, sized to the dashboard's Date Range:
// hourly for a single day, daily for a week/month, monthly for all time.
function buildBuckets(range: DashboardDateRange, leads: Lead[], now: Date) {
  const buckets: { key: string; label: string }[] = [];
  const keyFor = (d: Date): string => {
    if (range === "today" || range === "yesterday") return String(d.getHours());
    if (range === "all") return `${d.getFullYear()}-${d.getMonth()}`;
    return d.toDateString();
  };

  if (range === "today" || range === "yesterday") {
    for (let h = 0; h < 24; h++) {
      buckets.push({ key: String(h), label: new Date(2000, 0, 1, h).toLocaleTimeString("en-IN", { hour: "numeric", hour12: true }) });
    }
  } else if (range === "week" || range === "month") {
    const start = range === "week"
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
      buckets.push({ key: d.toDateString(), label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) });
    }
  } else {
    const times = leads.map(l => new Date(l.createdAtStr || "").getTime()).filter(t => !isNaN(t));
    const first = times.length ? new Date(Math.min(...times)) : now;
    for (let d = new Date(first.getFullYear(), first.getMonth(), 1); d <= now; d.setMonth(d.getMonth() + 1)) {
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) });
    }
  }
  return { buckets, keyFor };
}

// Admin / Manager dashboard only — deal-value trend + lead status mix for
// the leads already filtered to the page's Date Range.
export default function LeadInsightsCharts({ leads, dateRange, agents }: { leads: Lead[]; dateRange: DashboardDateRange; agents: string[] }) {
  const [lineAgent, setLineAgent] = useState("");
  const [lineStatus, setLineStatus] = useState("");
  const [pieAgent, setPieAgent] = useState("");
  const [pieStatus, setPieStatus] = useState("");

  const statusOptions = useMemo(() => Array.from(new Set(leads.map(l => l.status))).sort(), [leads]);

  const trend = useMemo(() => {
    const now = new Date();
    const { buckets, keyFor } = buildBuckets(dateRange, leads, now);
    const totals = new Map(buckets.map(b => [b.key, 0]));
    for (const l of leads) {
      if (lineAgent && l.assignedAgent !== lineAgent) continue;
      if (lineStatus && l.status !== lineStatus) continue;
      const d = new Date(l.createdAtStr || "");
      if (isNaN(d.getTime())) continue;
      const k = keyFor(d);
      if (totals.has(k)) totals.set(k, (totals.get(k) || 0) + (l.dealValue || 0));
    }
    const data = buckets.map(b => ({ label: b.label, value: totals.get(b.key) || 0 }));
    const sum = data.reduce((s, p) => s + p.value, 0);
    return { data, sum, average: data.length ? sum / data.length : 0 };
  }, [leads, dateRange, lineAgent, lineStatus]);

  const pie = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of leads) {
      if (pieAgent && l.assignedAgent !== pieAgent) continue;
      if (pieStatus && l.status !== pieStatus) continue;
      counts.set(l.status, (counts.get(l.status) || 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const slices = sorted.slice(0, PIE_COLORS.length).map(([name, value], i) => ({ name, value, color: PIE_COLORS[i] }));
    const rest = sorted.slice(PIE_COLORS.length).reduce((s, [, v]) => s + v, 0);
    if (rest > 0) slices.push({ name: "Other", value: rest, color: OTHER_COLOR });
    const total = slices.reduce((s, x) => s + x.value, 0);
    return { slices, total };
  }, [leads, pieAgent, pieStatus]);

  const cardClass = "bg-white rounded-2xl shadow-md p-5";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] gap-4">
      {/* Deal value trend */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Deal Value</h3>
            <p className="text-[11px] text-slate-500">{formatInr(trend.sum)} total · dashed line = average</p>
          </div>
          <div className="flex items-center gap-2">
            <MiniSelect value={lineAgent} options={agents} allLabel="All Agents" onChange={setLineAgent} />
            <MiniSelect value={lineStatus} options={statusOptions} allLabel="Status" onChange={setLineStatus} />
          </div>
        </div>
        {trend.sum === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-xs text-slate-400 italic">
            No deal value recorded for this range.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={formatInrCompact} width={56} />
              <Tooltip
                formatter={(v) => [formatInr(Number(v)), "Deal value"]}
                labelStyle={{ fontSize: 11, fontWeight: 600 }}
                contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: "#e2e8f0" }}
                cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
              />
              <ReferenceLine y={trend.average} stroke="#94a3b8" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="value" stroke={LINE_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Lead status mix */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Lead Status</h3>
            <p className="text-[11px] text-slate-500">{pie.total} lead{pie.total === 1 ? "" : "s"}</p>
          </div>
          <div className="flex items-center gap-2">
            <MiniSelect value={pieAgent} options={agents} allLabel="All Agents" onChange={setPieAgent} />
            <MiniSelect value={pieStatus} options={statusOptions} allLabel="Status" onChange={setPieStatus} />
          </div>
        </div>
        {pie.total === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-xs text-slate-400 italic">
            No leads in this range.
          </div>
        ) : (
          <>
            <div style={{ filter: "drop-shadow(0 6px 10px rgba(15, 23, 42, 0.18))" }}>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  {/* Per-slice light→base gradient for the reference's glossy, 3D look */}
                  <defs>
                    {pie.slices.map((s, i) => (
                      <linearGradient key={s.name} id={`lead-pie-${i}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={lighten(s.color, 0.35)} />
                        <stop offset="100%" stopColor={s.color} />
                      </linearGradient>
                    ))}
                  </defs>
                  <Pie data={pie.slices} dataKey="value" nameKey="name" outerRadius="92%" startAngle={90} endAngle={-270} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                    {pie.slices.map((s, i) => <Cell key={s.name} fill={`url(#lead-pie-${i})`} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v, name) => [`${v} (${Math.round((Number(v) / pie.total) * 100)}%)`, String(name)]}
                    contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: "#e2e8f0" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
              {pie.slices.map(s => (
                <li key={s.name} className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                  <span className="text-slate-600 truncate" title={s.name}>{s.name}</span>
                  <span className="ml-auto text-slate-800 font-semibold tabular-nums">{s.value}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
