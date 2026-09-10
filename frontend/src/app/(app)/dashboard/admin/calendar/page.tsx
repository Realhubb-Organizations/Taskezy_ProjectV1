"use client";

import React, { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, CalendarEvent, SystemType } from "@/context/AppContext";
import MonthCalendar from "@/components/calendar/MonthCalendar";
import { CalendarDays } from "lucide-react";

const SYSTEM_COLOR: Record<string, string> = {
  CRM: "bg-blue-500",
  HRMS: "bg-indigo-500",
  FINANCE: "bg-emerald-500"
};

const SYSTEMS: SystemType[] = ["CRM", "HRMS", "FINANCE"];

function AdminCalendarContent() {
  const { calendarEvents } = useApp();
  const router = useRouter();

  const todayKey = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);

  const dayEvents = calendarEvents
    .filter(e => e.date === selectedDate)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  const handleEventClick = (e: CalendarEvent) => {
    if (e.system === "CRM" && e.leadId) router.push(`/dashboard/crm?openLead=${e.leadId}`);
    else if (e.system === "HRMS") router.push("/dashboard/hrms?tab=calendar");
    else if (e.system === "FINANCE") router.push("/dashboard/finance?tab=calendar");
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
          <CalendarDays className="h-6.5 w-6.5 text-brand-600" />
          Global Operations Calendar
        </h2>
        <p className="text-xs text-slate-500">Combined CRM, HRMS, and Finance schedule across every partition.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        {SYSTEMS.map(sys => (
          <div key={sys} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
            <span className={`h-2 w-2 rounded-full ${SYSTEM_COLOR[sys]}`} />
            {sys}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8">
          <MonthCalendar
            events={calendarEvents}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            colorForEvent={(e) => SYSTEM_COLOR[e.system] || "bg-slate-400"}
          />
        </div>

        <div className="lg:col-span-4 glass-card p-5 rounded-2xl space-y-3">
          <h3 className="text-xs font-bold text-slate-700 border-b border-slate-100 pb-2">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </h3>
          {dayEvents.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic py-4 text-center">No scheduled activity across any partition.</p>
          ) : (
            <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
              {dayEvents.map(e => (
                <button
                  key={e.id}
                  onClick={() => handleEventClick(e)}
                  className="w-full text-left p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:shadow-sm transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-800 truncate">{e.title}</p>
                    <span className={`h-2 w-2 rounded-full shrink-0 ${SYSTEM_COLOR[e.system] || "bg-slate-400"}`} />
                  </div>
                  {e.time && <p className="text-[10px] text-slate-500 font-mono mt-0.5">{e.time}</p>}
                  {e.description && <p className="text-[10px] text-slate-500 mt-0.5">{e.description}</p>}
                  {e.createdBy && <p className="text-[10px] text-brand-600 font-bold mt-1">Added by {e.createdBy}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminCalendarPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center bg-slate-50 text-xs font-bold text-slate-400">Loading global calendar...</div>}>
      <AdminCalendarContent />
    </Suspense>
  );
}
