"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { DollarSign, Target, Gauge, TrendingUp, Building2 } from "lucide-react";
import { DateRange } from "./DateRangeFilter";
import { filterAdSpendByRange, computeCPL, computeROIMultiple, formatCurrency } from "@/lib/reportMetrics";
import { apiGetMarketingReportStats, type MarketingReportStats } from "@/lib/apiClient";
import { LineSkeleton, TableRowsSkeleton, CardListSkeleton } from "@/components/ui/Skeletons";
import { SearchableMultiSelect } from "@/components/ui/SearchableDropdown";
import TablePagination, { usePagination } from "@/components/ui/TablePagination";

const ZERO_MARKETING_STATS: MarketingReportStats = {
  overall: { buyerCount: 0, nonBuyerCount: 0, convertedCount: 0, totalCount: 0, bookingValue: 0, bookingCount: 0 },
  byCampaign: [],
  byProperty: []
};

const SUB_TABS = ["By Ad Account", "Overall", "Property-wise"] as const;
type SubTab = (typeof SUB_TABS)[number];

const CAMPAIGN_STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" }
];

export default function MarketingReports({ dateRange }: { dateRange: DateRange }) {
  const { adSpendRecords, properties, isDataLoading } = useApp();
  const [subTab, setSubTab] = useState<SubTab>("Overall");
  // Active/Inactive ([] = all) — records with no linked Meta campaign
  // (legacy/manual rows, or any campaign the sync job hasn't reached yet)
  // always count when nothing is picked but are excluded from a specific
  // Active/Inactive filter, since we genuinely don't know their status.
  const [campaignStatuses, setCampaignStatuses] = useState<string[]>([]);

  const dateFilteredSpend = useMemo(() => filterAdSpendByRange(adSpendRecords, dateRange.from, dateRange.to), [adSpendRecords, dateRange]);
  const rangeSpend = useMemo(() => {
    if (campaignStatuses.length === 0) return dateFilteredSpend;
    return dateFilteredSpend.filter(r => !!r.campaignStatus && campaignStatuses.includes(r.campaignStatus));
  }, [dateFilteredSpend, campaignStatuses]);

  const totalSpend = rangeSpend.reduce((sum, r) => sum + r.spend, 0);
  const totalPlatformLeads = rangeSpend.reduce((sum, r) => sum + r.leadsGenerated, 0);
  const cpl = computeCPL(totalSpend, totalPlatformLeads);

  // Lead quality/visit-conversion/booking numbers now come from the server
  // (GET /ad-spend/marketing-report-stats) instead of computeLeadQuality/
  // computeVisitConversion/computeBookingValue/computeBookingCount over the
  // bulk leads array — spend/CPL above stay client-side, unchanged, same
  // split Campaigns' own campaign-lead-stats uses.
  const [marketingStats, setMarketingStats] = useState<MarketingReportStats>(ZERO_MARKETING_STATS);
  useEffect(() => {
    let cancelled = false;
    apiGetMarketingReportStats(dateRange.from, dateRange.to)
      .then(result => { if (!cancelled) setMarketingStats(result); })
      .catch(() => { /* leave the previous numbers showing on a transient failure */ });
    return () => { cancelled = true; };
  }, [dateRange.from, dateRange.to]);
  const { overall, byCampaign, byProperty } = marketingStats;
  const qualityPercentOf = (buyerCount: number, nonBuyerCount: number) => {
    const classified = buyerCount + nonBuyerCount;
    return classified === 0 ? 0 : (buyerCount / classified) * 100;
  };
  const quality = { buyerCount: overall.buyerCount, nonBuyerCount: overall.nonBuyerCount, qualityPercent: qualityPercentOf(overall.buyerCount, overall.nonBuyerCount) };
  const visitConversion = { convertedCount: overall.convertedCount, conversionPercent: overall.totalCount === 0 ? 0 : (overall.convertedCount / overall.totalCount) * 100 };
  const bookingValue = overall.bookingValue;
  const bookingCount = overall.bookingCount;
  const roi = computeROIMultiple(bookingValue, totalSpend);

  const byCampaignMap = useMemo(() => new Map(byCampaign.map(c => [c.campaign, c])), [byCampaign]);
  const byPropertyMap = useMemo(() => new Map(byProperty.map(p => [p.property, p])), [byProperty]);

  // Per ad account aggregation — spend/platformLeads still come from
  // adSpendRecords; lead-quality/booking numbers are looked up from the
  // server's byCampaign (exact-string campaign-name match, same as before).
  const accountRows = useMemo(() => {
    const grouped: Record<string, { platform: string; accountName: string; property?: string; spend: number; platformLeads: number }> = {};
    rangeSpend.forEach(r => {
      const key = r.accountName;
      if (!grouped[key]) grouped[key] = { platform: r.platform, accountName: r.accountName, property: r.property, spend: 0, platformLeads: 0 };
      grouped[key].spend += r.spend;
      grouped[key].platformLeads += r.leadsGenerated;
    });
    return Object.values(grouped).map(acc => {
      const matched = byCampaignMap.get(acc.accountName);
      const matchedLeadsCount = (matched?.buyerCount ?? 0) + (matched?.nonBuyerCount ?? 0);
      return {
        ...acc,
        cpl: computeCPL(acc.spend, acc.platformLeads),
        matchedLeadsCount,
        qualityPercent: matched ? qualityPercentOf(matched.buyerCount, matched.nonBuyerCount) : 0,
        hasMatchedLeads: matchedLeadsCount > 0,
        roi: computeROIMultiple(matched?.bookingValue ?? 0, acc.spend)
      };
    }).sort((a, b) => b.spend - a.spend);
  }, [rangeSpend, byCampaignMap]);

  // Property-wise aggregation — same split as accountRows above.
  const propertyRows = useMemo(() => {
    const propertyNames = Array.from(new Set([...properties.map(p => p.name), ...rangeSpend.map(r => r.property).filter(Boolean) as string[]]));
    return propertyNames.map(name => {
      const propSpendRecords = rangeSpend.filter(r => r.property === name);
      const spend = propSpendRecords.reduce((sum, r) => sum + r.spend, 0);
      const platformLeads = propSpendRecords.reduce((sum, r) => sum + r.leadsGenerated, 0);
      const matched = byPropertyMap.get(name);
      const propBookingValue = matched?.bookingValue ?? 0;
      return {
        name,
        spend,
        platformLeads,
        cpl: computeCPL(spend, platformLeads),
        crmLeadsCount: matched?.leadsCount ?? 0,
        bookingCount: matched?.bookingCount ?? 0,
        bookingValue: propBookingValue,
        roi: computeROIMultiple(propBookingValue, spend)
      };
    }).filter(row => row.spend > 0 || row.crmLeadsCount > 0).sort((a, b) => b.spend - a.spend);
  }, [properties, rangeSpend, byPropertyMap]);

  // Both tables jump back to page 1 when the date range or campaign filter changes.
  const tableResetKey = JSON.stringify([dateRange, campaignStatuses]);
  const accountPagination = usePagination(accountRows, 10, tableResetKey);
  const propertyPagination = usePagination(propertyRows, 10, tableResetKey);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Campaign filter — applies to Total Ad Spend, CPL, and every table/breakdown below */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Campaigns:</span>
        <SearchableMultiSelect
          options={CAMPAIGN_STATUS_OPTIONS}
          selected={campaignStatuses}
          onChange={setCampaignStatuses}
          placeholder="All"
          searchPlaceholder="Search status..."
          panelWidth={180}
        />
      </div>

      {/* Summary metrics: CPL, Lead Quality, Booking ROI — one unified card
          matching the Campaigns tab's Date Filter & Metrics layout (divided
          stat columns on a single card) instead of floating separate
          shadowed cards per metric. */}
      <div className="bg-slate-100/70 border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div className="p-4 flex items-center justify-between gap-2">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Ad Spend</span>
              {isDataLoading ? <LineSkeleton width={70} height={24} /> : <p className="text-xl font-black text-slate-800">{formatCurrency(totalSpend)}</p>}
            </div>
            <div className="h-9 w-9 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
              <DollarSign className="h-4.5 w-4.5" />
            </div>
          </div>

          <div className="p-4 flex items-center justify-between gap-2">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CPL (Cost per Lead)</span>
              {isDataLoading ? <LineSkeleton width={60} height={24} /> : <p className="text-xl font-black text-slate-800">{formatCurrency(cpl)}</p>}
              <span className="text-[9px] text-slate-450">{totalPlatformLeads} platform-reported leads</span>
            </div>
            <div className="h-9 w-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <Target className="h-4.5 w-4.5" />
            </div>
          </div>

          <div className="p-4 flex items-center justify-between gap-2">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lead Quality</span>
              {isDataLoading ? <LineSkeleton width={50} height={24} /> : <p className="text-xl font-black text-slate-800">{quality.qualityPercent.toFixed(1)}%</p>}
              <span className="text-[9px] text-slate-450">{quality.buyerCount} buyer-avg vs {quality.nonBuyerCount} non-buyer</span>
            </div>
            <div className="h-9 w-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
              <Gauge className="h-4.5 w-4.5" />
            </div>
          </div>

          <div className="p-4 flex items-center justify-between gap-2">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Booking-Based ROI</span>
              {isDataLoading ? <LineSkeleton width={50} height={24} /> : <p className="text-xl font-black text-slate-800">{roi.toFixed(1)}x</p>}
              <span className="text-[9px] text-slate-450">{bookingCount} bookings • {formatCurrency(bookingValue)}</span>
            </div>
            <div className="h-9 w-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-650 shrink-0">
              <TrendingUp className="h-4.5 w-4.5" />
            </div>
          </div>

          <div className="p-4 flex items-center justify-between gap-2 sm:col-span-3 lg:col-span-1">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Visit/Meeting Conversion</span>
              {isDataLoading ? <LineSkeleton width={50} height={24} /> : <p className="text-xl font-black text-slate-800">{visitConversion.conversionPercent.toFixed(1)}%</p>}
              <span className="text-[9px] text-slate-450">{visitConversion.convertedCount} of {overall.totalCount} leads</span>
            </div>
            <div className="h-9 w-9 rounded-lg bg-pink-50 border border-pink-100 flex items-center justify-center text-pink-600 shrink-0">
              <Building2 className="h-4.5 w-4.5" />
            </div>
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
              subTab === t ? "bg-[#0B1E6E] border-[#0B1E6E] text-white shadow-sm" : "bg-white border-slate-200 text-slate-500 hover:text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {subTab === "By Ad Account" && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-4">
          <h3 className="ui-section-title">Individual Ad Account Performance</h3>
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            {/* Phones: one card per ad account */}
            <ul className="sm:hidden divide-y divide-slate-100">
              {isDataLoading && accountRows.length === 0 ? (
                <CardListSkeleton count={4} />
              ) : accountRows.length === 0 ? (
                <li className="p-6 text-center text-xs text-slate-400 italic font-semibold">No ad spend recorded in this date range.</li>
              ) : (
                accountPagination.pageRows.map(acc => (
                  <li key={acc.accountName} className="p-4 space-y-3 text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-bold text-slate-800 [overflow-wrap:anywhere]">{acc.accountName}</p>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                        acc.platform === "Meta" ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-amber-50 text-amber-700 border-amber-100"
                      }`}>
                        {acc.platform}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400">Spend</span>
                        <span className="font-mono font-semibold text-slate-700">{formatCurrency(acc.spend)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400">Platform Leads</span>
                        <span className="font-mono text-slate-600">{acc.platformLeads}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400">CPL</span>
                        <span className="font-mono font-bold text-brand-700">{formatCurrency(acc.cpl)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400">Lead Quality</span>
                        {acc.hasMatchedLeads ? (
                          <span className="font-mono font-semibold text-slate-700">{acc.qualityPercent.toFixed(0)}%</span>
                        ) : (
                          <span className="text-slate-400 italic">No CRM leads</span>
                        )}
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400">Booking ROI</span>
                        <span className="font-mono font-bold text-emerald-650">{acc.hasMatchedLeads ? `${acc.roi.toFixed(1)}x` : "—"}</span>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
            <div className="hidden sm:block overflow-x-auto">
            <table className="table-fixed w-full min-w-[1050px] text-[11px] border-collapse">
              <colgroup>
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Platform</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Ad Account</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Spend</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Platform Leads</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">CPL</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Lead Quality</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Booking ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isDataLoading && accountRows.length === 0 ? (
                  <TableRowsSkeleton rows={6} columns={7} />
                ) : accountRows.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-slate-400 italic font-semibold">No ad spend recorded in this date range.</td></tr>
                ) : (
                  accountPagination.pageRows.map(acc => (
                    <tr key={acc.accountName} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                          acc.platform === "Meta" ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-amber-50 text-amber-700 border-amber-100"
                        }`}>
                          {acc.platform}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-800 [overflow-wrap:anywhere]" title={acc.accountName}>{acc.accountName}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-700">{formatCurrency(acc.spend)}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{acc.platformLeads}</td>
                      <td className="px-4 py-3 font-mono font-bold text-brand-700">{formatCurrency(acc.cpl)}</td>
                      <td className="px-4 py-3">
                        {acc.hasMatchedLeads ? (
                          <span className="font-mono font-semibold text-slate-700">{acc.qualityPercent.toFixed(0)}%</span>
                        ) : (
                          <span className="text-slate-400 italic">No CRM leads matched</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-650">
                        {acc.hasMatchedLeads ? `${acc.roi.toFixed(1)}x` : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
            <TablePagination {...accountPagination.paginationProps} rowLabel="Ad Account" />
          </div>
        </div>
      )}

      {subTab === "Overall" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-4">
            <h3 className="ui-section-title">Spend by Platform</h3>
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

          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-4">
            <h3 className="ui-section-title">Lead Quality Breakdown</h3>
            <div className="flex items-end gap-6">
              <div>
                {isDataLoading ? <LineSkeleton width={36} height={30} /> : <p className="text-3xl font-black text-emerald-600">{quality.buyerCount}</p>}
                <span className="text-[10px] text-slate-450 font-bold uppercase">Buyer-avg leads</span>
              </div>
              <div>
                {isDataLoading ? <LineSkeleton width={36} height={30} /> : <p className="text-3xl font-black text-red-500">{quality.nonBuyerCount}</p>}
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
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-4">
          <h3 className="ui-section-title flex items-center gap-1.5">
            <Building2 className="h-4 w-4 text-slate-500" />
            Property-wise Marketing Performance
          </h3>
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            {/* Phones: one card per property */}
            <ul className="sm:hidden divide-y divide-slate-100">
              {isDataLoading && propertyRows.length === 0 ? (
                <CardListSkeleton count={4} />
              ) : propertyRows.length === 0 ? (
                <li className="p-6 text-center text-xs text-slate-400 italic font-semibold">No property-linked activity in this date range.</li>
              ) : (
                propertyPagination.pageRows.map(row => (
                  <li key={row.name} className="p-4 space-y-3 text-xs">
                    <p className="font-bold text-slate-800 [overflow-wrap:anywhere]">{row.name}</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400">Spend</span>
                        <span className="font-mono text-slate-700">{formatCurrency(row.spend)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400">CRM Leads</span>
                        <span className="font-mono text-slate-600">{row.crmLeadsCount}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400">CPL</span>
                        <span className="font-mono font-bold text-brand-700">{formatCurrency(row.cpl)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400">Bookings</span>
                        <span className="font-mono text-slate-600">{row.bookingCount}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400">Booking Value</span>
                        <span className="font-mono text-slate-700">{formatCurrency(row.bookingValue)}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] font-semibold text-slate-400">ROI</span>
                        <span className="font-mono font-bold text-emerald-650">{row.roi.toFixed(1)}x</span>
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
            <div className="hidden sm:block overflow-x-auto">
            <table className="table-fixed w-full min-w-[1050px] text-[11px] border-collapse">
              <colgroup>
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Property</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Spend</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">CRM Leads</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">CPL</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Bookings</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">Booking Value</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-800 whitespace-nowrap">ROI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isDataLoading && propertyRows.length === 0 ? (
                  <TableRowsSkeleton rows={6} columns={7} />
                ) : propertyRows.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-slate-400 italic font-semibold">No property-linked activity in this date range.</td></tr>
                ) : (
                  propertyPagination.pageRows.map(row => (
                    <tr key={row.name} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-bold text-slate-800">{row.name}</td>
                      <td className="px-4 py-3 font-mono text-slate-700">{formatCurrency(row.spend)}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{row.crmLeadsCount}</td>
                      <td className="px-4 py-3 font-mono font-bold text-brand-700">{formatCurrency(row.cpl)}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{row.bookingCount}</td>
                      <td className="px-4 py-3 font-mono text-slate-700">{formatCurrency(row.bookingValue)}</td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-650">{row.roi.toFixed(1)}x</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
            <TablePagination {...propertyPagination.paginationProps} rowLabel="Property" />
          </div>
        </div>
      )}
    </div>
  );
}
