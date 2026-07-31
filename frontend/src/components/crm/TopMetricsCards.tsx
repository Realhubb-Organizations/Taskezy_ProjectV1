import React, { useState } from "react";
import { Users, Globe, Eye, Landmark, ArrowUpRight, Calendar, Clock, CheckSquare, Sparkles } from "lucide-react";

interface SubAccount {
  name: string;
  count: number;
}

interface TopMetricsCardsProps {
  totalLeads: number;
  metaLeads: number;
  googleLeads: number;
  leadsToday: number;
  visitsToday: number;
  weekendVisits: number;
  monthBookings: number;
  metaSubAccounts: SubAccount[];
  googleSubAccounts: SubAccount[];
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

export default function TopMetricsCards({
  totalLeads,
  metaLeads,
  googleLeads,
  leadsToday,
  visitsToday,
  weekendVisits,
  monthBookings,
  metaSubAccounts,
  googleSubAccounts,
  activeFilter,
  onFilterChange
}: TopMetricsCardsProps) {
  const [metaOpen, setMetaOpen] = useState(false);
  const [googleOpen, setGoogleOpen] = useState(false);

  const getCardStyle = (filterName: string) => {
    const isActive = activeFilter === filterName;
    return `p-5 rounded-2xl border bg-white shadow-sm transition-all duration-250 cursor-pointer flex flex-col justify-between h-32 group select-none relative ${
      isActive 
        ? "border-brand-500 ring-2 ring-brand-500/20 shadow-md translate-y-[-2px]" 
        : "border-slate-200 hover:border-slate-350 hover:shadow-md hover:translate-y-[-1px]"
    }`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Operational Telemetry KPIs (Click to Filter Table)</span>
        {activeFilter !== "all" && (
          <button
            onClick={() => onFilterChange("all")}
            className="text-[9px] font-black text-brand-700 bg-brand-50 border border-brand-100 hover:bg-brand-100 px-2 py-0.5 rounded-lg transition-all"
          >
            Clear Metric Filter
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 relative">
        {/* 1. Total Leads Card */}
        <div
          onClick={() => onFilterChange("all")}
          className={getCardStyle("all")}
        >
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-extrabold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
              <Users className="h-3 w-3 shrink-0" />
              Total Leads
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">All Leads</span>
            <p className="text-xl font-black text-slate-805 mt-0.5">{totalLeads}</p>
          </div>
        </div>

        {/* 2. Today's Leads Card */}
        <div
          onClick={() => onFilterChange("today")}
          className={getCardStyle("today")}
        >
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              Today
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Today&apos;s Ingest</span>
            <p className="text-xl font-black text-slate-805 mt-0.5">{leadsToday}</p>
          </div>
        </div>

        {/* 3. Today's Visits Card */}
        <div
          onClick={() => onFilterChange("visits")}
          className={getCardStyle("visits")}
        >
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-extrabold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
              <Calendar className="h-3 w-3 shrink-0" />
              Visits
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Today&apos;s Visits</span>
            <p className="text-xl font-black text-slate-805 mt-0.5">{visitsToday}</p>
          </div>
        </div>

        {/* 4. Weekend Visits Card */}
        <div
          onClick={() => onFilterChange("weekend")}
          className={getCardStyle("weekend")}
        >
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-extrabold text-purple-705 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
              <Sparkles className="h-3 w-3 shrink-0" />
              Weekend
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Weekend Visits</span>
            <p className="text-xl font-black text-slate-805 mt-0.5">{weekendVisits}</p>
          </div>
        </div>

        {/* 5. Month Bookings Card */}
        <div
          onClick={() => onFilterChange("bookings")}
          className={getCardStyle("bookings")}
        >
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
              <CheckSquare className="h-3 w-3 shrink-0" />
              Bookings
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-3">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Month Bookings</span>
            <p className="text-xl font-black text-slate-805 mt-0.5">{monthBookings}</p>
          </div>
        </div>

        {/* 6. Meta Leads Card */}
        <div className="relative">
          <div
            onClick={() => {
              onFilterChange("meta");
              setMetaOpen(!metaOpen);
              setGoogleOpen(false);
            }}
            className={getCardStyle("meta")}
          >
            <div className="flex justify-between items-start">
              <span className="text-[9px] font-extrabold text-blue-650 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                Meta Ads
              </span>
              <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Meta Leads</span>
              <p className="text-xl font-black text-slate-805 mt-0.5">{metaLeads}</p>
            </div>
          </div>

          {metaOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMetaOpen(false)} />
              <div className="absolute right-0 lg:left-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-40 p-4 space-y-2.5 animate-fade-in w-64">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-[9px] font-black text-slate-700 uppercase tracking-wider">Meta Sub-Accounts</span>
                  <span className="text-[8px] text-blue-600 bg-blue-50 border border-blue-100 px-1 py-0.5 rounded font-bold">Live</span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {metaSubAccounts.map((acc, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[10px] font-semibold py-1 border-b border-slate-50 last:border-0">
                      <span className="text-slate-600 truncate max-w-[130px]">{acc.name}</span>
                      <span className="text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded font-black">{acc.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* 7. Google Leads Card */}
        <div className="relative">
          <div
            onClick={() => {
              onFilterChange("google");
              setGoogleOpen(!googleOpen);
              setMetaOpen(false);
            }}
            className={getCardStyle("google")}
          >
            <div className="flex justify-between items-start">
              <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Google Ads
              </span>
              <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="mt-3">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">Google Leads</span>
              <p className="text-xl font-black text-slate-805 mt-0.5">{googleLeads}</p>
            </div>
          </div>

          {googleOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setGoogleOpen(false)} />
              <div className="absolute right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-40 p-4 space-y-2.5 animate-fade-in w-64">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <span className="text-[9px] font-black text-slate-700 uppercase tracking-wider">Google Sub-Accounts</span>
                  <span className="text-[8px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-1 py-0.5 rounded font-bold">Live</span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {googleSubAccounts.map((acc, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[10px] font-semibold py-1 border-b border-slate-50 last:border-0">
                      <span className="text-slate-600 truncate max-w-[130px]">{acc.name}</span>
                      <span className="text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded font-black">{acc.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
