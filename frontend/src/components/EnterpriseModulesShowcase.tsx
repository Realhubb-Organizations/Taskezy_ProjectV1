"use client";

import { useState, useEffect } from "react";
import { Users, Compass, Calculator, CheckCircle2, MapPin, FileCheck, ShieldCheck, ArrowRight } from "lucide-react";

// Count-up animation helper hook
function useCountUp(endValue: number, activeTab: number, duration = 1200, decimals = 0) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
    let startTimestamp: number | null = null;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeOutQuad = 1 - (1 - progress) * (1 - progress);
      const current = easeOutQuad * endValue;

      setCount(current);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [endValue, activeTab, duration]);

  return count.toFixed(decimals);
}

export default function EnterpriseModulesShowcase() {
  const [activeTab, setActiveTab] = useState(0);
  const [activeStage, setActiveStage] = useState(2);
  const [isHovered, setIsHovered] = useState(false);

  // Animated KPI metrics for active tab view
  const animatedLeads = useCountUp(142, activeTab, 1200);
  const animatedConversions = useCountUp(28.4, activeTab, 1400, 1);

  const animatedStaff = useCountUp(12, activeTab, 1200);
  const animatedGst = useCountUp(18, activeTab, 1000);
  const animatedInv1 = useCountUp(118000, activeTab, 1400);
  const animatedInv2 = useCountUp(88500, activeTab, 1400);

  // Auto-cycle tabs smoothly every 5s unless user is hovering
  useEffect(() => {
    if (isHovered) return;
    const interval = setInterval(() => {
      setActiveTab((prev) => (prev + 1) % 3);
    }, 5000);
    return () => clearInterval(interval);
  }, [isHovered]);

  const tabs = [
    {
      id: 0,
      title: "Sales CRM Pipeline",
      sub: "Lead Tracking & Deal Progression",
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: 1,
      title: "Field Workforce HRMS",
      sub: "Geofenced Check-ins & Attendance",
      icon: <Compass className="w-4 h-4" />,
    },
    {
      id: 2,
      title: "Billing & Compliance",
      sub: "Automated GST Invoices & Audits",
      icon: <Calculator className="w-4 h-4" />,
    },
  ];

  const stages = [
    { id: 0, num: "Stage 01", name: "Inquiry Received", count: 48 },
    { id: 1, num: "Stage 02", name: "Phone Verified", count: 32 },
    { id: 2, num: "Stage 03", name: "Agent Assigned", count: 28 },
    { id: 3, num: "Stage 04", name: "Site Visit Done", count: 19 },
    { id: 4, num: "Stage 05", name: "Booking Confirmed", count: 15 },
  ];

  const leadRecords = [
    {
      id: 1,
      stageId: 4,
      name: "Anand Verma",
      avatar: "AV",
      source: "Meta Lead Ads",
      sourceBg: "bg-blue-50 text-blue-600 border-blue-200",
      project: "Brigade Eternia (4BHK Villa)",
      budget: "₹1.45 Cr",
      agent: "Naveen N. (Senior Lead)",
      status: "Booking Confirmed",
      statusBg: "bg-emerald-50 text-emerald-700 border-emerald-200"
    },
    {
      id: 2,
      stageId: 3,
      name: "Priya Sharma",
      avatar: "PS",
      source: "Instagram Direct",
      sourceBg: "bg-pink-50 text-pink-600 border-pink-200",
      project: "Prestige Lakeview (3BHK)",
      budget: "₹95 Lac",
      agent: "Anita R. (Property Advisor)",
      status: "Site Visit Scheduled",
      statusBg: "bg-blue-50 text-blue-700 border-blue-200"
    },
    {
      id: 3,
      stageId: 2,
      name: "Rajesh K. Mehta",
      avatar: "RM",
      source: "Google PPC",
      sourceBg: "bg-indigo-50 text-indigo-600 border-indigo-200",
      project: "Sobha Neopolis (2BHK)",
      budget: "₹82 Lac",
      agent: "Vikram S. (Sales Specialist)",
      status: "Agent Contacted",
      statusBg: "bg-sky-50 text-sky-700 border-sky-200"
    },
    {
      id: 4,
      stageId: 1,
      name: "Sanjana Rao",
      avatar: "SR",
      source: "WhatsApp Direct",
      sourceBg: "bg-emerald-50 text-emerald-600 border-emerald-200",
      project: "Godrej Woodscapes (3BHK)",
      budget: "₹1.10 Cr",
      agent: "Rohan M. (Lead Associate)",
      status: "Phone Verified",
      statusBg: "bg-purple-50 text-purple-700 border-purple-200"
    }
  ];

  return (
    <section
      className="w-full max-w-5xl mx-auto my-10 relative px-4 text-left"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="text-center mb-8 space-y-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-50/80 border border-blue-200 text-blue-600 text-xs font-extrabold tracking-wider uppercase shadow-xs">
          <span>Unified Real Estate OS</span>
        </div>
        
        <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
          Everything Your Sales &amp; Field Teams Need
        </h2>
        
        <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto font-normal leading-relaxed">
          Streamline leads, verify field site visits in real time, and auto-generate GST-compliant billing from one intuitive cockpit.
        </p>
      </div>

      {/* Interactive Segmented Light Glass Tab Selector */}
      <div className="bg-white/90 backdrop-blur-xl p-1.5 rounded-xl border border-slate-200/90 max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-1.5 mb-5 shadow-xs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-3 p-2.5 rounded-lg text-left transition-all duration-300 cursor-pointer ${
                isActive
                  ? "bg-blue-600 text-white shadow-xs shadow-blue-500/20 border border-blue-500 scale-[1.01]"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
              }`}
            >
              <div
                className={`p-2 rounded-md transition-colors ${
                  isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {tab.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs sm:text-sm font-bold tracking-tight flex items-center justify-between">
                  <span>{tab.title}</span>
                  {isActive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />}
                </div>
                <div className={`text-[11px] truncate mt-0.5 font-normal ${isActive ? "text-blue-100" : "text-slate-500"}`}>
                  {tab.sub}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Compact Light Sky Blue Cockpit Container */}
      <div className="bg-gradient-to-b from-white via-blue-50/20 to-slate-50/40 border border-slate-200/90 rounded-3xl p-5 sm:p-7 shadow-lg text-slate-900 relative overflow-hidden">
        
        {/* Soft Ambient Background Blur */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl pointer-events-none -z-0" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-sky-300/10 rounded-full blur-3xl pointer-events-none -z-0" />

        {/* Cockpit Header */}
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-200/80">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold shadow-xs shrink-0 border border-blue-200">
              {activeTab === 0 && <Users className="w-4 h-4" />}
              {activeTab === 1 && <Compass className="w-4 h-4" />}
              {activeTab === 2 && <Calculator className="w-4 h-4" />}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                  {activeTab === 0 && "Sales CRM & Multi-Channel Pipeline"}
                  {activeTab === 1 && "Field Workforce & Location Tracking"}
                  {activeTab === 2 && "GST Invoicing & Audit Ledgers"}
                </h3>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 font-normal mt-0.5">
                {activeTab === 0 && "Instantly capture buyer inquiries from Meta Ads, Instagram & WhatsApp directly to assigned sales agents."}
                {activeTab === 1 && "Verify field agent site attendance with high-precision GPS geofencing perimeter checks."}
                {activeTab === 2 && "Automate GST (18%) invoice splits, buyer PAN verifications, and audit ledger generation."}
              </p>
            </div>
          </div>
        </div>

        {/* TAB 0: CRM PIPELINE */}
        {activeTab === 0 && (
          <div className="relative z-10 space-y-4 animate-fade-in">
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {stages.map((stg) => {
                const isActive = activeStage === stg.id;
                return (
                  <button
                    key={stg.id}
                    onClick={() => setActiveStage(stg.id)}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      isActive
                        ? "bg-white border-blue-500 shadow-sm text-blue-700 font-bold"
                        : "bg-white/60 border-slate-200 text-slate-600 hover:bg-white"
                    }`}
                  >
                    <div className="text-[10px] text-slate-400 font-bold uppercase">{stg.num}</div>
                    <div className="text-xs font-bold truncate mt-0.5">{stg.name}</div>
                    <div className="text-[11px] font-extrabold text-blue-600 mt-1">{stg.count} Leads</div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              {leadRecords.map((lead) => (
                <div key={lead.id} className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
                      {lead.avatar}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-extrabold text-slate-900">{lead.name}</h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${lead.sourceBg}`}>
                          {lead.source}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {lead.project} • Budget: <strong className="text-blue-600 font-bold">{lead.budget}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end text-xs">
                    <span className="text-[11px] text-slate-500 font-medium">Assigned: <strong className="text-slate-800">{lead.agent}</strong></span>
                    <span className={`px-2.5 py-1 rounded-full font-bold text-[11px] border ${lead.statusBg}`}>
                      {lead.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 1: FIELD WORKFORCE HRMS */}
        {activeTab === 1 && (
          <div className="relative z-10 space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="bg-white border border-slate-200/80 p-4 rounded-xl shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Active Field Agents</div>
                <div className="text-2xl font-black text-slate-900 tracking-tight">{animatedStaff} On Duty</div>
                <div className="text-[11px] font-bold text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 100% Checked In Today
                </div>
              </div>

              <div className="bg-white border border-slate-200/80 p-4 rounded-xl shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Geofence Boundary Radius</div>
                <div className="text-2xl font-black text-blue-600 tracking-tight">50 Meters</div>
                <div className="text-[11px] font-medium text-slate-500 mt-1">High-Precision GPS Perimeter Check</div>
              </div>

              <div className="bg-white border border-slate-200/80 p-4 rounded-xl shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Timesheet Regularization</div>
                <div className="text-2xl font-black text-slate-900 tracking-tight">Automated</div>
                <div className="text-[11px] font-bold text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Admin Audit Approval
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
                    NK
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900">Naveen Kumar (Senior Agent)</h4>
                    <div className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1.5">
                      <span>Brigade Eternia Site</span>
                      <span>&bull;</span>
                      <span>Check-in: <strong className="text-slate-900 font-bold">09:15 AM</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end text-xs">
                  <div className="text-right">
                    <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> Inside project perimeter (14m)
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-[11px] border border-emerald-200">
                    Verified On-Site
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
                    AR
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900">Anita R. (Property Advisor)</h4>
                    <div className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1.5">
                      <span>Prestige Lakeview Site</span>
                      <span>&bull;</span>
                      <span>Check-in: <strong className="text-slate-900 font-bold">09:30 AM</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end text-xs">
                  <div className="text-right">
                    <div className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> Inside project perimeter (38m)
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-extrabold text-[11px] border border-emerald-200">
                    Verified On-Site
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: BILLING & COMPLIANCE */}
        {activeTab === 2 && (
          <div className="relative z-10 space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="bg-white border border-slate-200/80 p-4 rounded-xl shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">GST Billing Rate</div>
                <div className="text-2xl font-black text-slate-900 tracking-tight">{animatedGst}% Standard</div>
                <div className="text-[11px] font-medium text-slate-500 mt-1">Auto CGST (9%) + SGST (9%) Split</div>
              </div>

              <div className="bg-white border border-slate-200/80 p-4 rounded-xl shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">KYC Verification</div>
                <div className="text-2xl font-black text-emerald-600 tracking-tight">PAN &amp; Aadhaar</div>
                <div className="text-[11px] font-bold text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> NSDL Database Verified
                </div>
              </div>

              <div className="bg-white border border-slate-200/80 p-4 rounded-xl shadow-xs">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Audit Compliance</div>
                <div className="text-2xl font-black text-slate-900 tracking-tight">100% Compliant</div>
                <div className="text-[11px] font-bold text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Export Ready for CA Audit
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                    <FileCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900">#INV-2026-0892</h4>
                    <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                      Client: <strong className="text-slate-900 font-bold">Anand Verma</strong> (Brigade Eternia Villa)
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-5 w-full sm:w-auto justify-between sm:justify-end text-xs">
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500">Booking Advance: ₹1,00,000</div>
                    <div className="text-emerald-600 font-bold text-[11px]">+₹18,000 GST (18%)</div>
                  </div>
                  <div className="text-right font-black text-slate-900 text-base">
                    ₹{animatedInv1.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                    <FileCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900">#INV-2026-0893</h4>
                    <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                      Client: <strong className="text-slate-900 font-bold">Priya Sharma</strong> (Prestige Lakeview)
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-5 w-full sm:w-auto justify-between sm:justify-end text-xs">
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500">Booking Advance: ₹75,000</div>
                    <div className="text-emerald-600 font-bold text-[11px]">+₹13,500 GST (18%)</div>
                  </div>
                  <div className="text-right font-black text-slate-900 text-base">
                    ₹{animatedInv2.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cockpit Footer CTAs */}
        <div className="relative z-10 mt-5 pt-4 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-600 gap-3">
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>End-to-End Data Encryption &amp; Audit Trail Protection</span>
          </div>

          <a
            href="/auth/login"
            className="font-bold bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg transition-all shadow-xs flex items-center gap-1.5 shrink-0 text-xs"
          >
            <span>Explore Enterprise Platform</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>

      </div>
    </section>
  );
}
