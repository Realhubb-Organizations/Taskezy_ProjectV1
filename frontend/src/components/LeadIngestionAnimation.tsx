"use client";

import React, { useState, useEffect } from "react";
import { Mail, CheckCircle2, ShieldCheck, UserCheck, Zap, Sparkles } from "lucide-react";

interface Channel {
  id: number;
  name: string;
  subText: string;
  color: string;
  glowColor: string;
  bgLight: string;
  borderActive: string;
  icon: React.ReactNode;
  yOffset: number;
}

interface LeadData {
  id: number;
  name: string;
  phone: string;
  property: string;
  budget: string;
  source: string;
  sourceBadgeBg: string;
  agent: string;
  time: string;
}

export default function LeadIngestionAnimation() {
  const [activeChannelId, setActiveChannelId] = useState<number>(1);
  const [isManual, setIsManual] = useState<boolean>(false);

  const channels: Channel[] = [
    {
      id: 0,
      name: "Email Webhooks",
      subText: "Portal forms & website inquiries",
      color: "#3b82f6",
      glowColor: "rgba(59, 130, 246, 0.4)",
      bgLight: "bg-blue-50/80 text-blue-600",
      borderActive: "border-blue-500 shadow-blue-500/15",
      icon: <Mail className="w-5 h-5 text-blue-600" />,
      yOffset: 45,
    },
    {
      id: 1,
      name: "Facebook Lead Ads",
      subText: "Instant OAuth 2.0 form webhooks",
      color: "#1877f2",
      glowColor: "rgba(24, 119, 242, 0.4)",
      bgLight: "bg-blue-600/10 text-blue-700",
      borderActive: "border-blue-600 shadow-blue-600/20",
      icon: (
        <svg className="w-5 h-5 fill-[#1877f2]" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
      yOffset: 110,
    },
    {
      id: 2,
      name: "Instagram Direct",
      subText: "DM automation & story link CTAs",
      color: "#e4405f",
      glowColor: "rgba(228, 64, 95, 0.4)",
      bgLight: "bg-pink-50/80 text-pink-600",
      borderActive: "border-pink-500 shadow-pink-500/15",
      icon: (
        <svg className="w-5 h-5 fill-[#e4405f]" viewBox="0 0 24 24">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
        </svg>
      ),
      yOffset: 175,
    },
    {
      id: 3,
      name: "WhatsApp Business",
      subText: "Automated agent roster routing",
      color: "#25d366",
      glowColor: "rgba(37, 211, 102, 0.4)",
      bgLight: "bg-emerald-50/80 text-emerald-600",
      borderActive: "border-emerald-500 shadow-emerald-500/15",
      icon: (
        <svg className="w-5 h-5 fill-[#25d366]" viewBox="0 0 24 24">
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-1.151 4.204 4.294-1.127z" />
        </svg>
      ),
      yOffset: 240,
    },
    {
      id: 4,
      name: "Google PPC Ads",
      subText: "Intent-based search keyword sync",
      color: "#4285f4",
      glowColor: "rgba(66, 133, 244, 0.4)",
      bgLight: "bg-indigo-50/80 text-indigo-600",
      borderActive: "border-indigo-500 shadow-indigo-500/15",
      icon: (
        <svg className="w-5 h-5 fill-[#4285f4]" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
        </svg>
      ),
      yOffset: 305,
    },
  ];

  const leadsMap: Record<number, LeadData> = {
    0: {
      id: 0,
      name: "Anand Verma",
      phone: "+91 98450 12890",
      property: "Brigade Eternia (4BHK Villa)",
      budget: "₹1.45 Cr",
      source: "Email Portal",
      sourceBadgeBg: "bg-blue-100 text-blue-800 border-blue-200",
      agent: "Naveen N.",
      time: "Just now",
    },
    1: {
      id: 1,
      name: "Priya Sharma",
      phone: "+91 99012 34182",
      property: "Prestige Lakeview (3BHK)",
      budget: "₹95 Lac",
      source: "Facebook Lead Ads",
      sourceBadgeBg: "bg-blue-100 text-blue-800 border-blue-300",
      agent: "Anita R.",
      time: "1m ago",
    },
    2: {
      id: 2,
      name: "Rohan Mehta",
      phone: "+91 97112 88401",
      property: "Sobha Royal Pavilion",
      budget: "₹2.10 Cr",
      source: "Instagram DM",
      sourceBadgeBg: "bg-pink-100 text-pink-800 border-pink-200",
      agent: "Vikram S.",
      time: "3m ago",
    },
    3: {
      id: 3,
      name: "Kavita Reddy",
      phone: "+91 98860 41230",
      property: "Godrej Woodscapes (3.5BHK)",
      budget: "₹1.80 Cr",
      source: "WhatsApp Biz",
      sourceBadgeBg: "bg-emerald-100 text-emerald-800 border-emerald-200",
      agent: "Suresh M.",
      time: "4m ago",
    },
    4: {
      id: 4,
      name: "Siddharth Rao",
      phone: "+91 96200 99451",
      property: "Purva Celestial (3BHK)",
      budget: "₹1.25 Cr",
      source: "Google PPC Ads",
      sourceBadgeBg: "bg-indigo-100 text-indigo-800 border-indigo-200",
      agent: "Divya P.",
      time: "6m ago",
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

  const activeChannel = channels.find((c) => c.id === activeChannelId) || channels[1];
  const activeLead = leadsMap[activeChannelId];

  const handleSelectChannel = (id: number) => {
    setIsManual(true);
    setActiveChannelId(id);
  };

  return (
    <div className="w-full max-w-5xl mx-auto my-6 relative">
      {/* 2-Column Interactive Diagram Grid (100% Card-Less Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center min-h-[360px]">
        
        {/* Left Column: 5 Selectable Channels */}
        <div className="lg:col-span-5 space-y-3 z-10">
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
                  <div className="p-2.5 rounded-xl bg-white shadow-sm border border-slate-100 transition-transform group-hover:scale-110">
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
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand-50 text-brand-700 text-[10px] font-extrabold border border-brand-200">
                    <Zap className="w-3 h-3 text-brand-500 animate-bounce" />
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

        {/* Right Column: Clean Lead Output Stream (Card-Less Layout) */}
        <div className="lg:col-span-5 relative z-10 flex flex-col space-y-4">
          
          {/* Header Bar */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
              <h4 className="text-sm font-black text-brand-700 tracking-wider uppercase">
                Live Lead Output
              </h4>
            </div>
            <span className="text-[11px] font-extrabold px-3 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
              DAG Auto-Assigned
            </span>
          </div>

          {/* Active Ingested Lead Record (Cardless Element) */}
          <div
            key={activeLead.id}
            className="p-5 rounded-2xl bg-white border border-brand-200 shadow-md animate-fade-in transition-all space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-brand-700 text-white font-black text-xs flex items-center justify-center shadow-md">
                  {activeLead.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div>
                  <div className="text-base font-black text-slate-900">{activeLead.name}</div>
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
                <div className="font-extrabold text-brand-700">{activeLead.budget}</div>
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
              <ShieldCheck className="w-4 h-4 text-brand-600" />
              OAuth 2.0 Encryption
            </span>
            <span className="flex items-center gap-1 font-bold text-brand-700">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              Instant CRM Sync
            </span>
          </div>

        </div>

      </div>
    </div>
  );
}
