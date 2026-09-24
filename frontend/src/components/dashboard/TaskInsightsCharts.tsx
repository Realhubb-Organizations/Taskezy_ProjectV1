"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, PieChart, Pie, Cell } from "recharts";
import { Lead, FollowupCall } from "@/context/AppContext";
import { buildSalesPendingTasks, PendingTask, TaskBucket } from "@/lib/salesPendingTasks";

// Slice colors sampled straight from the design's 3D pie reference, in the
// same clockwise order they appear there (yellow → blue → sky → magenta →
// red → pink → orange). Task types past seven fold into a neutral "Other".
const PIE_COLORS = ["#FFC53D", "#6F9BE0", "#35C2F7", "#D93CB0", "#F23D6A", "#FB5E97", "#FB9F63"];
const OTHER_COLOR = "#94A3B8";
const LINE_COLOR = "#6D3FD9";

const BUCKET_LABELS: Record<TaskBucket, string> = { missed: "Missed", pending: "Pending", upcoming: "Upcoming" };
const STATUS_OPTIONS = Object.values(BUCKET_LABELS);

// Trend window: the last 30 days through the next 7, by task due date.
const DAYS_BACK = 30;
const DAYS_AHEAD = 7;

const shade = (hex: string, amount: number) => {
  // amount > 0 lightens toward white, < 0 darkens toward black
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
};

const filterTasks = (tasks: PendingTask[], agent: string, status: string) =>
  tasks.filter(t =>
    (!agent || t.assignedTo.trim().toLowerCase() === agent.trim().toLowerCase()) &&
    (!status || BUCKET_LABELS[t.bucket] === status)
  );

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

// Admin / Manager dashboard only — the same open-task queue as the All Task
// table above (built by salesPendingTasks.ts), charted: tasks by due date,
// and the split by task type. Each card has its own agent + status filter.
export default function TaskInsightsCharts({ leads, followupCalls, agents }: { leads: Lead[]; followupCalls: FollowupCall[]; agents: string[] }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [lineAgent, setLineAgent] = useState("");
  const [lineStatus, setLineStatus] = useState("");
  const [pieAgent, setPieAgent] = useState("");
  const [pieStatus, setPieStatus] = useState("");

  const tasks = useMemo(() => buildSalesPendingTasks(leads, followupCalls, now), [leads, followupCalls, now]);

  const trend = useMemo(() => {
    const filtered = filterTasks(tasks, lineAgent, lineStatus);
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - DAYS_BACK);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + DAYS_AHEAD);
    const counts = new Map<string, number>();
    const data: { key: string; label: string; tasks: number }[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      data.push({ key: d.toDateString(), label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), tasks: 0 });
      counts.set(d.toDateString(), 0);
    }
    let earlier = 0;
    for (const t of filtered) {
      if (!t.dueAt) continue;
      const k = t.dueAt.toDateString();
      if (counts.has(k)) counts.set(k, (counts.get(k) || 0) + 1);
      else if (t.dueAt < start) earlier += 1;
    }
    for (const p of data) p.tasks = counts.get(p.key) || 0;
    const inWindow = data.reduce((s, p) => s + p.tasks, 0);
    return { data, total: filtered.length, earlier, average: data.length ? inWindow / data.length : 0, todayLabel: now.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) };
  }, [tasks, lineAgent, lineStatus, now]);

  const pie = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of filterTasks(tasks, pieAgent, pieStatus)) counts.set(t.taskType, (counts.get(t.taskType) || 0) + 1);
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const slices = sorted.slice(0, PIE_COLORS.length).map(([name, value], i) => ({ name, value, color: PIE_COLORS[i] }));
    const rest = sorted.slice(PIE_COLORS.length).reduce((s, [, v]) => s + v, 0);
    if (rest > 0) slices.push({ name: "Other", value: rest, color: OTHER_COLOR });
    return { slices, total: slices.reduce((s, x) => s + x.value, 0) };
  }, [tasks, pieAgent, pieStatus]);

  const cardClass = "bg-white rounded-2xl shadow-md p-5";

  // "258 Task" labels just outside each slice, as in the design.
  const renderSliceLabel = (props: { cx?: number; cy?: number; midAngle?: number; outerRadius?: number; value?: number }) => {
    const { cx = 0, cy = 0, midAngle = 0, outerRadius = 0, value = 0 } = props;
    const r = outerRadius + 20;
    const x = cx + r * Math.cos((-midAngle * Math.PI) / 180);
    const y = cy + r * Math.sin((-midAngle * Math.PI) / 180);
    return (
      <text x={x} y={y} textAnchor={x >= cx ? "start" : "end"} dominantBaseline="central" fontSize={10} fontWeight={700} fill="#1e293b">
        {value} Task
      </text>
    );
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] gap-4">
      {/* All Task — open tasks by due date */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">All Task</h3>
            <p className="text-[11px] text-slate-500">
              {trend.total} open task{trend.total === 1 ? "" : "s"} by due date
              {trend.earlier > 0 && ` · ${trend.earlier} due before ${trend.data[0]?.label}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <MiniSelect value={lineAgent} options={agents} allLabel="All Agents" onChange={setLineAgent} />
            <MiniSelect value={lineStatus} options={STATUS_OPTIONS} allLabel="Status" onChange={setLineStatus} />
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={trend.data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              formatter={(v) => [`${v} task${Number(v) === 1 ? "" : "s"}`, "Due"]}
              labelStyle={{ fontSize: 11, fontWeight: 600 }}
              contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: "#e2e8f0" }}
              cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
            />
            <ReferenceLine y={trend.average} stroke="#a5b4fc" strokeDasharray="4 4" />
            <ReferenceLine x={trend.todayLabel} stroke="#cbd5e1" label={{ value: "Today", position: "insideTopRight", fontSize: 10, fill: "#64748b" }} />
            <Line type="monotone" dataKey="tasks" stroke={LINE_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Task split by type — styled after the design's 3D pie */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Task Type</h3>
            <p className="text-[11px] text-slate-500">{pie.total} task{pie.total === 1 ? "" : "s"}</p>
          </div>
          <div className="flex items-center gap-2">
            <MiniSelect value={pieAgent} options={agents} allLabel="All Agents" onChange={setPieAgent} />
            <MiniSelect value={pieStatus} options={STATUS_OPTIONS} allLabel="Status" onChange={setPieStatus} />
          </div>
        </div>
        {pie.total === 0 ? (
          <div className="h-[260px] flex items-center justify-center text-xs text-slate-400 italic">
            No tasks for this selection.
          </div>
        ) : (
          <>
            <div style={{ filter: "drop-shadow(0 8px 12px rgba(15, 23, 42, 0.18))" }}>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <defs>
                    {pie.slices.map((s, i) => (
                      <linearGradient key={s.name} id={`task-pie-${i}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={shade(s.color, 0.3)} />
                        <stop offset="100%" stopColor={s.color} />
                      </linearGradient>
                    ))}
                  </defs>
                  {/* Extruded edge: a darker copy of the pie set slightly lower, so each slice reads as a raised 3D wedge */}
                  <Pie data={pie.slices} dataKey="value" cx="50%" cy="54%" outerRadius="78%" startAngle={90} endAngle={-270} stroke="#fff" strokeWidth={3} isAnimationActive={false} legendType="none" tooltipType="none">
                    {pie.slices.map((s) => <Cell key={s.name} fill={shade(s.color, -0.35)} />)}
                  </Pie>
                  <Pie
                    data={pie.slices}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="49%"
                    outerRadius="78%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="#fff"
                    strokeWidth={3}
                    isAnimationActive={false}
                    labelLine={false}
                    label={renderSliceLabel}
                  >
                    {pie.slices.map((s, i) => <Cell key={s.name} fill={`url(#task-pie-${i})`} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v, name) => [`${v} task${Number(v) === 1 ? "" : "s"} (${Math.round((Number(v) / pie.total) * 100)}%)`, String(name)]}
                    contentStyle={{ fontSize: 11, borderRadius: 8, borderColor: "#e2e8f0" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
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
