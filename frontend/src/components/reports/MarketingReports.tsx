"use client";

import React, { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { DollarSign, Target, Gauge, TrendingUp, Building2 } from "lucide-react";
import { DateRange } from "./DateRangeFilter";
import {
  filterLeadsByRange,
  filterAdSpendByRange,
  computeCPL,
  computeLeadQuality,
  computeVisitConversion,
  computeBookingValue,
  computeBookingCount,
  computeROIMultiple,
  formatCurrency
} from "@/lib/reportMetrics";

const SUB_TABS = ["By Ad Account", "Overall", "Property-wise"] as const;
type SubTab = (typeof SUB_TABS)[number];

const CAMPAIGN_FILTERS = ["All", "Active", "Inactive"] as const;
type CampaignFilter = (typeof CAMPAIGN_FILTERS)[number];

export default function MarketingReports({ dateRange }: { dateRange: DateRange }) {
  const { leads, adSpendRecords, properties } = useApp();
  const [subTab, setSubTab] = useState<SubTab>("Overall");
  // Active/Inactive/All — records with no linked Meta campaign (legacy/manual
  // rows, or any campaign the sync job hasn't reached yet) always count as
  // "All" but are excluded from a specific Active/Inactive filter, since we
  // genuinely don't know their status.
  const [campaignFilter, setCampaignFilter] = useState<CampaignFilter>("All");

  const rangeLeads = useMemo(() => filterLeadsByRange(leads, dateRange.from, dateRange.to), [leads, dateRange]);
  const dateFilteredSpend = useMemo(() => filterAdSpendByRange(adSpendRecords, dateRange.from, dateRange.to), [adSpendRecords, dateRange]);
  const rangeSpend = useMemo(() => {
    if (campaignFilter === "All") return dateFilteredSpend;
    const wanted = campaignFilter === "Active" ? "ACTIVE" : "INACTIVE";
    return dateFilteredSpend.filter(r => r.campaignStatus === wanted);
  }, [dateFilteredSpend, campaignFilter]);

  const totalSpend = rangeSpend.reduce((sum, r) => sum + r.spend, 0);
  const totalPlatformLeads = rangeSpend.reduce((sum, r) => sum + r.leadsGenerated, 0);
  const cpl = computeCPL(totalSpend, totalPlatformLeads);
  const quality = computeLeadQuality(rangeLeads);
  const visitConversion = computeVisitConversion(rangeLeads);
  const bookingValue = computeBookingValue(rangeLeads);
  const bookingCount = computeBookingCount(rangeLeads);
  const roi = computeROIMultiple(bookingValue, totalSpend);

  // Per ad account aggregation, joined against CRM leads by matching campaign name
  const accountRows = useMemo(() => {
    const grouped: Record<string, { platform: string; accountName: string; property?: string; spend: number; platformLeads: number }> = {};
    rangeSpend.forEach(r => {
      const key = r.accountName;
      if (!grouped[key]) grouped[key] = { platform: r.platform, accountName: r.accountName, property: r.property, spend: 0, platformLeads: 0 };
      grouped[key].spend += r.spend;
      grouped[key].platformLeads += r.leadsGenerated;
    });
    return Object.values(grouped).map(acc => {
      const matchedLeads = rangeLeads.filter(l => l.campaign === acc.accountName);
      const accQuality = computeLeadQuality(matchedLeads);
      const accBookingValue = computeBookingValue(matchedLeads);
      return {
        ...acc,
        cpl: computeCPL(acc.spend, acc.platformLeads),
        matchedLeadsCount: matchedLeads.length,
        qualityPercent: accQuality.qualityPercent,
        hasMatchedLeads: matchedLeads.length > 0,
        roi: computeROIMultiple(accBookingValue, acc.spend)
      };
    }).sort((a, b) => b.spend - a.spend);
  }, [rangeSpend, rangeLeads]);

  // Property-wise aggregation
  const propertyRows = useMemo(() => {
    const propertyNames = Array.from(new Set([...properties.map(p => p.name), ...rangeSpend.map(r => r.property).filter(Boolean) as string[]]));
    return propertyNames.map(name => {
      const propSpendRecords = rangeSpend.filter(r => r.property === name);
      const spend = propSpendRecords.reduce((sum, r) => sum + r.spend, 0);
      const platformLeads = propSpendRecords.reduce((sum, r) => sum + r.leadsGenerated, 0);
      const propLeads = rangeLeads.filter(l => l.property === name);
      const propBookingValue = computeBookingValue(propLeads);
      const propBookingCount = computeBookingCount(propLeads);
      return {
        name,
        spend,
        platformLeads,
        cpl: computeCPL(spend, platformLeads),
        crmLeadsCount: propLeads.length,
        bookingCount: propBookingCount,
        bookingValue: propBookingValue,
        roi: computeROIMultiple(propBookingValue, spend)
      };
    }).filter(row => row.spend > 0 || row.crmLeadsCount > 0).sort((a, b) => b.spend - a.spend);
  }, [properties, rangeSpend, rangeLeads]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Campaign filter — applies to Total Ad Spend, CPL, and every table/breakdown below */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Campaigns:</span>
        <div className="flex gap-1.5">
          {CAMPAIGN_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setCampaignFilter(f)}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                campaignFilter === f ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-500 hover:text-slate-700"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards: CPL, Lead Quality, Booking ROI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Ad Spend</span>
            <p className="text-xl font-black text-slate-800">{formatCurrency(totalSpend)}</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600">
            <DollarSign className="h-5.5 w-5.5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CPL (Cost per Lead)</span>
            <p className="text-xl font-black text-slate-800">{formatCurrency(cpl)}</p>
            <span className="text-[9px] text-slate-450">{totalPlatformLeads} platform-reported leads</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Target className="h-5.5 w-5.5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lead Quality</span>
            <p className="text-xl font-black text-slate-800">{quality.qualityPercent.toFixed(1)}%</p>
            <span className="text-[9px] text-slate-450">{quality.buyerCount} buyer-avg vs {quality.nonBuyerCount} non-buyer</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
            <Gauge className="h-5.5 w-5.5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Booking-Based ROI</span>
            <p className="text-xl font-black text-slate-800">{roi.toFixed(1)}x</p>
            <span className="text-[9px] text-slate-450">{bookingCount} bookings • {formatCurrency(bookingValue)}</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-650">
            <TrendingUp className="h-5.5 w-5.5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Visit/Meeting Conversion</span>
            <p className="text-xl font-black text-slate-800">{visitConversion.conversionPercent.toFixed(1)}%</p>
            <span className="text-[9px] text-slate-450">{visitConversion.convertedCount} of {rangeLeads.length} leads</span>
          </div>
          <div className="h-10 w-10 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center text-pink-600">
            <Building2 className="h-5.5 w-5.5" />
          </div>
        </div>
      </div>

      {/* Sub tabs */}
      <div className="flex gap-2">
        {SUB_TABS.map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
              subTab === t ? "bg-brand-700 border-brand-700 text-white shadow-sm" : "bg-white border-slate-200 text-slate-500 hover:text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {subTab === "By Ad Account" && (
        <div className="glass-card p-6 rounded-2xl space-y-4">
          <h3 className="text-xs font-bold text-slate-700">Individual Ad Account Performance</h3>
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="p-3">Platform</th>
                  <th className="p-3">Ad Account</th>
                  <th className="p-3">Spend</th>
                  <th className="p-3">Platform Leads</th>
                  <th className="p-3">CPL</th>
                  <th className="p-3">Lead Quality</th>
                  <th className="p-3">Booking ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accountRows.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-slate-400 italic font-semibold">No ad spend recorded in this date range.</td></tr>
                ) : (
                  accountRows.map(acc => (
                    <tr key={acc.accountName} className="hover:bg-slate-50/50">
                      <td className="p-3">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                          acc.platform === "Meta" ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-amber-50 text-amber-700 border-amber-100"
                        }`}>
                          {acc.platform}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-slate-800 max-w-[220px] truncate" title={acc.accountName}>{acc.accountName}</td>
                      <td className="p-3 font-mono font-semibold text-slate-700">{formatCurrency(acc.spend)}</td>
                      <td className="p-3 font-mono text-slate-600">{acc.platformLeads}</td>
                      <td className="p-3 font-mono font-bold text-brand-700">{formatCurrency(acc.cpl)}</td>
                      <td className="p-3">
                        {acc.hasMatchedLeads ? (
                          <span className="font-mono font-semibold text-slate-700">{acc.qualityPercent.toFixed(0)}%</span>
                        ) : (
                          <span className="text-slate-400 italic">No CRM leads matched</span>
                        )}
                      </td>
                      <td className="p-3 font-mono font-bold text-emerald-650">
                        {acc.hasMatchedLeads ? `${acc.roi.toFixed(1)}x` : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === "Overall" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-card p-6 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold text-slate-700">Spend by Platform</h3>
            {(["Meta", "Google"] as const).map(platform => {
              const platformSpend = rangeSpend.filter(r => r.platform === platform);
              const spend = platformSpend.reduce((sum, r) => sum + r.spend, 0);
              const platformLeads = platformSpend.reduce((sum, r) => sum + r.leadsGenerated, 0);
              const pct = totalSpend === 0 ? 0 : (spend / totalSpend) * 100;
              return (
                <div key={platform} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-700 font-bold">{platform}</span>
                    <span className="text-slate-500">{formatCurrency(spend)} • {platformLeads} leads</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${platform === "Meta" ? "bg-blue-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-slate-450 leading-relaxed pt-2 border-t border-slate-100">
              CPL is computed from platform-reported lead counts; Lead Quality and Booking ROI are computed from CRM-tracked leads whose campaign or property matches the ad account, within the selected date range.
            </p>
          </div>

          <div className="glass-card p-6 rounded-2xl space-y-4">
            <h3 className="text-xs font-bold text-slate-700">Lead Quality Breakdown</h3>
            <div className="flex items-end gap-6">
              <div>
                <p className="text-3xl font-black text-emerald-600">{quality.buyerCount}</p>
                <span className="text-[10px] text-slate-450 font-bold uppercase">Buyer-avg leads</span>
              </div>
              <div>
                <p className="text-3xl font-black text-red-500">{quality.nonBuyerCount}</p>
                <span className="text-[10px] text-slate-450 font-bold uppercase">Non-buyer leads</span>
              </div>
            </div>
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex">
              <div className="bg-emerald-500 h-full" style={{ width: `${quality.qualityPercent}%` }} />
              <div className="bg-red-400 h-full" style={{ width: `${100 - quality.qualityPercent}%` }} />
            </div>
            <p className="text-[10px] text-slate-450 leading-relaxed">
              Quality score reflects the average of leads that progressed toward a sale (buyer-side statuses) against leads marked dead, invalid, not interested, RNR, switched off, low budget, or finance-rejected (non-buyer statuses).
            </p>
          </div>
        </div>
      )}

      {subTab === "Property-wise" && (
        <div className="glass-card p-6 rounded-2xl space-y-4">
          <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-slate-500" />
            Property-wise Marketing Performance
          </h3>
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="p-3">Property</th>
                  <th className="p-3">Spend</th>
                  <th className="p-3">CRM Leads</th>
                  <th className="p-3">CPL</th>
                  <th className="p-3">Bookings</th>
                  <th className="p-3">Booking Value</th>
                  <th className="p-3">ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {propertyRows.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-slate-400 italic font-semibold">No property-linked activity in this date range.</td></tr>
                ) : (
                  propertyRows.map(row => (
                    <tr key={row.name} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-800">{row.name}</td>
                      <td className="p-3 font-mono text-slate-700">{formatCurrency(row.spend)}</td>
                      <td className="p-3 font-mono text-slate-600">{row.crmLeadsCount}</td>
                      <td className="p-3 font-mono font-bold text-brand-700">{formatCurrency(row.cpl)}</td>
                      <td className="p-3 font-mono text-slate-600">{row.bookingCount}</td>
                      <td className="p-3 font-mono text-slate-700">{formatCurrency(row.bookingValue)}</td>
                      <td className="p-3 font-mono font-bold text-emerald-650">{row.roi.toFixed(1)}x</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
