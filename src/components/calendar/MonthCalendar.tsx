"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CalendarEvent } from "@/context/AppContext";

interface MonthCalendarProps {
  events: CalendarEvent[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  colorForEvent?: (event: CalendarEvent) => string;
}

const DEFAULT_DOT_COLORS: Record<string, string> = {
  CRM: "bg-blue-500",
  HRMS: "bg-indigo-500",
  FINANCE: "bg-emerald-500"
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function MonthCalendar({ events, selectedDate, onSelectDate, colorForEvent }: MonthCalendarProps) {
  const [cursor, setCursor] = useState(() => new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const eventsByDate: Record<string, CalendarEvent[]> = {};
  events.forEach(e => {
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(e);
  });

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-xs font-extrabold text-slate-800">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCursor(new Date())}
            className="px-2 py-1 rounded-lg text-[10px] font-bold text-brand-600 hover:bg-brand-50 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-100">
        {WEEKDAYS.map(d => (
          <div key={d} className="p-2 text-center text-[9px] font-bold uppercase text-slate-400 tracking-wider">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((d, idx) => {
          if (d === null) {
            return <div key={idx} className="min-h-[76px] border-b border-r border-slate-100 bg-slate-50/30" />;
          }
          const dateKey = toDateKey(year, month, d);
          const dayEvents = eventsByDate[dateKey] || [];
          const isToday = dateKey === todayKey;
          const isSelected = dateKey === selectedDate;
          return (
            <button
              key={idx}
              onClick={() => onSelectDate(dateKey)}
              className={`min-h-[76px] border-b border-r border-slate-100 p-1.5 text-left flex flex-col gap-1.5 hover:bg-slate-50 transition-colors ${
                isSelected ? "bg-brand-50/60 ring-1 ring-inset ring-brand-300" : ""
              }`}
            >
              <span
                className={`text-[10px] font-bold h-5 w-5 flex items-center justify-center rounded-full ${
                  isToday ? "bg-brand-600 text-white" : "text-slate-600"
                }`}
              >
                {d}
              </span>
              <div className="flex flex-wrap gap-0.5 items-center">
                {dayEvents.slice(0, 3).map(e => (
                  <span
                    key={e.id}
                    className={`h-1.5 w-1.5 rounded-full ${colorForEvent ? colorForEvent(e) : DEFAULT_DOT_COLORS[e.system] || "bg-slate-400"}`}
                    title={e.title}
                  />
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[8px] font-bold text-slate-400">+{dayEvents.length - 3}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
