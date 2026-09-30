"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { Lead, FollowupCall } from "@/context/AppContext";
import { buildSalesPendingTasks, PendingTask } from "@/lib/salesPendingTasks";
import { SearchableMultiSelect } from "@/components/ui/SearchableDropdown";
import { TAB_BUCKETS, TeamTaskTab } from "@/components/dashboard/TeamTasksTable";

const LINE_COLOR = "#6D3FD9";

// Trend window: the last 30 days through the next 7, by task due date.
const DAYS_BACK = 30;
const DAYS_AHEAD = 7;

// The design's 3D pie is used as-is (public/images/task-pie-3d.png). Its
// seven slices, measured clockwise from 12 o'clock in that image, with the
// color sampled from each. Task types are mapped onto them largest count →
// largest slice, so the picture stays roughly in proportion; the numbers
// shown are always the real counts.
const IMAGE_SLICES = [
  { color: "#FFCF56", start: 354, end: 378 }, // yellow (wraps past 12 o'clock)
  { color: "#72A0E0", start: 23, end: 51 },   // blue
  { color: "#3CC8FA", start: 56, end: 113 },  // sky
  { color: "#E03CB6", start: 118, end: 143 }, // magenta
  { color: "#F43D6C", start: 147, end: 230 }, // red
  { color: "#FD69A1", start: 232, end: 292 }, // pink
  { color: "#FBA56A", start: 295, end: 351 }  // orange
];
// SVG wedge over one image slice (angles clockwise from 12 o'clock), a
// little past the pie's edge so the whole slice incl. its 3D rim is covered.
const wedgePath = (start: number, end: number, cx = 110, cy = 110, r = 112) => {
  const point = (a: number) => `${cx + r * Math.sin((a * Math.PI) / 180)} ${cy - r * Math.cos((a * Math.PI) / 180)}`;
  const s = start - 2;
  const e = end + 2;
  return `M ${cx} ${cy} L ${point(s)} A ${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${point(e)} Z`;
};

const SLICES_BY_SIZE = IMAGE_SLICES.map((s, i) => ({ ...s, index: i })).sort((a, b) => (b.end - b.start) - (a.end - a.start));

interface TaskFilter {
  agents: string[]; // empty means every agent
  statuses: string[]; // task types, the same values the table's Task Type filter lists
}

// Selected agents and task types are each OR'd; empty means all.
const filterTasks = (tasks: PendingTask[], { agents, statuses }: TaskFilter) => {
  const agentKeys = agents.map(a => a.trim().toLowerCase());
  return tasks.filter(t =>
    (agentKeys.length === 0 || agentKeys.includes(t.assignedTo.trim().toLowerCase())) &&
    (statuses.length === 0 || statuses.includes(t.taskType))
  );
};

// Agent + Status filters shown in each card's header.
function CardFilters({ filter, agents, taskTypes, onChange }: {
  filter: TaskFilter;
  agents: string[];
  taskTypes: string[];
  onChange: (f: TaskFilter) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <SearchableMultiSelect
        options={agents}
        selected={filter.agents}
        onChange={(next) => onChange({ ...filter, agents: next })}
        placeholder="All Agents"
        searchPlaceholder="Search agent..."
        align="right"
        panelWidth={200}
      />
      <SearchableMultiSelect
        label="Status"
        options={taskTypes}
        selected={filter.statuses}
        onChange={(next) => onChange({ ...filter, statuses: next })}
        searchPlaceholder="Search status..."
        align="right"
        panelWidth={220}
      />
    </div>
  );
}

// Admin / Manager dashboard only — the same task queue as the table above
// (built by salesPendingTasks.ts), limited to that table's active tab and
// charted: tasks by due date, and the split by task type. Each card has its
// own agent + status filter.
export default function TaskInsightsCharts({
  leads,
  followupCalls,
  agents,
  tab
}: {
  leads: Lead[];
  followupCalls: FollowupCall[];
  agents: string[];
  tab: TeamTaskTab;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [lineFilter, setLineFilter] = useState<TaskFilter>({ agents: [], statuses: [] });
  const [pieFilter, setPieFilter] = useState<TaskFilter>({ agents: [], statuses: [] });
  const [hoverSlice, setHoverSlice] = useState<number | null>(null);

  const allTasks = useMemo(() => buildSalesPendingTasks(leads, followupCalls, now), [leads, followupCalls, now]);
  const tasks = useMemo(() => allTasks.filter(t => TAB_BUCKETS[tab].includes(t.bucket)), [allTasks, tab]);
  // Built exactly like TeamTasksTable's Task Type options, so both list the same values.
  const taskTypeOptions = useMemo(() => Array.from(new Set(allTasks.map(t => t.taskType))).sort(), [allTasks]);

  const trend = useMemo(() => {
    const filtered = filterTasks(tasks, lineFilter);
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
  }, [tasks, lineFilter, now]);

  // Task types → image slices. More than seven types: the smallest fold
  // into "Other" on the last slice. Fewer: the spare slices show "0 Task".
  const pie = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of filterTasks(tasks, pieFilter)) counts.set(t.taskType, (counts.get(t.taskType) || 0) + 1);
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const groups: [string, number][] = sorted.length > IMAGE_SLICES.length
      ? [...sorted.slice(0, IMAGE_SLICES.length - 1), ["Other", sorted.slice(IMAGE_SLICES.length - 1).reduce((s, [, v]) => s + v, 0)]]
      : sorted;
    const slices = SLICES_BY_SIZE.map((slice, rank) => ({
      ...slice,
      name: groups[rank]?.[0] ?? null,
      value: groups[rank]?.[1] ?? 0,
      mid: ((slice.start + slice.end) / 2) % 360
    })).sort((a, b) => a.index - b.index);
    return { slices, total: sorted.reduce((s, [, v]) => s + v, 0) };
  }, [tasks, pieFilter]);

  // Map the pointer to a slice by its angle from the image center.
  const handlePieHover = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) > rect.width * 0.47) { setHoverSlice(null); return; }
    const angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    const hit = IMAGE_SLICES.findIndex(s => (angle >= s.start && angle <= s.end) || (angle + 360 >= s.start && angle + 360 <= s.end));
    setHoverSlice(hit >= 0 ? hit : null);
  };

  const hovered = hoverSlice !== null ? pie.slices.find(s => s.index === hoverSlice) : null;
  const cardClass = "bg-white rounded-2xl shadow-md p-5";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] gap-4">
      {/* All Task / Pending Task — the active tab's tasks by due date */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">{tab === "all" ? "All Task" : "Pending Task"}</h3>
            <p className="text-[11px] text-slate-500">
              {trend.total} {tab === "all" ? "open" : "overdue"} task{trend.total === 1 ? "" : "s"} by due date
              {trend.earlier > 0 && ` · ${trend.earlier} due before ${trend.data[0]?.label}`}
            </p>
          </div>
          <CardFilters filter={lineFilter} agents={agents} taskTypes={taskTypeOptions} onChange={setLineFilter} />
        </div>
        <ResponsiveContainer width="100%" height={300}>
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

      {/* Task Type — the design's 3D pie image, labeled with real counts */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Task Type</h3>
            <p className="text-[11px] text-slate-500">{pie.total} task{pie.total === 1 ? "" : "s"}</p>
          </div>
          <CardFilters filter={pieFilter} agents={agents} taskTypes={taskTypeOptions} onChange={setPieFilter} />
        </div>
        {pie.total === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-xs text-slate-400 italic">
            No tasks for this selection.
          </div>
        ) : (
          <>
            <div className="relative mx-auto mt-8 mb-8 w-[220px] h-[220px]">
              <div className="absolute inset-0" onMouseMove={handlePieHover} onMouseLeave={() => setHoverSlice(null)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- static design asset; next/image adds nothing for a small local PNG */}
                <img src="/images/task-pie-3d.png" alt="Task type pie chart" className="w-full h-full select-none pointer-events-none" draggable={false} />
                {/* Fade the slices with no tasks, matching their dimmed "0 Task" labels */}
                <svg viewBox="0 0 220 220" className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
                  {pie.slices.filter(s => !s.name).map(s => (
                    <path key={s.index} d={wedgePath(s.start, s.end)} fill="#fff" fillOpacity={0.65} />
                  ))}
                </svg>
              </div>
              {pie.slices.map(s => {
                const r = 124;
                const x = 110 + r * Math.sin((s.mid * Math.PI) / 180);
                const y = 110 - r * Math.cos((s.mid * Math.PI) / 180);
                const align = x > 118 ? "translate(0,-50%)" : x < 102 ? "translate(-100%,-50%)" : "translate(-50%,-50%)";
                return (
                  <span
                    key={s.index}
                    className={`absolute whitespace-nowrap text-[10px] font-bold pointer-events-none ${s.name ? "text-slate-800" : "text-slate-300"}`}
                    style={{ left: x, top: y, transform: align }}
                  >
                    {s.value} Task
                  </span>
                );
              })}
              {hovered && (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/95 border border-slate-200 rounded-lg shadow-md px-2.5 py-1.5 text-[11px] pointer-events-none whitespace-nowrap">
                  <p className="font-bold text-slate-800">{hovered.name ?? "No tasks"}</p>
                  <p className="text-slate-500">
                    {hovered.value} task{hovered.value === 1 ? "" : "s"}
                    {hovered.name && ` · ${Math.round((hovered.value / pie.total) * 100)}%`}
                  </p>
                </div>
              )}
            </div>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
              {pie.slices.filter(s => s.name).sort((a, b) => b.value - a.value).map(s => (
                <li key={s.index} className="flex items-center gap-1.5 min-w-0">
                  <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                  <span className="text-slate-600 truncate" title={s.name!}>{s.name}</span>
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
