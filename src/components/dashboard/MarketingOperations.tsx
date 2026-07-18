import React from "react";
import { Globe, TrendingUp, DollarSign, Activity, Eye, ArrowUpRight } from "lucide-react";
import SubActionsMenu, { ActionItem } from "./SubActionsMenu";
import { useRouter } from "next/navigation";

interface MarketingOperationsProps {
  metaTotalSpend: number;
  metaTodaySpend: number;
  metaActiveCampaigns: number;
  googleTotalSpend: number;
  googleTodaySpend: number;
  googleActiveCampaigns: number;
}

function formatCurrency(amount: number): string {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default function MarketingOperations({
  metaTotalSpend,
  metaTodaySpend,
  metaActiveCampaigns,
  googleTotalSpend,
  googleTodaySpend,
  googleActiveCampaigns
}: MarketingOperationsProps) {
  const router = useRouter();

  const handleCardRedirect = (path: string) => {
    router.push(path);
  };

  const getCampaignActions = (source: string): ActionItem[] => [
    { label: `View ${source} Campaign Details`, onClick: () => alert(`Redirecting to ${source} details...`) },
    { label: `Optimize Bid Strategy`, onClick: () => alert(`Adjusting bid strategy for ${source}...`) },
    { label: `Sync Ads Manager`, onClick: () => alert(`Syncing ads data for ${source}...`) }
  ];

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5 animate-fade-in">
      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-705 flex items-center gap-2">
            <Globe className="h-4.5 w-4.5 text-blue-600" />
            Marketing Operations &amp; Spends
          </h3>
          <p className="text-[10px] text-slate-450 mt-0.5">Unified dashboard for Meta Ads and Google Search campaigns telemetry.</p>
        </div>
        <span className="text-[9px] bg-blue-50 border border-blue-100 text-blue-655 px-2 py-0.5 rounded-lg font-bold">
          Live Campaigns
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column 1: Meta Spends */}
        <div
          onClick={() => handleCardRedirect("/dashboard/organization")}
          className="bg-slate-50/50 hover:bg-slate-50 p-5 rounded-2xl border border-slate-200/80 hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col justify-between group relative"
        >
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <h4 className="text-xs font-black text-slate-750">Meta Ads Manager</h4>
            </div>
            <SubActionsMenu actions={getCampaignActions("Meta Ads")} />
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="p-3.5 bg-white border border-slate-100 rounded-xl">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Total Spend</span>
              <p className="text-base font-black text-slate-800 mt-1">₹{formatCurrency(metaTotalSpend)}</p>
            </div>
            <div className="p-3.5 bg-white border border-slate-100 rounded-xl">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Today's Spend</span>
              <p className="text-base font-black text-slate-800 mt-1">₹{formatCurrency(metaTodaySpend)}</p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Active Campaigns</span>
            <span className="font-extrabold text-blue-650 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-lg">
              {metaActiveCampaigns} Live Sets
            </span>
          </div>
        </div>

        {/* Column 2: Google Spends */}
        <div
          onClick={() => handleCardRedirect("/dashboard/organization")}
          className="bg-slate-50/50 hover:bg-slate-50 p-5 rounded-2xl border border-slate-200/80 hover:border-slate-300 transition-all duration-200 cursor-pointer flex flex-col justify-between group relative"
        >
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <h4 className="text-xs font-black text-slate-750">Google Adwords</h4>
            </div>
            <SubActionsMenu actions={getCampaignActions("Google Ads")} />
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="p-3.5 bg-white border border-slate-100 rounded-xl">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Total Spend</span>
              <p className="text-base font-black text-slate-805 mt-1">₹{formatCurrency(googleTotalSpend)}</p>
            </div>
            <div className="p-3.5 bg-white border border-slate-100 rounded-xl">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Today's Spend</span>
              <p className="text-base font-black text-slate-805 mt-1">₹{formatCurrency(googleTodaySpend)}</p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs pt-3 border-t border-slate-100">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Active Campaigns</span>
            <span className="font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-lg">
              {googleActiveCampaigns} Live Sets
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
