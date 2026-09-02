"use client";

import { useState } from "react";
import { Users, Compass, Calculator, CheckCircle2, MapPin, FileText, Plus, RefreshCw, UserCheck, ShieldCheck } from "lucide-react";

export default function InteractiveFeatureShowcase() {
  const [activeTabId, setActiveTabId] = useState("crm");

  // CRM Interactive State
  const [leads, setLeads] = useState([
    { id: 1, name: "Rajesh Sharma", property: "3 BHK Villa • Gurgaon", status: "Assigned: Agent Priya", source: "FB", bg: "bg-blue-50 text-blue-600", assigned: true },
    { id: 2, name: "Ananya Verma", property: "Penthouse • Golf Course Rd", status: "Unassigned", source: "WA", bg: "bg-emerald-50 text-emerald-600", assigned: false },
  ]);

  const toggleAssign = (id: number) => {
    setLeads(leads.map(l => {
      if (l.id === id) {
        return {
          ...l,
          assigned: !l.assigned,
          status: !l.assigned ? "Assigned: Agent Priya" : "Unassigned"
        };
      }
      return l;
    }));
  };

  // GPS HRMS Interactive State
  const [isInsideGeofence, setIsInsideGeofence] = useState(true);
  const [checkInTime, setCheckInTime] = useState("09:30 AM");

  // Invoicing Interactive State
  const [propertyPrice, setPropertyPrice] = useState(8500000);
  const [gstRate, setGstRate] = useState(18); // 18% standard GST

  const taxAmount = (propertyPrice * gstRate) / 100;
  const totalInvoice = propertyPrice + taxAmount;

  return (
    <section className="w-full pt-10 pb-6">
      {/* Editorial Section Header */}
      <div className="text-center max-w-2xl mx-auto mb-10">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
          Interactive Platform Demo
        </h3>
        <h4 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Try the operating system live
        </h4>
      </div>

      {/* Segmented Interactive Selector Tabs */}
      <div className="p-1.5 rounded-2xl bg-slate-200/60 border border-slate-200/90 max-w-3xl mx-auto grid grid-cols-3 gap-1.5 mb-8">
        <button
          onClick={() => setActiveTabId("crm")}
          className={`py-3 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            activeTabId === "crm"
              ? "bg-white text-slate-900 shadow-md border border-slate-200/80 scale-[1.02]"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/40"
          }`}
        >
          <Users className={`w-4 h-4 ${activeTabId === "crm" ? "text-blue-600" : "text-slate-400"}`} />
          <span className="truncate">Sales CRM</span>
        </button>

        <button
          onClick={() => setActiveTabId("hrms")}
          className={`py-3 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            activeTabId === "hrms"
              ? "bg-white text-slate-900 shadow-md border border-slate-200/80 scale-[1.02]"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/40"
          }`}
        >
          <Compass className={`w-4 h-4 ${activeTabId === "hrms" ? "text-indigo-600" : "text-slate-400"}`} />
          <span className="truncate">Field Attendance</span>
        </button>

        <button
          onClick={() => setActiveTabId("finance")}
          className={`py-3 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
            activeTabId === "finance"
              ? "bg-white text-slate-900 shadow-md border border-slate-200/80 scale-[1.02]"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/40"
          }`}
        >
          <Calculator className={`w-4 h-4 ${activeTabId === "finance" ? "text-emerald-600" : "text-slate-400"}`} />
          <span className="truncate">GST Invoicing</span>
        </button>
      </div>

      {/* Main Showcase Panel */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-10 shadow-xl shadow-slate-900/[0.04]">
        
        {/* TAB 1: CRM */}
        {activeTabId === "crm" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center text-left animate-fade-in">
            <div className="lg:col-span-6 space-y-4">
              <span className="inline-block px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
                Interactive CRM Demo
              </span>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
                Instantly assign inquiries to on-duty agents
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Click the action buttons on the live lead cards to simulate real-time agent assignment and lead routing.
              </p>
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-700 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Real-time webhook ingestion from Facebook & WhatsApp</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-700 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Automated round-robin distribution to active staff</span>
                </div>
              </div>
            </div>

            {/* Interactive Live CRM Card */}
            <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-slate-900">Live Inbound Lead Feed</span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">Interactive Panel</span>
              </div>

              <div className="space-y-3">
                {leads.map((lead) => (
                  <div key={lead.id} className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg ${lead.bg} font-bold text-xs flex items-center justify-center border border-slate-200`}>
                        {lead.source}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">{lead.name}</div>
                        <div className="text-[11px] text-slate-500">{lead.property}</div>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => toggleAssign(lead.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        lead.assigned
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                          : "bg-slate-900 text-white hover:bg-slate-800"
                      }`}
                    >
                      {lead.assigned ? "Assigned ✓" : "+ Assign Agent"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: HRMS */}
        {activeTabId === "hrms" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center text-left animate-fade-in">
            <div className="lg:col-span-6 space-y-4">
              <span className="inline-block px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold">
                Interactive Geofence Simulator
              </span>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
                Simulate GPS boundary check-in
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Test how field agents check in at property sites. Toggle the GPS status to see geofence validation in action.
              </p>
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-700 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Precise 50-meter site boundary radius verification</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-700 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Automatic log of arrival and departure timestamps</span>
                </div>
              </div>
            </div>

            {/* Interactive Live HRMS Card */}
            <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold text-slate-900">Site Telemetry Check</span>
                </div>
                <button
                  onClick={() => setIsInsideGeofence(!isInsideGeofence)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold border bg-white border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Toggle GPS Location
                </button>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-900">Grand Palm Residency Site</div>
                    <div className="text-[11px] text-slate-500">Agent: Amit Kumar • Sector 62</div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                    isInsideGeofence
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-rose-50 text-rose-700 border-rose-200"
                  }`}>
                    {isInsideGeofence ? "Inside Boundary ✓" : "Outside Zone ✖"}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs flex justify-between items-center">
                  <span>Shift Check-in: <strong>09:30 AM</strong></span>
                  <span className="text-slate-500">Status: {isInsideGeofence ? "Verified On-Site" : "Pending Boundary Check"}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: FINANCE */}
        {activeTabId === "finance" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center text-left animate-fade-in">
            <div className="lg:col-span-6 space-y-4">
              <span className="inline-block px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                Interactive Invoice Calculator
              </span>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight">
                Live GST Tax Breakdown
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Adjust the property agreement value or tax rate to see instant invoice calculations with Indian CGST + SGST tax compliance.
              </p>
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-700 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Sequential tax invoice generation for buyer bookings</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-700 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Automatic 9% CGST + 9% SGST calculation rules</span>
                </div>
              </div>
            </div>

            {/* Interactive Live Finance Card */}
            <div className="lg:col-span-6 bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-900">Tax Invoice Calculator</span>
                </div>
                <span className="text-[11px] font-semibold text-slate-600">GST Reg #07AAACT1234A</span>
              </div>

              {/* Price Preset Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-semibold">Agreement Value:</span>
                {[5000000, 8500000, 12500000].map((val) => (
                  <button
                    key={val}
                    onClick={() => setPropertyPrice(val)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                      propertyPrice === val
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    ₹{(val / 100000).toFixed(0)}L
                  </button>
                ))}
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs space-y-2 text-xs">
                <div className="flex justify-between text-slate-600 pb-1.5 border-b border-slate-100">
                  <span>Agreement Amount</span>
                  <span className="font-semibold text-slate-900">₹{propertyPrice.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-slate-600 pb-1.5 border-b border-slate-100">
                  <span>GST Tax ({gstRate}%)</span>
                  <span className="font-semibold text-slate-900">₹{taxAmount.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-slate-900 font-bold pt-1 text-sm">
                  <span>Total Tax Invoice</span>
                  <span className="text-emerald-600">₹{totalInvoice.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </section>
  );
}


