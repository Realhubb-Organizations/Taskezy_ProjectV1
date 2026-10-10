"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { Lead, FollowupCall } from "@/context/AppContext";
import { buildSalesPendingTasks, PendingTask } from "@/lib/salesPendingTasks";
import { SearchableMultiSelect } from "@/components/ui/SearchableDropdown";
import { TAB_BUCKETS, TeamTaskTab } from "@/components/dashboard/TeamTasksTable";

// ApexCharts touches `window`, so it only loads in the browser.
const ApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => <div className="h-[300px] rounded-xl bg-slate-50 animate-pulse" />
});

// Due-date chart window: one bar per day from a week ago to a week ahead,
// plus "Older" / "Later" bars so no task is ever left off the chart.
const DAYS_BACK = 7;
const DAYS_AHEAD = 7;
// Stack colors, one per agent or task type; anything past the eighth is
// "Other". Soft, evenly weighted tones so no single group shouts.
const SERIES_COLORS = ["#4F46E5", "#8B5CF6", "#38BDF8", "#FBBF24", "#FB7185", "#34D399", "#F472B6", "#CBD5E1"];

interface TrendSeries { key: string; name: string; color: string; total: number }
interface TrendRow { label: string; total: number; [seriesKey: string]: string | number }

const escapeHtml = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

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

  // Tasks by due date, stacked by agent when two or more agents are picked
  // (to compare them), otherwise by task type.
  const trend = useMemo(() => {
    const filtered = filterTasks(tasks, lineFilter);
    const splitBy: "agent" | "type" = lineFilter.agents.length >= 2 ? "agent" : "type";
    const seriesOf = (t: PendingTask) => (splitBy === "agent" ? t.assignedTo || "Unassigned" : t.taskType || "Other");

    const dayStart = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const windowStart = dayStart(-DAYS_BACK);
    const windowEnd = dayStart(DAYS_AHEAD + 1);
    const dayLabel = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

    // Biggest groups first; past the palette, the rest fold into "Other".
    const totals = new Map<string, number>();
    filtered.forEach(t => { if (t.dueAt) totals.set(seriesOf(t), (totals.get(seriesOf(t)) || 0) + 1); });
    const ranked = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
    const keep = ranked.length > SERIES_COLORS.length ? ranked.slice(0, SERIES_COLORS.length - 1) : ranked;
    const otherTotal = ranked.slice(keep.length).reduce((sum, [, v]) => sum + v, 0);
    const series: TrendSeries[] = keep.map(([name, total], i) => ({ key: `s${i}`, name, color: SERIES_COLORS[i], total }));
    if (otherTotal > 0) series.push({ key: `s${series.length}`, name: "Other", color: SERIES_COLORS[SERIES_COLORS.length - 1], total: otherTotal });
    const keyOf = new Map(keep.map(([name], i) => [name, `s${i}`]));
    const otherKey = otherTotal > 0 ? series[series.length - 1].key : null;

    const emptyRow = (label: string): TrendRow => {
      const row: TrendRow = { label, total: 0 };
      series.forEach(sr => { row[sr.key] = 0; });
      return row;
    };
    const older = emptyRow("Older");
    const later = emptyRow("Later");
    const days = Array.from({ length: DAYS_BACK + DAYS_AHEAD + 1 }, (_, i) => {
      const offset = i - DAYS_BACK;
      return emptyRow(offset === 0 ? "Today" : dayLabel(dayStart(offset)));
    });

    let noDueDate = 0;
    for (const t of filtered) {
      if (!t.dueAt) { noDueDate += 1; continue; }
      const row = t.dueAt < windowStart ? older
        : t.dueAt >= windowEnd ? later
        : days[Math.floor((new Date(t.dueAt.getFullYear(), t.dueAt.getMonth(), t.dueAt.getDate()).getTime() - windowStart.getTime()) / 86_400_000)];
      if (!row) continue;
      const key = keyOf.get(seriesOf(t)) ?? otherKey;
      if (!key) continue;
      row[key] = Number(row[key]) + 1;
      row.total += 1;
    }

    const data = [...(older.total > 0 ? [older] : []), ...days, ...(later.total > 0 ? [later] : [])];
    const firstOverdueLabel = data[0].label;
    return { data, series, splitBy, total: filtered.length, noDueDate, firstOverdueLabel };
  }, [tasks, lineFilter, now]);

  // Legend items the user has tapped off (by series name).
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  useEffect(() => { setHiddenSeries(new Set()); }, [trend.splitBy]);
  const toggleSeries = (name: string) => setHiddenSeries(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const trendChart = useMemo(() => {
    const labels = trend.data.map(r => r.label);
    const todayIndex = labels.indexOf("Today");
    const visible = trend.series.filter(sr => !hiddenSeries.has(sr.name));
    // Zero → null so only the real top part of each stack gets rounded.
    const series = visible.map(sr => ({ name: sr.name, data: trend.data.map(r => Number(r[sr.key]) || null) }));
    const options: ApexOptions = {
      chart: {
        type: "bar",
        stacked: true,
        fontFamily: "inherit",
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: true, speed: 450, animateGradually: { enabled: true, delay: 25 }, dynamicAnimation: { enabled: true, speed: 350 } }
      },
      colors: visible.map(sr => sr.color),
      plotOptions: {
        bar: { columnWidth: "48%", borderRadius: 6, borderRadiusApplication: "end", borderRadiusWhenStacked: "last" }
      },
      // A thin white edge between stacked parts keeps each one readable.
      stroke: { show: true, width: 1.5, colors: ["#ffffff"] },
      dataLabels: { enabled: false },
      grid: {
        borderColor: "#EEF2F7",
        strokeDashArray: 4,
        xaxis: { lines: { show: false } },
        padding: { left: 8, right: 8, top: 0 }
      },
      xaxis: {
        categories: labels,
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
        labels: {
          rotate: 0,
          hideOverlappingLabels: true,
          style: { colors: labels.map((l, i) => (l === "Today" ? "#1E1B4B" : i < todayIndex ? "#FB7185" : "#94A3B8")), fontSize: "11px", fontWeight: 500 }
        }
      },
      yaxis: {
        min: 0,
        forceNiceScale: true,
        labels: { style: { colors: ["#94A3B8"], fontSize: "11px" }, formatter: (v: number) => String(Math.round(v)) }
      },
      // Overdue days are marked by rose date labels plus an "Overdue" tag
      // (a shaded band would sit on top of the bars and wash them out).
      annotations: {
        xaxis: [
          {
            x: trend.firstOverdueLabel,
            borderColor: "transparent",
            label: {
              text: "Overdue",
              orientation: "horizontal",
              position: "top",
              textAnchor: "start",
              offsetY: -6,
              borderWidth: 0,
              style: { background: "transparent", color: "#E11D48", fontSize: "11px", fontWeight: 600 }
            }
          },
          {
            x: "Today",
            borderColor: "transparent",
            label: {
              text: "Today",
              orientation: "horizontal",
              position: "top",
              offsetY: -6,
              borderWidth: 0,
              style: { background: "#EEF2FF", color: "#3730A3", fontSize: "10px", fontWeight: 700, padding: { left: 6, right: 6, top: 2, bottom: 2 } }
            }
          }
        ]
      },
      // Our own legend below the chart (tap to hide/show a group).
      legend: { show: false },
      states: { hover: { filter: { type: "darken" } }, active: { filter: { type: "none" } } },
      tooltip: {
        shared: true,
        intersect: false,
        // One card per day: the date, its total, and only the non-zero parts.
        custom: ({ series: values, dataPointIndex, w }: { series: number[][]; dataPointIndex: number; w: { globals: { seriesNames: string[]; colors: string[] } } }) => {
          const label = labels[dataPointIndex] ?? "";
          const title = label === "Older" ? "Older (overdue)" : label;
          const rows = values
            .map((vals, i) => ({ name: w.globals.seriesNames[i], color: w.globals.colors[i], value: Number(vals[dataPointIndex]) || 0 }))
            .filter(r => r.value > 0);
          const total = rows.reduce((sum, r) => sum + r.value, 0);
          return `<div style="padding:10px 12px;min-width:170px;font-size:11px;font-family:inherit">
            <div style="display:flex;justify-content:space-between;gap:12px;font-weight:700;color:#0f172a;margin-bottom:${rows.length ? 6 : 0}px">
              <span>${escapeHtml(title)}</span><span>${total} task${total === 1 ? "" : "s"}</span>
            </div>
            ${rows.map(r => `<div style="display:flex;align-items:center;gap:6px;color:#475569;margin-top:3px">
              <span style="width:8px;height:8px;border-radius:9999px;background:${r.color};flex-shrink:0"></span>
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.name)}</span>
              <span style="margin-left:auto;padding-left:12px;font-weight:600;color:#0f172a">${r.value}</span>
            </div>`).join("")}
          </div>`;
        }
      },
      responsive: [
        { breakpoint: 640, options: { plotOptions: { bar: { columnWidth: "62%", borderRadius: 4 } } } }
      ]
    };
    return { series, options };
  }, [trend, hiddenSeries]);

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
              {trend.total} {tab === "all" ? "open" : "overdue"} task{trend.total === 1 ? "" : "s"} by due date · colored by {trend.splitBy === "agent" ? "agent" : "task type"}
              {trend.noDueDate > 0 && ` · ${trend.noDueDate} with no due date`}
            </p>
          </div>
          <CardFilters filter={lineFilter} agents={agents} taskTypes={taskTypeOptions} onChange={setLineFilter} />
        </div>
        {trend.total - trend.noDueDate === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-xs text-slate-400 italic">
            No tasks for this selection.
          </div>
        ) : (
          <>
            <div className="-mx-2">
              <ApexChart type="bar" height={290} series={trendChart.series} options={trendChart.options} />
            </div>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {trend.series.map(sr => {
                const off = hiddenSeries.has(sr.name);
                return (
                  <li key={sr.key}>
                    <button
                      type="button"
                      aria-pressed={!off}
                      onClick={() => toggleSeries(sr.name)}
                      title={off ? `Show ${sr.name}` : `Hide ${sr.name}`}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-200 ${
                        off ? "border-slate-200 bg-white text-slate-400" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white hover:shadow-sm"
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full shrink-0 transition-opacity" style={{ background: sr.color, opacity: off ? 0.3 : 1 }} />
                      <span className={`truncate max-w-[150px] ${off ? "line-through" : ""}`}>{sr.name}</span>
                      <span className={`font-semibold tabular-nums ${off ? "text-slate-400" : "text-slate-900"}`}>{sr.total}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
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
