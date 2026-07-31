import React from "react";
import { Phone, Clock, Users, Calendar, AlertTriangle, ArrowRight } from "lucide-react";
import SubActionsMenu, { ActionItem } from "./SubActionsMenu";
import { useRouter } from "next/navigation";

interface SalesTelemetryProps {
  phoneCallsToday: number;
  talkTime: string;
  activeAgents: number;
  scheduledFollowups: number;
  missedFollowups: number;
}

export default function SalesTelemetry({
  phoneCallsToday,
  talkTime,
  activeAgents,
  scheduledFollowups,
  missedFollowups
}: SalesTelemetryProps) {
  const router = useRouter();

  const handleCardRedirect = (path: string) => {
    router.push(path);
  };

  const getSubActions = (title: string, path: string): ActionItem[] => [
    { label: `View Call Logs`, href: path },
    { label: "View Team Roster", href: "/dashboard/hrms?tab=teams" },
    { label: "Audit Telemetry", onClick: () => alert(`Auditing ${title} telemetry logs...`) }
  ];

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5 animate-fade-in">
      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-700 flex items-center gap-2">
            <Phone className="h-4.5 w-4.5 text-brand-600" />
            Sales Telemetry Monitoring
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5">Real-time dialer logs, agent availability, and callback tasks.</p>
        </div>
        <span className="text-[9px] bg-brand-50 border border-brand-100 text-brand-700 px-2 py-0.5 rounded-lg font-bold">
          Sales Call Center
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Today's Total Phone Calls */}
        <div
          onClick={() => handleCardRedirect("/dashboard/crm")}
          className="bg-slate-50/50 hover:bg-slate-50 p-4 rounded-xl border border-slate-200/60 hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col justify-between group relative"
        >
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Today&apos;s Calls</span>
            <SubActionsMenu actions={getSubActions("Today's Calls", "/dashboard/crm")} />
          </div>
          <div className="mt-4">
            <p className="text-lg font-black text-slate-800">{phoneCallsToday} calls</p>
            <span className="text-[8px] text-slate-400 mt-1 block">Inbound &amp; Outbound</span>
          </div>
        </div>

        {/* 2. Cumulative Talk Time */}
        <div
          onClick={() => handleCardRedirect("/dashboard/crm")}
          className="bg-slate-50/50 hover:bg-slate-50 p-4 rounded-xl border border-slate-200/60 hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col justify-between group relative"
        >
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Total Talk Time</span>
            <SubActionsMenu actions={getSubActions("Talk Time", "/dashboard/crm")} />
          </div>
          <div className="mt-4">
            <p className="text-lg font-black text-slate-800">{talkTime}</p>
            <span className="text-[8px] text-slate-400 mt-1 block">Avg: 2m 12s per call</span>
          </div>
        </div>

        {/* 3. Active Agents */}
        <div
          onClick={() => handleCardRedirect("/dashboard/hrms?tab=teams")}
          className="bg-slate-50/50 hover:bg-slate-50 p-4 rounded-xl border border-slate-200/60 hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col justify-between group relative"
        >
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Active Agents</span>
            <SubActionsMenu actions={getSubActions("Active Agents", "/dashboard/hrms?tab=teams")} />
          </div>
          <div className="mt-4">
            <p className="text-lg font-black text-brand-700">{activeAgents} Agents</p>
            <span className="text-[8px] text-emerald-600 font-semibold mt-1 block">Online &amp; Dialing</span>
          </div>
        </div>

        {/* 4. Scheduled Follow-ups */}
        <div
          onClick={() => handleCardRedirect("/dashboard/crm")}
          className="bg-slate-50/50 hover:bg-slate-50 p-4 rounded-xl border border-slate-200/60 hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col justify-between group relative"
        >
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Scheduled Followups</span>
            <SubActionsMenu actions={getSubActions("Scheduled Followups", "/dashboard/crm")} />
          </div>
          <div className="mt-4">
            <p className="text-lg font-black text-slate-800">{scheduledFollowups} pending</p>
            <span className="text-[8px] text-slate-400 mt-1 block">Due by today end</span>
          </div>
        </div>

        {/* 5. Missed Follow-ups (WARNING ALERT CARD) */}
        <div
          onClick={() => handleCardRedirect("/dashboard/crm")}
          className="bg-red-50 hover:bg-red-100/75 p-4 rounded-xl border border-red-200 hover:border-red-300 transition-all duration-200 cursor-pointer flex flex-col justify-between group relative shadow-sm"
        >
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-extrabold text-red-600 uppercase tracking-wider block flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 animate-pulse" />
              Missed Followups
            </span>
            <SubActionsMenu actions={getSubActions("Missed Followups", "/dashboard/crm")} />
          </div>
          <div className="mt-4">
            <p className="text-lg font-black text-red-700">{missedFollowups} Missed</p>
            <span className="text-[8px] text-red-500 font-semibold mt-1 block">Needs immediate reallocation</span>
          </div>
        </div>
      </div>
    </div>
  );
}
