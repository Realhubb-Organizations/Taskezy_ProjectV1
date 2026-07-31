import React from "react";
import { Users, Calendar, Building, TrendingUp, TrendingDown, ArrowUpRight, CheckSquare } from "lucide-react";
import SubActionsMenu, { ActionItem } from "./SubActionsMenu";
import { useRouter } from "next/navigation";

interface KpiGridProps {
  totalLeads: number;
  leadsToday: number;
  visitsToday: number;
  weekendVisits: number;
  monthBookings: number;
}

export default function KpiGrid({
  totalLeads,
  leadsToday,
  visitsToday,
  weekendVisits,
  monthBookings
}: KpiGridProps) {
  const router = useRouter();

  const handleCardClick = (path: string) => {
    router.push(path);
  };

  const getKpiActions = (title: string, path: string): ActionItem[] => [
    { label: `View ${title}`, href: path },
    { label: "Export Report", onClick: () => alert(`Exporting ${title} report...`) },
    { label: "Configure KPI", onClick: () => alert(`Configuring ${title} limits...`) }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 animate-fade-in">
      {/* 1. Total Leads */}
      <div
        onClick={() => handleCardClick("/dashboard/crm")}
        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col justify-between group relative"
      >
        <div className="flex justify-between items-start">
          <div className="p-2 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 group-hover:scale-105 transition-transform">
            <Users className="h-4.5 w-4.5" />
          </div>
          <SubActionsMenu actions={getKpiActions("Total Leads", "/dashboard/crm")} />
        </div>
        <div className="mt-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Leads</span>
          <p className="text-2xl font-black text-slate-805 mt-1">{totalLeads}</p>
        </div>
        <div className="mt-2 flex items-center gap-1">
          <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-0.5 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
            <TrendingUp className="h-3 w-3" /> +12.4% MoM
          </span>
          <span className="text-[8px] text-slate-400 font-medium">vs last month</span>
        </div>
      </div>

      {/* 2. Today's Leads */}
      <div
        onClick={() => handleCardClick("/dashboard/crm")}
        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col justify-between group relative"
      >
        <div className="flex justify-between items-start">
          <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-650 group-hover:scale-105 transition-transform">
            <TrendingUp className="h-4.5 w-4.5" />
          </div>
          <SubActionsMenu actions={getKpiActions("Today's Leads", "/dashboard/crm")} />
        </div>
        <div className="mt-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Today&apos;s Leads</span>
          <p className="text-2xl font-black text-slate-805 mt-1">{leadsToday}</p>
        </div>
        <div className="mt-2 flex items-center gap-1">
          <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-0.5 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
            <TrendingUp className="h-3 w-3" /> +8.3%
          </span>
          <span className="text-[8px] text-slate-400 font-medium">vs yesterday</span>
        </div>
      </div>

      {/* 3. Today's Site Visits */}
      <div
        onClick={() => handleCardClick("/dashboard/crm")}
        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col justify-between group relative"
      >
        <div className="flex justify-between items-start">
          <div className="p-2 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 group-hover:scale-105 transition-transform">
            <Calendar className="h-4.5 w-4.5" />
          </div>
          <SubActionsMenu actions={getKpiActions("Site Visits", "/dashboard/crm")} />
        </div>
        <div className="mt-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Today&apos;s Visits</span>
          <p className="text-2xl font-black text-slate-805 mt-1">{visitsToday}</p>
        </div>
        <div className="mt-2 flex items-center gap-1">
          <span className="text-[9px] text-red-600 font-bold flex items-center gap-0.5 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded">
            <TrendingDown className="h-3 w-3" /> -2.4%
          </span>
          <span className="text-[8px] text-slate-400 font-medium">vs yesterday</span>
        </div>
      </div>

      {/* 4. Weekend Visits */}
      <div
        onClick={() => handleCardClick("/dashboard/crm")}
        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col justify-between group relative"
      >
        <div className="flex justify-between items-start">
          <div className="p-2 rounded-xl bg-purple-50 border border-purple-100 text-purple-600 group-hover:scale-105 transition-transform">
            <Building className="h-4.5 w-4.5" />
          </div>
          <SubActionsMenu actions={getKpiActions("Weekend Visits", "/dashboard/crm")} />
        </div>
        <div className="mt-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Weekend Visits</span>
          <p className="text-2xl font-black text-slate-850 mt-1">{weekendVisits}</p>
        </div>
        <div className="mt-2 flex items-center gap-1">
          <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-0.5 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
            <TrendingUp className="h-3 w-3" /> +15.2%
          </span>
          <span className="text-[8px] text-slate-400 font-medium">vs last weekend</span>
        </div>
      </div>

      {/* 5. Month Bookings */}
      <div
        onClick={() => handleCardClick("/dashboard/finance")}
        className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col justify-between group relative"
      >
        <div className="flex justify-between items-start">
          <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-650 group-hover:scale-105 transition-transform">
            <CheckSquare className="h-4.5 w-4.5" />
          </div>
          <SubActionsMenu actions={getKpiActions("Month Bookings", "/dashboard/finance")} />
        </div>
        <div className="mt-4">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Month Bookings</span>
          <p className="text-2xl font-black text-slate-805 mt-1">{monthBookings}</p>
        </div>
        <div className="mt-2 flex items-center gap-1">
          <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-0.5 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
            <TrendingUp className="h-3 w-3" /> +4.8% MoM
          </span>
          <span className="text-[8px] text-slate-400 font-medium">vs last month</span>
        </div>
      </div>
    </div>
  );
}
