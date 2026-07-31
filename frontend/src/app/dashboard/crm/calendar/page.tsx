"use client";

import React, { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, CalendarEvent, CalendarEventType } from "@/context/AppContext";
import MonthCalendar from "@/components/calendar/MonthCalendar";
import { CalendarDays, MapPin, PhoneCall, Handshake, FileSignature, LucideIcon } from "lucide-react";

const TYPE_META: Record<string, { label: string; color: string; icon: LucideIcon }> = {
  SITE_VISIT: { label: "Site Visit", color: "bg-blue-500", icon: MapPin },
  FOLLOWUP: { label: "Follow-up", color: "bg-amber-500", icon: PhoneCall },
  BOOKING: { label: "Booking", color: "bg-emerald-500", icon: Handshake },
  EOI: { label: "EOI", color: "bg-purple-500", icon: FileSignature }
};

function CRMCalendarContent() {
  const { calendarEvents } = useApp();
  const router = useRouter();
  const crmEvents = calendarEvents.filter(e => e.system === "CRM");

  const todayKey = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);

  const dayEvents = crmEvents
    .filter(e => e.date === selectedDate)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  const handleEventClick = (e: CalendarEvent) => {
    if (e.leadId) router.push(`/dashboard/crm?openLead=${e.leadId}`);
  };

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-brand-700 flex items-center gap-2">
          <CalendarDays className="h-6.5 w-6.5 text-brand-600" />
          CRM Calendar
        </h2>
        <p className="text-xs text-slate-500">Site visits, follow-up callbacks, bookings, and EOI submissions across the pipeline.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        {Object.entries(TYPE_META).map(([key, meta]) => (
          <div key={key} className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
            <span className={`h-2 w-2 rounded-full ${meta.color}`} />
            {meta.label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8">
          <MonthCalendar
            events={crmEvents}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            colorForEvent={(e) => TYPE_META[e.type]?.color || "bg-slate-400"}
          />
        </div>

        <div className="lg:col-span-4 glass-card p-5 rounded-2xl space-y-3">
          <h3 className="text-xs font-bold text-slate-700 border-b border-slate-100 pb-2">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </h3>
          {dayEvents.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic py-4 text-center">No scheduled activity on this date.</p>
          ) : (
            <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
              {dayEvents.map(e => {
                const meta = TYPE_META[e.type as CalendarEventType] || TYPE_META.FOLLOWUP;
                const Icon = meta.icon;
                return (
                  <button
                    key={e.id}
                    onClick={() => handleEventClick(e)}
                    disabled={!e.leadId}
                    className={`w-full text-left p-3 rounded-xl border border-slate-200 bg-slate-50 transition-colors ${
                      e.leadId ? "hover:bg-white hover:shadow-sm cursor-pointer" : "cursor-default"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center text-white shrink-0 ${meta.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{e.title}</p>
                        {e.time && <p className="text-[10px] text-slate-500 font-mono mt-0.5">{e.time}</p>}
                        {e.description && <p className="text-[10px] text-slate-500 mt-0.5">{e.description}</p>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CRMCalendarPage() {
  return (
    <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center bg-slate-50 text-xs font-bold text-slate-400">Loading calendar...</div>}>
      <CRMCalendarContent />
    </Suspense>
  );
}
