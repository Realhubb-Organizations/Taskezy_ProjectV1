import React from "react";
import { Search, Filter, X } from "lucide-react";
import { LeadStatus } from "@/context/AppContext";

interface LeadFilterBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedStatuses: LeadStatus[];
  setSelectedStatuses: (statuses: LeadStatus[]) => void;
  availableStatuses: LeadStatus[];
}

export default function LeadFilterBar({
  searchQuery,
  setSearchQuery,
  selectedStatuses,
  setSelectedStatuses,
  availableStatuses
}: LeadFilterBarProps) {

  const handleStatusToggle = (status: LeadStatus) => {
    if (selectedStatuses.includes(status)) {
      setSelectedStatuses(selectedStatuses.filter(s => s !== status));
    } else {
      setSelectedStatuses([...selectedStatuses, status]);
    }
  };

  const handleClearAll = () => {
    setSelectedStatuses([]);
    setSearchQuery("");
  };

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 animate-fade-in">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search Input */}
        <div className="relative w-full md:max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search leads by name, phone or email..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-brand-500 transition-all shadow-sm"
          />
          <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
        </div>

        {/* Action Counters & Reset */}
        <div className="flex items-center gap-3 shrink-0">
          {selectedStatuses.length > 0 || searchQuery !== "" ? (
            <button
              onClick={handleClearAll}
              className="inline-flex items-center gap-1 text-[10px] font-extrabold text-red-650 hover:text-red-750 bg-red-50 border border-red-100 hover:bg-red-100/50 px-3 py-2 rounded-xl transition-all"
            >
              <X className="h-3.5 w-3.5" />
              Reset Filters
            </button>
          ) : null}
          <div className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-200/80 px-3 py-2 rounded-xl flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <span>Active Filters: {selectedStatuses.length} statuses selected</span>
          </div>
        </div>
      </div>

      {/* Scrollable Status Pool Chipset */}
      <div className="space-y-1.5">
        <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Status Pool Filters (Multi-Select)</label>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200">
          <button
            onClick={() => setSelectedStatuses([])}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all shrink-0 ${
              selectedStatuses.length === 0
                ? "bg-brand-600 border-brand-600 text-white shadow-sm shadow-brand-500/10"
                : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}
          >
            All Statuses
          </button>
          {availableStatuses.map((status) => {
            const isSelected = selectedStatuses.includes(status);
            return (
              <button
                key={status}
                onClick={() => handleStatusToggle(status)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-all shrink-0 ${
                  isSelected
                    ? "bg-brand-600 border-brand-600 text-white shadow-sm shadow-brand-500/10"
                    : "bg-slate-50 hover:bg-slate-100 border-slate-200/80 text-slate-600"
                }`}
              >
                {status}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
