"use client";

import { useState, useEffect } from "react";
import { Zap, CheckCircle2, ShieldCheck, UserCheck, Smartphone, MessageSquare, Globe, Send, Share2 } from "lucide-react";

export default function LeadIngestionAnimation() {
  const [activeChannelId, setActiveChannelId] = useState(1);
  const [isManual, setIsManual] = useState(false);

  const channels = [
    {
      id: 0,
      name: "Facebook Lead Ads",
      subText: "OAuth 2.0 Webhook",
      icon: <Share2 className="w-5 h-5 text-blue-600" />,
      color: "#2563eb",
      borderActive: "border-blue-500 ring-2 ring-blue-500/10",
      yOffset: 30,
    },
    {
      id: 1,
      name: "WhatsApp Business API",
      subText: "Direct Inbound Chat",
      icon: <MessageSquare className="w-5 h-5 text-emerald-600" />,
      color: "#059669",
      borderActive: "border-emerald-500 ring-2 ring-emerald-500/10",
      yOffset: 105,
    },
    {
      id: 2,
      name: "Instagram Lead Forms",
      subText: "Page Webhook Event",
      icon: <Smartphone className="w-5 h-5 text-pink-600" />,
      color: "#e11d48",
      borderActive: "border-rose-500 ring-2 ring-rose-500/10",
      yOffset: 180,
    },
    {
      id: 3,
      name: "Google PPC Campaign",
      subText: "GCLID Webhook Sync",
      icon: <Globe className="w-5 h-5 text-amber-600" />,
      color: "#d97706",
      borderActive: "border-amber-500 ring-2 ring-amber-500/10",
      yOffset: 255,
    },
    {
      id: 4,
      name: "99acres & Housing",
      subText: "API Aggregator Feed",
      icon: <Send className="w-5 h-5 text-indigo-600" />,
      color: "#4f46e5",
      borderActive: "border-indigo-500 ring-2 ring-indigo-500/10",
      yOffset: 330,
    },
  ];

  const leadsMap: Record<number, any> = {
    0: {
      id: "FB-8821",
      name: "Rajesh Sharma",
      phone: "+91 98110 *****",
      property: "Grand Palm Residency (3BHK)",
      budget: "₹85.0 Lacs",
      source: "Facebook Ads",
      sourceBadgeBg: "bg-blue-50 text-blue-700 border-blue-200",
      agent: "Priya M.",
      time: "Just now",
    },
    1: {
      id: "WA-4019",
      name: "Ananya Verma",
      phone: "+91 98731 *****",
      property: "Golf Estate Penthouse",
      budget: "₹2.10 Cr",
      source: "WhatsApp Business",
      sourceBadgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200",
      agent: "Amit K.",
      time: "2m ago",
    },
    2: {
      id: "IG-9102",
      name: "Vikram Malhotra",
      phone: "+91 99580 *****",
      property: "DLF Phase 5 Luxury Villa",
      budget: "₹3.50 Cr",
      source: "Instagram Form",
      sourceBadgeBg: "bg-rose-50 text-rose-700 border-rose-200",
      agent: "Siddharth R.",
      time: "4m ago",
    },
    3: {
      id: "GP-1204",
      name: "Kavita Reddy",
      phone: "+91 97172 *****",
      property: "Purva Celestial (3BHK)",
      budget: "₹1.25 Cr",
      source: "Google PPC Ads",
      sourceBadgeBg: "bg-amber-50 text-amber-700 border-amber-200",
      agent: "Divya P.",
      time: "6m ago",
    },
    4: {
      id: "HS-5521",
      name: "Sanjay Gupta",
      phone: "+91 98450 *****",
      property: "Sobha Neopolis (2BHK)",
      budget: "₹95.0 Lacs",
      source: "Portal Aggregator",
      sourceBadgeBg: "bg-indigo-50 text-indigo-700 border-indigo-200",
      agent: "Rahul T.",
      time: "8m ago",
    },
  };

  // Auto-cycle through channels unless user manually clicked
  useEffect(() => {
    if (isManual) return;
    const interval = setInterval(() => {
      setActiveChannelId((prev) => (prev + 1) % 5);
    }, 2800);
    return () => clearInterval(interval);
  }, [isManual]);

  const activeLead = leadsMap[activeChannelId];

  const handleSelectChannel = (id: number) => {
    setIsManual(true);
    setActiveChannelId(id);
  };

  return (
    <div className="w-full max-w-5xl mx-auto my-6 relative">
      {/* 2-Column Interactive Diagram Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center min-h-[360px]">
        
        {/* Left Column: 5 Selectable Channels */}
        <div className="lg:col-span-5 space-y-3 z-10 text-left">
          {channels.map((ch) => {
            const isActive = activeChannelId === ch.id;
            return (
              <div
                key={ch.id}
                onClick={() => handleSelectChannel(ch.id)}
                className={`group relative flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                  isActive
                    ? `bg-white ${ch.borderActive} shadow-md scale-[1.02]`
                    : "bg-slate-50/70 border-slate-200/80 hover:bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="p-2.5 rounded-xl bg-white shadow-xs border border-slate-100 transition-transform group-hover:scale-110">
                    {ch.icon}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      {ch.name}
                    </div>
                    <div className="text-xs text-slate-500 font-normal mt-0.5">{ch.subText}</div>
                  </div>
                </div>

                {isActive ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-[10px] font-extrabold border border-blue-200">
                    <Zap className="w-3 h-3 text-blue-500 animate-bounce" />
                    Active
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-400 font-semibold px-2 py-0.5 rounded bg-slate-100">
                    Connect
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Center Column: SVG Curved Converging Streams */}
        <div className="hidden lg:block lg:col-span-2 relative h-[360px] pointer-events-none">
          <svg
            className="w-full h-full overflow-visible"
            viewBox="0 0 160 360"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {channels.map((ch) => {
              const isActive = activeChannelId === ch.id;
              const pathD = `M 0 ${ch.yOffset} C 80 ${ch.yOffset}, 80 180, 160 180`;
              return (
                <g key={ch.id}>
                  {/* Track Line */}
                  <path
                    d={pathD}
                    stroke={isActive ? ch.color : "#cbd5e1"}
                    strokeWidth={isActive ? "3" : "1.2"}
                    strokeDasharray={isActive ? "none" : "5 5"}
                    strokeOpacity={isActive ? "1" : "0.35"}
                    className="transition-all duration-300"
                  />

                  {/* Active Stream Particles */}
                  {isActive && (
                    <g>
                      <circle r="5" fill={ch.color}>
                        <animateMotion path={pathD} dur="1.4s" repeatCount="indefinite" />
                      </circle>
                      <circle r="9" fill={ch.color} opacity="0.4">
                        <animateMotion path={pathD} dur="1.4s" repeatCount="indefinite" />
                      </circle>
                    </g>
                  )}
                </g>
              );
            })}

            {/* Central Junction Node Dot */}
            <circle cx="160" cy="180" r="7" fill="#0a1c33" />
            <circle cx="160" cy="180" r="13" fill="#0077b6" fillOpacity="0.3" className="animate-ping" />
          </svg>
        </div>

        {/* Right Column: Clean Lead Output Stream */}
        <div className="lg:col-span-5 relative z-10 flex flex-col space-y-4 text-left">
          
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
              <h4 className="text-xs font-bold text-slate-900 tracking-wider uppercase">
                Live Ingested Lead
              </h4>
            </div>
            <span className="text-[11px] font-extrabold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              DAG Auto-Assigned
            </span>
          </div>

          {/* Active Ingested Lead Record */}
          <div
            key={activeLead.id}
            className="p-5 rounded-2xl bg-white border border-slate-200 shadow-md animate-fade-in transition-all space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shadow-md">
                  {activeLead.name.split(" ").map((n: string) => n[0]).join("")}
                </div>
                <div>
                  <div className="text-base font-bold text-slate-900">{activeLead.name}</div>
                  <div className="text-xs text-slate-500 font-medium">{activeLead.phone}</div>
                </div>
              </div>

              <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-md border ${activeLead.sourceBadgeBg}`}>
                {activeLead.source}
              </span>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between text-xs">
              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">Property Inquiry</div>
                <div className="font-bold text-slate-800">{activeLead.property}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Budget</div>
                <div className="font-extrabold text-blue-600">{activeLead.budget}</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] pt-1 text-slate-600">
              <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Phone Validated (+91)
              </span>
              <span>Assigned Agent: <strong className="text-slate-900">{activeLead.agent}</strong></span>
            </div>
          </div>

          {/* Footer Metadata */}
          <div className="pt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              OAuth 2.0 Encryption
            </span>
            <span className="flex items-center gap-1 font-bold text-slate-900">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              Instant CRM Sync
            </span>
          </div>

        </div>

      </div>
    </div>
  );
}
